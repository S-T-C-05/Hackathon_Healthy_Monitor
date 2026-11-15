import { useState } from "react";
import { ENROLL_PROMPTS, MIN_ENROLL_SHOTS, type IdentityApi } from "../vision/useIdentity";

interface Props {
  identity: IdentityApi;
  running: boolean;                       // la cámara está activa
  getVideo: () => HTMLVideoElement | null;
}

/** Registro de tripulantes: nombre + 3–5 tomas de la cara, y lista de registrados */
export default function CrewPanel({ identity, running, getVideo }: Props) {
  const { crew, enrolling, busy, startEnroll, captureShot, finishEnroll, cancelEnroll, removeCrew } = identity;
  const [name, setName] = useState("");

  const shotCount = enrolling?.shots.length ?? 0;
  const done = shotCount >= ENROLL_PROMPTS.length;

  function handleCapture() {
    const video = getVideo();
    if (video) void captureShot(video);
  }

  function handleStart() {
    startEnroll(name);
    setName("");
  }

  return (
    <details style={{ margin: "12px 0", padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        Registro de tripulantes ({crew.length})
      </summary>

      {crew.length > 0 && (
        <ul>
          {crew.map((c) => (
            <li key={c.id}>
              {c.name} <span style={{ color: "#888" }}>({c.descriptors.length} tomas)</span>{" "}
              <button
                onClick={() => {
                  if (confirm(`¿Borrar a ${c.name} del registro?`)) removeCrew(c.id);
                }}
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}

      {!running ? (
        <p style={{ color: "#666" }}>Inicia la cámara para registrar a alguien.</p>
      ) : !enrolling ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            placeholder="Nombre del tripulante"
            maxLength={60}
          />
          <button onClick={handleStart} disabled={!name.trim()}>
            Registrar nuevo
          </button>
        </div>
      ) : (
        <div>
          <p style={{ margin: "4px 0" }}>
            Registrando a <b>{enrolling.name}</b> — toma {Math.min(shotCount + 1, ENROLL_PROMPTS.length)} de{" "}
            {ENROLL_PROMPTS.length}
          </p>
          {!done && <p style={{ margin: "4px 0", fontSize: 18 }}>👉 {ENROLL_PROMPTS[shotCount]}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleCapture} disabled={busy || done}>
              {busy ? "Capturando…" : "Capturar toma"}
            </button>
            <button onClick={finishEnroll} disabled={busy || shotCount < MIN_ENROLL_SHOTS}>
              Guardar ({shotCount}/{ENROLL_PROMPTS.length})
            </button>
            <button onClick={cancelEnroll} disabled={busy}>
              Cancelar
            </button>
          </div>
          <p style={{ margin: "4px 0", fontSize: 13, color: "#666" }}>
            Mínimo {MIN_ENROLL_SHOTS} tomas; con {ENROLL_PROMPTS.length} el reconocimiento es más confiable.
            Solo una persona frente a la cámara.
          </p>
        </div>
      )}

      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#888" }}>
        🔒 Los datos faciales (descriptores numéricos, no fotos) se guardan solo en este navegador.
      </p>
    </details>
  );
}
