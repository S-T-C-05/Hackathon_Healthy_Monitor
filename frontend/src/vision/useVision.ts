import { useCallback, useEffect, useRef, useState } from "react";
import { detectFrame, loadFaceLandmarker } from "./faceLandmarker";
import { FatigueTracker, type FatigueStats } from "./fatigue";
import { detectExpression, loadExpression, type ExpressionResult } from "./expression";
import { SessionAggregator, computeFatigueScore, fatigueLevel, type SessionSummary } from "./aggregate";
import { HeadPoseTracker, headPoseFromMatrix, type HeadPoseState } from "./headpose";

export type VisionStatus = "idle" | "loading" | "running" | "error";

export interface VisionSnapshot {
  faceDetected: boolean;
  stats: FatigueStats | null;
  fatigueScore: number | null;
  fatigueLevel: "bajo" | "medio" | "alto" | null;
  expression: ExpressionResult | null;
  head: HeadPoseState | null;
}

const EMOTION_EVERY_N_FRAMES = 8;
const SNAPSHOT_EVERY_MS = 250;

export function useVision() {
  // --- refs: lo que usa el loop (no causan re-render y no se quedan "viejos") ---
  const trackerRef = useRef(new FatigueTracker());
  const aggregatorRef = useRef(new SessionAggregator());
  const headRef = useRef(new HeadPoseTracker());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
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
  

  const loop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const now = performance.now();

    try {
      // 1. Detectar (solo si el video ya tiene imagen)
      const result = video.readyState >= 2 && video.videoWidth > 0 ? detectFrame(video, now) : null;

      // 2. Si hay cara, actualizar fatiga y postura de la cabeza
      let stats: FatigueStats | null = null;
      let head: HeadPoseState | null = null;
      if (result) {
        const aspect = video.videoWidth / video.videoHeight;
        stats = trackerRef.current.update(result.faceLandmarks[0], now, aspect);

        const matrix = result.facialTransformationMatrixes?.[0]?.data;
        if (matrix) head = headRef.current.update(headPoseFromMatrix(matrix), now);
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
        aggregatorRef.current.add(now, stats, score, expression?.emotion ?? null, head);
        setSnapshot({
          faceDetected: !!result,
          stats,
          fatigueScore: score,
          fatigueLevel: score === null ? null : fatigueLevel(score),
          expression,
          head,
        });
      }
    } catch (e) {
      // Un frame fallido no debe matar todo el loop
      console.warn("[useVision] frame error", e);
    }

    // 5. Siguiente frame
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async (video: HTMLVideoElement) => {
    // Evitar dos loops al mismo tiempo (doble click, StrictMode, etc.)
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    try {
      setStatus("loading");
      setError(null);
      videoRef.current = video;
      trackerRef.current.reset();
      aggregatorRef.current.reset();
      headRef.current.reset();
      await loadFaceLandmarker();
      setStatus("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loop]);

  /** Detiene el loop y regresa el resumen de la sesión */
  const stop = useCallback((): SessionSummary => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    videoRef.current = null;
    setStatus("idle");
    return aggregatorRef.current.summary();
  }, []);

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

  return { status, snapshot, error, emotionEnabled, start, stop, enableEmotion, recalibrateHead };

  
}
