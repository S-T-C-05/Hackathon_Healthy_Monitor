import { useCallback, useEffect, useRef, useState } from "react";
import { detectFrame, loadFaceLandmarker } from "./faceLandmarker";
import { FatigueTracker, type FatigueStats } from "./fatigue";
import { detectExpression, loadExpression, type ExpressionResult } from "./expression";
import { SessionAggregator, computeFatigueScore, fatigueLevel, type SessionSummary } from "./aggregate";
import { HeadPoseTracker, headPoseFromMatrix, type HeadPoseState } from "./headpose";
import { RppgTracker, createRoiContext, foreheadROI, roiGreenMean, type RppgResult, type Roi } from "./rppg";
import { FaceOverlay } from "./overlay";

export interface HeartState {
  result: RppgResult | null; // última estimación (puede no ser confiable)
  bpm: number | null;        // mediana de las últimas lecturas confiables (más estable para mostrar)
  progress: number;          // 0..1 hacia la primera estimación (~6 s)
}

export type VisionStatus = "idle" | "loading" | "running" | "error";

export interface VisionSnapshot {
  faceDetected: boolean;
  stats: FatigueStats | null;
  fatigueScore: number | null;
  fatigueLevel: "bajo" | "medio" | "alto" | null;
  expression: ExpressionResult | null;
  head: HeadPoseState | null;
  heart: HeartState | null;
}

const EMOTION_EVERY_N_FRAMES = 8;
const SNAPSHOT_EVERY_MS = 250;
const RPPG_EVERY_MS = 1000;    // la DFT cuesta un poco: estimar 1 vez por segundo basta
const RPPG_GAP_RESET_MS = 1000; // si se pierde la cara > 1 s, la señal ya no sirve: reiniciar
const BPM_HISTORY = 5;          // lecturas confiables para la mediana

// requestVideoFrameCallback: se llama UNA vez por cada frame real de la cámara (con su hora de captura).
// requestAnimationFrame va al ritmo de la pantalla (60+ Hz) y procesaría frames repetidos.
const SUPPORTS_RVFC = typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function useVision() {
  // --- refs: lo que usa el loop (no causan re-render y no se quedan "viejos") ---
  const trackerRef = useRef(new FatigueTracker());
  const aggregatorRef = useRef(new SessionAggregator());
  const headRef = useRef(new HeadPoseTracker());
  const rppgRef = useRef(new RppgTracker());
  const roiCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const heartResultRef = useRef<RppgResult | null>(null);
  const bpmHistoryRef = useRef<number[]>([]);
  const lastRppgRef = useRef(0);
  const lastFaceRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameHandleRef = useRef<{ cancel: () => void } | null>(null); // para cancelar el siguiente frame
  const overlayRef = useRef<FaceOverlay | null>(null);
  const showMeshRef = useRef(false); // la malla empieza apagada
  const frameRef = useRef(0);
  const emotionOnRef = useRef(false);
  const emotionBusyRef = useRef(false); // evita lanzar otra detección si la anterior no termina
  const expressionRef = useRef<ExpressionResult | null>(null);
  const lastSnapRef = useRef(0);

  // --- estado: lo que se pinta en pantalla ---
  const [status, setStatus] = useState<VisionStatus>("idle");
  const [snapshot, setSnapshot] = useState<VisionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emotionEnabled, setEmotionEnabled] = useState(false);
  const [meshEnabled, setMeshEnabled] = useState(false);
  

  /** Procesa UN frame. `now` = hora de captura del frame (misma base que performance.now()) */
  const processFrame = useCallback((video: HTMLVideoElement, now: number) => {
    try {
      // 1. Detectar (solo si el video ya tiene imagen)
      const result = video.readyState >= 2 && video.videoWidth > 0 ? detectFrame(video, now) : null;

      // 2. Si hay cara, actualizar fatiga y postura de la cabeza
      let stats: FatigueStats | null = null;
      let head: HeadPoseState | null = null;
      let roi: Roi | null = null;
      if (result) {
        const aspect = video.videoWidth / video.videoHeight;
        stats = trackerRef.current.update(result.faceLandmarks[0], now, aspect);

        const matrix = result.facialTransformationMatrixes?.[0]?.data;
        if (matrix) head = headRef.current.update(headPoseFromMatrix(matrix), now);
      }

      // 2b. Pulso (rPPG): canal verde de la frente
      if (result) {
        // Si la cara se perdió un rato, la señal tiene un hueco: empezar de nuevo
        if (lastFaceRef.current !== null && now - lastFaceRef.current > RPPG_GAP_RESET_MS) {
          rppgRef.current.reset();
          heartResultRef.current = null;
        }
        lastFaceRef.current = now;

        roiCtxRef.current ??= createRoiContext();
        roi = foreheadROI(result.faceLandmarks[0], video.videoWidth, video.videoHeight);
        if (roi) rppgRef.current.push(roiGreenMean(roiCtxRef.current, video, roi), now);

        if (now - lastRppgRef.current >= RPPG_EVERY_MS) {
          lastRppgRef.current = now;
          const hr = rppgRef.current.estimate();
          heartResultRef.current = hr;
          if (hr?.reliable) {
            bpmHistoryRef.current.push(hr.bpm);
            if (bpmHistoryRef.current.length > BPM_HISTORY) bpmHistoryRef.current.shift();
          }
        }
      }

      // 2c. Overlay: malla y zonas de medición en CADA frame (en el snapshot de 4 Hz se vería a tirones)
      const overlay = overlayRef.current;
      if (overlay) {
        const heartOk = !!heartResultRef.current?.reliable && bpmHistoryRef.current.length > 0;
        overlay.draw(video, result ? result.faceLandmarks[0] : null, {
          eyesClosed: stats?.closed ?? false,
          yawning: stats?.yawning ?? false,
          attentionAlert: !!(head?.headDown || head?.lookingAway),
          roi,
          roiLabel: heartOk ? `pulso ${Math.round(median(bpmHistoryRef.current))} bpm` : "pulso",
          roiReliable: heartOk,
          showMesh: showMeshRef.current,
        });
      }

      // 3. Cada N frames y si está activa: expresión (async, sin await para no bloquear)
      frameRef.current++;
      if (emotionOnRef.current && !emotionBusyRef.current && frameRef.current % EMOTION_EVERY_N_FRAMES === 0) {
        emotionBusyRef.current = true;
        detectExpression(video)
          .then((r) => { expressionRef.current = r; })
          .catch((e) => console.warn("[useVision] expression error", e))
          .finally(() => { emotionBusyRef.current = false; });
      }

      // 4. Cada ~250 ms: guardar en el aggregator y actualizar la UI
      if (now - lastSnapRef.current >= SNAPSHOT_EVERY_MS) {
        lastSnapRef.current = now;
        const score = stats ? computeFatigueScore(stats) : null;
        const expression = emotionOnRef.current && result ? expressionRef.current : null;
        const heart: HeartState | null = result
          ? {
              result: heartResultRef.current,
              bpm: bpmHistoryRef.current.length ? median(bpmHistoryRef.current) : null,
              progress: rppgRef.current.progress(),
            }
          : null;
        aggregatorRef.current.add(now, stats, score, expression?.emotion ?? null, head, heartResultRef.current);
        setSnapshot({
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
      // Un frame fallido no debe matar todo el loop
      console.warn("[useVision] frame error", e);
    }
  }, []);

  /** 5. Agenda el siguiente frame: uno por cada frame NUEVO de la cámara */
  const scheduleNext = useCallback(() => {
    const video = videoRef.current;
    if (!video) return; // se llamó stop()

    if (SUPPORTS_RVFC) {
      const id = video.requestVideoFrameCallback((_displayNow, meta) => {
        // captureTime = cuándo la cámara tomó la foto (lo más preciso para el pulso);
        // algunos navegadores no lo dan -> usar cuándo se va a mostrar.
        processFrame(video, meta.captureTime ?? meta.expectedDisplayTime);
        scheduleNext();
      });
      frameHandleRef.current = { cancel: () => video.cancelVideoFrameCallback(id) };
    } else {
      // Respaldo para navegadores viejos
      const id = requestAnimationFrame(() => {
        processFrame(video, performance.now());
        scheduleNext();
      });
      frameHandleRef.current = { cancel: () => cancelAnimationFrame(id) };
    }
  }, [processFrame]);

  const cancelLoop = useCallback(() => {
    frameHandleRef.current?.cancel();
    frameHandleRef.current = null;
  }, []);

  /** @param overlayCanvas canvas transparente encima del video para dibujar la malla (opcional) */
  const start = useCallback(async (video: HTMLVideoElement, overlayCanvas?: HTMLCanvasElement | null) => {
    // Evitar dos loops al mismo tiempo (doble click, StrictMode, etc.)
    cancelLoop();
    overlayRef.current = overlayCanvas ? new FaceOverlay(overlayCanvas) : null;

    try {
      setStatus("loading");
      setError(null);
      videoRef.current = video;
      trackerRef.current.reset();
      aggregatorRef.current.reset();
      headRef.current.reset();
      rppgRef.current.reset();
      heartResultRef.current = null;
      bpmHistoryRef.current = [];
      lastFaceRef.current = null;
      await loadFaceLandmarker();
      setStatus("running");
      scheduleNext();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cancelLoop, scheduleNext]);

  /** Detiene el loop y regresa el resumen de la sesión */
  const stop = useCallback((): SessionSummary => {
    cancelLoop();
    overlayRef.current?.clear();
    overlayRef.current = null;
    videoRef.current = null;
    setStatus("idle");
    return aggregatorRef.current.summary();
  }, [cancelLoop]);

  /** Activa/desactiva la detección de emociones (la 1ª vez descarga el modelo) */
  const enableEmotion = useCallback(async (on = true) => {
    if (!on) {
      emotionOnRef.current = false;
      expressionRef.current = null;
      setEmotionEnabled(false);
      return;
    }
    try {
      await loadExpression();
      emotionOnRef.current = true;
      setEmotionEnabled(true);
    } catch (e) {
      setError("No se pudo cargar el modelo de emociones: " + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  /** Vuelve a tomar la postura base de la cabeza (mirar a la pantalla ~2.5 s) */
  const recalibrateHead = useCallback(() => headRef.current.recalibrate(), []);

  // Si el componente se desmonta, detener el loop
  useEffect(() => () => { stop(); }, [stop]);

  /** Muestra/oculta malla + óvalo + labios (ojos y caja de la frente siempre; alertas en naranja siempre) */
  const enableMesh = useCallback((on: boolean) => {
    showMeshRef.current = on;
    setMeshEnabled(on);
  }, []);

  return {
    status, snapshot, error, emotionEnabled, meshEnabled,
    start, stop, enableEmotion, enableMesh, recalibrateHead,
  };

  
}
