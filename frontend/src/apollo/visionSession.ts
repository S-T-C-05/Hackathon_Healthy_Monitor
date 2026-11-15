/**
 * Camera analysis loop without React: same pipeline as vision/useVision.ts
 * (face landmarks -> fatigue, head pose, rPPG pulse, optional expression, overlay),
 * with a callback instead of React state. Everything runs in the browser.
 */
import { detectFrame, loadFaceLandmarker } from "../vision/faceLandmarker";
import { FatigueTracker, type FatigueStats } from "../vision/fatigue";
import { detectExpression, loadExpression, type ExpressionResult } from "../vision/expression";
import { SessionAggregator, computeFatigueScore, fatigueLevel, type SessionSummary } from "../vision/aggregate";
import { HeadPoseTracker, headPoseFromMatrix, type HeadPoseState } from "../vision/headpose";
import { RppgTracker, createRoiContext, foreheadROI, roiGreenMean, type RppgResult, type Roi } from "../vision/rppg";
import { FaceOverlay } from "../vision/overlay";
import type { VisionSnapshot, VisionStatus, HeartState } from "../vision/useVision";

export type { VisionSnapshot, VisionStatus, SessionSummary };

const EMOTION_EVERY_N_FRAMES = 8;
const SNAPSHOT_EVERY_MS = 250;
const RPPG_EVERY_MS = 1000;
const RPPG_GAP_RESET_MS = 1000;
const BPM_HISTORY = 5;

const SUPPORTS_RVFC =
  typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class VisionSession {
  status: VisionStatus = "idle";
  error: string | null = null;
  emotionEnabled = false;
  meshEnabled = false;
  /** Called about 4 times per second while running. */
  onSnapshot: ((s: VisionSnapshot) => void) | null = null;
  onStatus: ((s: VisionStatus, error: string | null) => void) | null = null;

  private tracker = new FatigueTracker();
  private aggregator = new SessionAggregator();
  private head = new HeadPoseTracker();
  private rppg = new RppgTracker();
  private roiCtx: CanvasRenderingContext2D | null = null;
  private heartResult: RppgResult | null = null;
  private bpmHistory: number[] = [];
  private lastRppg = 0;
  private lastFace: number | null = null;
  private video: HTMLVideoElement | null = null;
  private frameHandle: { cancel: () => void } | null = null;
  private overlay: FaceOverlay | null = null;
  private frame = 0;
  private emotionBusy = false;
  private expression: ExpressionResult | null = null;
  private lastSnap = 0;

  /** Median of the last reliable pulse readings (null until there is one). */
  get stableBpm(): number | null {
    return this.bpmHistory.length ? median(this.bpmHistory) : null;
  }

  get heartReliable(): boolean {
    return !!this.heartResult?.reliable && this.bpmHistory.length > 0;
  }

  private setStatus(s: VisionStatus, error: string | null = null) {
    this.status = s;
    this.error = error;
    this.onStatus?.(s, error);
  }

  private processFrame(video: HTMLVideoElement, now: number) {
    try {
      const result = video.readyState >= 2 && video.videoWidth > 0 ? detectFrame(video, now) : null;

      let stats: FatigueStats | null = null;
      let head: HeadPoseState | null = null;
      let roi: Roi | null = null;
      if (result) {
        const aspect = video.videoWidth / video.videoHeight;
        stats = this.tracker.update(result.faceLandmarks[0], now, aspect);
        const matrix = result.facialTransformationMatrixes?.[0]?.data;
        if (matrix) head = this.head.update(headPoseFromMatrix(matrix), now);

        // Pulse (rPPG): green channel of the forehead. A gap in the face means a gap in the signal.
        if (this.lastFace !== null && now - this.lastFace > RPPG_GAP_RESET_MS) {
          this.rppg.reset();
          this.heartResult = null;
        }
        this.lastFace = now;
        this.roiCtx ??= createRoiContext();
        roi = foreheadROI(result.faceLandmarks[0], video.videoWidth, video.videoHeight);
        if (roi) this.rppg.push(roiGreenMean(this.roiCtx, video, roi), now);

        if (now - this.lastRppg >= RPPG_EVERY_MS) {
          this.lastRppg = now;
          const hr = this.rppg.estimate();
          this.heartResult = hr;
          if (hr?.reliable) {
            this.bpmHistory.push(hr.bpm);
            if (this.bpmHistory.length > BPM_HISTORY) this.bpmHistory.shift();
          }
        }
      }

      if (this.overlay) {
        const heartOk = this.heartReliable;
        this.overlay.draw(video, result ? result.faceLandmarks[0] : null, {
          eyesClosed: stats?.closed ?? false,
          yawning: stats?.yawning ?? false,
          attentionAlert: !!(head?.headDown || head?.lookingAway),
          roi,
          roiLabel: heartOk ? `${Math.round(median(this.bpmHistory))} bpm` : "pulse",
          roiReliable: heartOk,
          showMesh: this.meshEnabled,
        });
      }

      this.frame++;
      if (this.emotionEnabled && !this.emotionBusy && this.frame % EMOTION_EVERY_N_FRAMES === 0) {
        this.emotionBusy = true;
        detectExpression(video)
          .then((r) => {
            this.expression = r;
          })
          .catch((e) => console.warn("[vision] expression error", e))
          .finally(() => {
            this.emotionBusy = false;
          });
      }

      if (now - this.lastSnap >= SNAPSHOT_EVERY_MS) {
        this.lastSnap = now;
        const score = stats ? computeFatigueScore(stats) : null;
        const expression = this.emotionEnabled && result ? this.expression : null;
        const heart: HeartState | null = result
          ? { result: this.heartResult, bpm: this.stableBpm, progress: this.rppg.progress() }
          : null;
        this.aggregator.add(now, stats, score, expression?.emotion ?? null, head, this.heartResult);
        this.onSnapshot?.({
          faceDetected: !!result,
          stats,
          fatigueScore: score,
          fatigueLevel: score === null ? null : fatigueLevel(score),
          expression,
          head,
          heart,
        });
      }
    } catch (e) {
      console.warn("[vision] frame error", e); // one bad frame must not stop the loop
    }
  }

  private scheduleNext() {
    const video = this.video;
    if (!video) return; // stop() was called
    if (SUPPORTS_RVFC) {
      const id = video.requestVideoFrameCallback((_now, meta) => {
        this.processFrame(video, meta.captureTime ?? meta.expectedDisplayTime);
        this.scheduleNext();
      });
      this.frameHandle = { cancel: () => video.cancelVideoFrameCallback(id) };
    } else {
      const id = requestAnimationFrame(() => {
        this.processFrame(video, performance.now());
        this.scheduleNext();
      });
      this.frameHandle = { cancel: () => cancelAnimationFrame(id) };
    }
  }

  private cancelLoop() {
    this.frameHandle?.cancel();
    this.frameHandle = null;
  }

  /** The video must already be playing. Downloads the face model the first time (needs internet). */
  async start(video: HTMLVideoElement, overlayCanvas?: HTMLCanvasElement | null): Promise<boolean> {
    this.cancelLoop();
    this.overlay = overlayCanvas ? new FaceOverlay(overlayCanvas) : null;
    try {
      this.setStatus("loading");
      this.video = video;
      this.tracker.reset();
      this.aggregator.reset();
      this.head.reset();
      this.rppg.reset();
      this.heartResult = null;
      this.bpmHistory = [];
      this.lastFace = null;
      this.expression = null;
      await loadFaceLandmarker();
      if (this.video !== video) return false; // stopped while the model was loading
      this.setStatus("running");
      this.scheduleNext();
      return true;
    } catch (e) {
      this.video = null;
      this.setStatus("error", e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /** Summary so far, without stopping (for a report taken while the camera is still on). */
  peekSummary(): SessionSummary {
    return this.aggregator.summary();
  }

  /** Stops the loop and returns the summary of the session. */
  stop(): SessionSummary {
    this.cancelLoop();
    this.overlay?.clear();
    this.overlay = null;
    this.video = null;
    this.setStatus("idle");
    return this.aggregator.summary();
  }

  async enableEmotion(on: boolean): Promise<void> {
    if (!on) {
      this.emotionEnabled = false;
      this.expression = null;
      return;
    }
    await loadExpression(); // throws if the model cannot be downloaded
    this.emotionEnabled = true;
  }

  enableMesh(on: boolean) {
    this.meshEnabled = on;
  }

  recalibrateHead() {
    this.head.recalibrate();
  }
}
