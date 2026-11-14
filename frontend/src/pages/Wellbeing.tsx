import { useEffect, useRef, useState } from "react";
import { useVision } from "../vision/useVision";
import type { SessionSummary } from "../vision/aggregate";

export default function Wellbeing() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const { status, snapshot, error, emotionEnabled, start, stop, enableEmotion } = useVision();

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function handleStart() {
    setCamError(null);
    setSummary(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      await start(video);
    } catch (e) {
      stopCamera();
      setCamError(e instanceof Error ? e.message : "No se pudo abrir la cámara");
    }
  }

  function handleStop() {
    setSummary(stop());
    stopCamera();
  }

  // Apagar la cámara al salir de la página
  useEffect(() => () => stopCamera(), []);

  const running = status === "running" || status === "loading";
  const s = snapshot?.stats;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>Monitor de bienestar</h1>

      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: "100%", maxWidth: 640, borderRadius: 12, background: "#111", transform: "scaleX(-1)" }}
      />

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        {!running ? (
          <button onClick={handleStart}>Iniciar</button>
        ) : (
          <button onClick={handleStop}>Detener</button>
        )}
        <label>
          <input type="checkbox" checked={emotionEnabled} onChange={(e) => enableEmotion(e.target.checked)} />{" "}
          Detectar expresión
        </label>
        <span>Estado: {status === "loading" ? "cargando modelo…" : status}</span>
      </div>

      {(camError || error) && <p style={{ color: "crimson" }}>⚠️ {camError ?? error}</p>}

      {status === "running" && snapshot && (
        <div>
          {!snapshot.faceDetected && <p>No se detecta tu cara 👀</p>}
          {s && (
            <ul>
              <li>Fatiga: <b>{snapshot.fatigueScore}</b>/100 ({snapshot.fatigueLevel})</li>
              <li>EAR: {s.ear.toFixed(3)} {s.closed ? "(ojos cerrados)" : ""}</li>
              <li>PERCLOS (1 min): {(s.perclos * 100).toFixed(1)}%</li>
              <li>Parpadeos: {s.blinks} ({s.blinksPerMin}/min)</li>
              <li>Bostezos: {s.yawns}</li>
              {snapshot.expression && (
                <li>
                  Expresión: {snapshot.expression.emotion} ({Math.round(snapshot.expression.confidence * 100)}%) ·
                  valencia {snapshot.expression.valence.toFixed(2)}
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {summary && (
        <div>
          <h2>Resumen de la sesión</h2>
          <ul>
            <li>Duración: {Math.round(summary.durationMs / 1000)} s</li>
            <li>Fatiga promedio: {summary.avgFatigue}/100 (máx {summary.maxFatigue})</li>
            <li>Parpadeos: {summary.totalBlinks} · Bostezos: {summary.totalYawns}</li>
            <li>Cara visible: {summary.faceVisiblePct}% del tiempo</li>
            {Object.keys(summary.emotions).length > 0 && (
              <li>
                Expresiones:{" "}
                {Object.entries(summary.emotions).map(([e, pct]) => `${e} ${pct}%`).join(", ")}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
