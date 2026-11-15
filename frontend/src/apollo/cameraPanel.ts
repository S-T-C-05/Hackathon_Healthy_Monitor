/**
 * Camera card of the physical check-in (state 3): replaces ApolloCare's preview-only card
 * with the real analysis (pulse by rPPG, fatigue signs, head pose, optional expression).
 * Video never leaves the browser; only the session summary can be sent to the backend,
 * and only if the crew member ticks the box.
 */
import { api, ApiError, backend, crewById } from "./api";
import { claimCamera, closeCamera, onCameraClaim, openCamera } from "./camera";
import { AC, h, setText } from "./dom";
import { tr } from "./i18n";
import { refreshMonitor } from "./monitor";
import { VisionSession, type SessionSummary, type VisionSnapshot } from "./visionSession";

const OWNER = "checkin";
const UI_EVERY_MS = 500;
const EMOTION_ES: Record<string, string> = {
  neutral: "neutral", happy: "alegría", sad: "tristeza", angry: "enojo",
  fearful: "miedo", disgusted: "desagrado", surprised: "sorpresa",
};
const FATIGUE_ES: Record<string, string> = { bajo: "bajo", medio: "medio", alto: "alto" };

const session = new VisionSession();
let stream: MediaStream | null = null;
let starting = false;
let lastUi = 0;
let resultEl: HTMLElement | null = null;

let video: HTMLVideoElement;
let overlay: HTMLCanvasElement;
let wave: HTMLCanvasElement;
const el: Record<string, HTMLElement> = {};

function tile(key: string, label: string, hidden = false): HTMLElement {
  el[key] = h("b", { class: "ax-stat-val" }, "–");
  el[key + "Sub"] = h("small", { class: "ax-stat-sub" });
  el[key + "Tile"] = h("div", { class: "ax-stat", hidden }, h("span", { class: "ax-stat-lab" }, label), el[key], el[key + "Sub"]);
  return el[key + "Tile"];
}

function build(): HTMLElement {
  video = h("video", { muted: true, playsinline: true });
  video.muted = true;
  overlay = h("canvas", { class: "ax-overlay" });
  wave = h("canvas", { class: "ax-wave", width: "300", height: "48", "aria-hidden": "true" });
  el.videoMsg = h("div", { class: "ax-video-msg" }, "Sin señal");
  el.start = h("button", { type: "button", class: "btn primary", onclick: () => void toggle() }, "Iniciar cámara");
  el.mesh = h("input", { type: "checkbox", onchange: (e) => session.enableMesh((e.target as HTMLInputElement).checked) });
  el.emotion = h("input", { type: "checkbox", onchange: (e) => void toggleEmotion(e.target as HTMLInputElement) });
  el.recal = h("button", { type: "button", class: "btn ghost", hidden: true, onclick: () => session.recalibrateHead() }, "Recalibrar postura");
  el.status = h("p", { class: "camstatus", role: "status" });
  el.usePulse = h("button", { type: "button", class: "btn ghost", disabled: true, onclick: usePulse }, "Usar este pulso en mi revisión");
  el.save = h("input", { type: "checkbox", id: "ax-save-session" });
  el.summary = h("div", { class: "ax-summary", hidden: true });

  const pulseTile = tile("pulse", "Pulso por cámara");
  pulseTile.classList.add("ax-stat-wide");
  pulseTile.append(wave);

  return h(
    "div",
    { class: "card rise ax-vision", id: "ax-vision" },
    h("h3", null, "Cámara inteligente (opcional)"),
    h(
      "p",
      { class: "aux sub" },
      "Mide tu pulso con la cámara y observa señales de fatiga (parpadeo, ojos cerrados, bostezos) y la postura de tu cabeza. Todo se procesa en este navegador: no se graba ni se envía video. No es un dispositivo médico.",
    ),
    h(
      "div",
      { class: "ax-vision-grid" },
      h("div", { class: "ax-video-wrap" }, video, overlay, el.videoMsg),
      h(
        "div",
        { class: "ax-vision-side" },
        h(
          "div",
          { class: "ax-controls" },
          el.start,
          h("label", { class: "ax-check" }, el.mesh, h("span", null, "Mostrar malla")),
          h("label", { class: "ax-check" }, el.emotion, h("span", null, "Detectar expresión")),
          el.recal,
        ),
        el.status,
        h(
          "div",
          { class: "ax-stats" },
          pulseTile,
          tile("fatigue", "Fatiga (cámara)"),
          tile("eyes", "Ojos cerrados (1 min)"),
          tile("yawns", "Bostezos"),
          tile("head", "Postura de la cabeza"),
          tile("expr", "Expresión facial", true),
        ),
        h("div", { class: "ax-controls" }, el.usePulse),
        h(
          "label",
          { class: "wellness-check" },
          el.save,
          h("span", null, "Autorizo guardar el pulso medido por cámara en mi historial de misión (base local del equipo). No se guarda video."),
        ),
      ),
    ),
    el.summary,
    h(
      "p",
      { class: "aux ax-vision-note" },
      "Para un buen pulso: buena luz, quédate quieto unos 10 segundos. Compara con un oxímetro o pulso manual antes de confiar en la cámara. La fatiga y la expresión son señales experimentales; una cara no demuestra por sí sola estrés, ansiedad ni depresión.",
    ),
  );
}

function setStatus(text: string, ok = false): void {
  setText(el.status, text);
  el.status.className = "camstatus" + (ok ? " ok" : "");
}

function drawWave(data: number[] | null): void {
  const ctx = wave.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, wave.width, wave.height);
  if (!data || data.length < 2) return;
  const pts = data.slice(-150);
  let min = Infinity;
  let max = -Infinity;
  for (const v of pts) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--bad").trim() || "#E4706C";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = (i / (pts.length - 1)) * wave.width;
    const y = wave.height - 3 - ((v - min) / range) * (wave.height - 6);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
}

function render(s: VisionSnapshot): void {
  const now = performance.now();
  if (now - lastUi < UI_EVERY_MS) return;
  lastUi = now;

  el.videoMsg.hidden = s.faceDetected;
  if (!s.faceDetected) setText(el.videoMsg, "No se detecta tu cara");

  const hr = s.heart;
  if (!hr || !hr.result) {
    setText(el.pulse, "–");
    setText(el.pulseSub, hr ? tr(`Midiendo… quédate quieto (${Math.round(hr.progress * 100)}%)`, `Measuring… keep still (${Math.round(hr.progress * 100)}%)`, `Mesure… restez immobile (${Math.round(hr.progress * 100)} %)`) : "");
    drawWave(null);
  } else {
    setText(el.pulse, hr.bpm !== null ? `${Math.round(hr.bpm)} ${tr("lpm", "bpm", "bpm")}` : "–");
    const q = Math.round(hr.result.quality * 100);
    setText(
      el.pulseSub,
      hr.result.reliable
        ? tr(`señal confiable (calidad ${q}%)`, `reliable signal (quality ${q}%)`, `signal fiable (qualité ${q} %)`)
        : tr(`señal débil (calidad ${q}%): quédate quieto y con buena luz`, `weak signal (quality ${q}%): keep still, use good light`, `signal faible (qualité ${q} %) : restez immobile, bon éclairage`),
    );
    drawWave(hr.result.wave);
  }
  (el.usePulse as HTMLButtonElement).disabled = !(session.heartReliable && session.stableBpm !== null);

  const st = s.stats;
  if (st) {
    setText(el.fatigue, `${s.fatigueScore ?? 0}/100`);
    setText(el.fatigueSub, s.fatigueLevel ? FATIGUE_ES[s.fatigueLevel] : "");
    setText(el.eyes, `${(st.perclos * 100).toFixed(1)}%`);
    setText(
      el.eyesSub,
      st.windowReady
        ? tr(`${st.blinksPerMin} parpadeos/min`, `${st.blinksPerMin} blinks/min`, `${st.blinksPerMin} clignements/min`)
        : tr(`${st.blinks} parpadeos`, `${st.blinks} blinks`, `${st.blinks} clignements`),
    );
    setText(el.yawns, String(st.yawns));
    setText(el.yawnsSub, st.yawning ? "Bostezo detectado" : "");
  }
  const hd = s.head;
  if (hd) {
    if (!hd.calibrated) {
      setText(el.head, "…");
      setText(el.headSub, tr(`Calibrando: mira a la pantalla (${Math.round(hd.calibrationProgress * 100)}%)`, `Calibrating: look at the screen (${Math.round(hd.calibrationProgress * 100)}%)`, `Calibrage : regardez l’écran (${Math.round(hd.calibrationProgress * 100)} %)`));
    } else {
      setText(el.head, `${hd.relative.pitch.toFixed(0)}° / ${hd.relative.yaw.toFixed(0)}°`);
      setText(el.headSub, hd.headDown ? "Cabeza gacha" : hd.lookingAway ? "Mirando a otro lado" : "Inclinación / giro");
    }
  }
  if (session.emotionEnabled) {
    setText(el.expr, s.expression ? EMOTION_ES[s.expression.emotion] : "–");
    setText(el.exprSub, s.expression ? `${Math.round(s.expression.confidence * 100)}%` : "");
  }
}

async function toggleEmotion(box: HTMLInputElement): Promise<void> {
  try {
    if (box.checked) setStatus("Cargando el modelo de expresiones…");
    await session.enableEmotion(box.checked);
    el.exprTile.hidden = !box.checked;
    if (session.status === "running") setStatus("Cámara activa. El video no se graba ni sale de este navegador.", true);
    else setStatus("");
  } catch (e) {
    box.checked = false;
    el.exprTile.hidden = true;
    setStatus("No se pudo cargar el modelo de expresiones (se necesita internet la primera vez).");
    console.warn("[vision] expression model", e);
  }
}

function usePulse(): void {
  const bpm = session.stableBpm;
  const input = document.querySelector<HTMLInputElement>('#nbGrid .nb[data-id="hr"] input');
  if (bpm === null || !input) return;
  input.value = String(Math.round(bpm));
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new Event("blur"));
  AC().sfx.soft();
  AC().toast(tr(`Pulso de la cámara copiado: ${Math.round(bpm)} lpm`, `Camera pulse copied: ${Math.round(bpm)} bpm`, `Pouls de la caméra copié : ${Math.round(bpm)} bpm`));
}

async function start(): Promise<void> {
  if (starting || stream) return;
  starting = true;
  (el.start as HTMLButtonElement).disabled = true;
  el.summary.hidden = true;
  claimCamera(OWNER);
  try {
    setStatus("Abriendo la cámara…");
    stream = await openCamera(video);
  } catch (e) {
    console.warn("[vision] camera", e);
    setStatus("No se pudo activar la cámara (permiso denegado o no disponible).");
    stream = null;
    starting = false;
    (el.start as HTMLButtonElement).disabled = false;
    return;
  }
  el.videoMsg.hidden = true;
  setStatus("Cargando el modelo de visión…");
  const ok = await session.start(video, overlay);
  starting = false;
  (el.start as HTMLButtonElement).disabled = false;
  if (!ok) {
    closeCamera(stream, video);
    stream = null;
    el.videoMsg.hidden = false;
    setText(el.videoMsg, "Sin señal");
    if (session.status === "error") setStatus("No se pudo cargar el modelo de visión (se necesita internet la primera vez).");
    return;
  }
  setText(el.start, "Detener y ver resumen");
  el.recal.hidden = false;
  setStatus("Cámara activa. El video no se graba ni sale de este navegador.", true);
}

function summaryRow(label: string, value: string): HTMLElement {
  return h("li", null, h("span", null, label), " ", h("b", null, value));
}

function showSummary(s: SessionSummary): void {
  const pulse =
    s.avgBpm !== null
      ? `${s.avgBpm} ${tr("lpm", "bpm", "bpm")} (${s.minBpm}–${s.maxBpm})`
      : tr("sin lecturas confiables", "no reliable readings", "aucune mesure fiable");
  resultEl = h("p", { class: "wellness-status", role: "status" });
  el.summary.replaceChildren(
    h("h4", null, "Resumen de la sesión de cámara"),
    h(
      "ul",
      null,
      summaryRow("Duración:", `${Math.round(s.durationMs / 1000)} s`),
      summaryRow("Cara visible:", `${s.faceVisiblePct}%`),
      summaryRow("Pulso promedio:", pulse),
      summaryRow("Señal de pulso confiable:", `${s.heartReliablePct}%`),
      summaryRow("Fatiga promedio (cámara):", `${s.avgFatigue}/100 (máx ${s.maxFatigue})`),
      summaryRow("Parpadeos:", String(s.totalBlinks)),
      summaryRow("Bostezos:", String(s.totalYawns)),
      summaryRow("Cabeza gacha:", `${s.headDownPct}%`),
      summaryRow("Mirando a otro lado:", `${s.lookingAwayPct}%`),
    ),
    resultEl,
  );
  el.summary.hidden = false;
}

async function sendSummary(s: SessionSummary): Promise<void> {
  if (!(el.save as HTMLInputElement).checked) return;
  // with the summary on screen the outcome goes under it; otherwise (user left the screen) as a toast
  const out = (text: string) => (resultEl?.isConnected && !el.summary.hidden ? setText(resultEl, text) : AC().toast(AC().Lang.t(text)));
  const crewId = AC().Profiles.currentId();
  const member = crewById(crewId);
  if (!backend.online || !crewId || !member) {
    out("Sin conexión con la base de la misión: el resumen no se guardó.");
    return;
  }
  try {
    const r = await api.cameraSession(crewId, s);
    if (r.stored.length) {
      const v = r.stored[0].value;
      out(tr(`✓ Pulso guardado en el historial de ${member.name}: ${v} lpm (fuente: cámara).`, `✓ Pulse saved to ${member.name}'s history: ${v} bpm (source: camera).`, `✓ Pouls enregistré dans l’historique de ${member.name} : ${v} bpm (source : caméra).`));
      refreshMonitor();
      return;
    }
    const reason = r.skipped.find((x) => x.indicator_id === "resting_heart_rate")?.reason;
    out(
      reason === "session_too_short"
        ? "No se guardó el pulso: la sesión duró menos de 30 segundos."
        : reason === "heart_signal_not_reliable_enough"
          ? "No se guardó el pulso: la señal fue confiable menos de la mitad del tiempo."
          : "No se guardó el pulso: no hubo lecturas confiables.",
    );
  } catch (e) {
    console.warn("[vision] camera-session", e);
    out(e instanceof ApiError && e.status === 403 ? "No se guardó: falta el consentimiento para guardar historial de este tripulante." : "No se pudo guardar el resumen en la base de la misión.");
  }
}

/** @param quiet leave no summary on screen (the user is navigating away) */
function stop(quiet = false): void {
  if (!stream && session.status === "idle") return;
  const wasRunning = session.status === "running";
  const s = session.stop();
  closeCamera(stream, video);
  stream = null;
  setText(el.start, "Iniciar cámara");
  el.recal.hidden = true;
  el.videoMsg.hidden = false;
  setText(el.videoMsg, "Sin señal");
  (el.usePulse as HTMLButtonElement).disabled = true;
  setStatus("");
  drawWave(null);
  if (!wasRunning) return;
  if (quiet) el.summary.hidden = true;
  else showSummary(s);
  void sendSummary(s);
}

async function toggle(): Promise<void> {
  AC().sfx.click();
  if (stream) stop();
  else await start();
}

export function setupCameraPanel(): void {
  const old = document.querySelector<HTMLElement>("#s3 .card.cam");
  if (!old) {
    console.warn("[integration] camera card not found in state 3");
    return;
  }
  old.style.display = "none"; // ApolloCare's preview-only card; its logic stays untouched
  old.after(build());
  session.onSnapshot = render;

  const ac = AC();
  const leave = ac.hooks.leave[3];
  ac.hooks.leave[3] = () => {
    leave?.();
    stop(true);
  };
  onCameraClaim((owner) => {
    if (owner !== OWNER) stop();
  });
  window.addEventListener("pagehide", () => closeCamera(stream, video));
  // Development only: lets the browser tests drive the card without a real face in front of the camera
  if (import.meta.env.DEV) Object.assign(window, { __axVision: { render, showSummary, sendSummary } });
}
