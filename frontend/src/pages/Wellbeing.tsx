import { useEffect, useRef, useState } from "react";
import { useVision } from "../vision/useVision";
import type { SessionSummary } from "../vision/aggregate";

export default function Wellbeing() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false); // candado inmediato (el estado de React tarda un render)
  const { status, snapshot, error, emotionEnabled, start, stop, enableEmotion, recalibrateHead } = useVision();

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function handleStart() {
    // Evita abrir la cámara dos veces (doble click o click mientras se pide el permiso)
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setCamError(null);
    setSummary(null);

    try {
      stopCamera(); // por si quedó una cámara abierta de antes
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;

      try {
        await video.play();
      } catch (e) {
        // "AbortError" = el play() fue interrumpido por un nuevo srcObject; no es fatal
        if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
      }

      await start(video);
    } catch (e) {
      stopCamera();
      setCamError(e instanceof Error ? e.message : "No se pudo abrir la cámara");
    } finally {
      startingRef.current = false;
      setStarting(false);
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
  const h = snapshot?.head;

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
          <button onClick={handleStart} disabled={starting}>
            {starting ? "Abriendo cámara…" : "Iniciar"}
          </button>
        ) : (
          <button onClick={handleStop}>Detener</button>
        )}
        <label>
          <input type="checkbox" checked={emotionEnabled} onChange={(e) => enableEmotion(e.target.checked)} />{" "}
          Detectar expresión
        </label>
        {status === "running" && <button onClick={recalibrateHead}>Recalibrar postura</button>}
        <span>Estado: {status === "loading" ? "cargando modelo…" : status}</span>
      </div>

      {(camError || error) && <p style={{ color: "crimson" }}>⚠️ {camError ?? error}</p>}

      {status === "running" && snapshot && (
        <div>
          {!snapshot.faceDetected && <p>No se detecta tu cara 👀</p>}
          {h && !h.calibrated && (
            <p>Calibrando postura… mira a la pantalla ({Math.round(h.calibrationProgress * 100)}%)</p>
          )}
          {h?.headDown && <p style={{ color: "darkorange" }}>⬇️ Cabeza gacha</p>}
          {h?.lookingAway && <p style={{ color: "darkorange" }}>↔️ Mirando a otro lado</p>}
          {s && (
            <ul>
              <li>Fatiga: <b>{snapshot.fatigueScore}</b>/100 ({snapshot.fatigueLevel})</li>
              <li>EAR: {s.ear.toFixed(3)} {s.closed ? "(ojos cerrados)" : ""}</li>
              <li>PERCLOS (1 min): {(s.perclos * 100).toFixed(1)}%</li>
              <li>Parpadeos: {s.blinks} ({s.blinksPerMin}/min)</li>
              <li>Bostezos: {s.yawns}</li>
              {h?.calibrated && (
                <li>
                  Cabeza (relativo): pitch {h.relative.pitch.toFixed(1)}° · yaw {h.relative.yaw.toFixed(1)}° · roll{" "}
                  {h.relative.roll.toFixed(1)}°
                </li>
              )}
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
            <li>
              Cabeza gacha: {summary.headDownPct}% ({summary.headDownEvents} veces) · Mirando a otro lado:{" "}
              {summary.lookingAwayPct}% ({summary.lookingAwayEvents} veces)
            </li>
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
