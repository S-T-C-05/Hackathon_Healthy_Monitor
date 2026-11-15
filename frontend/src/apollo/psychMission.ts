/**
 * Emotional check-in -> mission data (state 6), kept honest.
 *
 * The questionnaire is NOT a validated scale, and a face does not prove a mental state, so this
 * NEVER turns the emotional "diagnosis" into a colored mission metric. It only lets the crew member
 * save what THEY reported themselves:
 *   - how close they feel to the crew (1-10 self-report) -> crew_cohesion (trend only, no color)
 *   - optionally, a camera pulse (a real vital), exactly like the physical check-in
 * Everything is opt-in and needs the crew member's consent.
 */
import { api, ApiError, backend, crewById } from "./api";
import { claimCamera, closeCamera, onCameraClaim, openCamera } from "./camera";
import { AC, h, setText } from "./dom";
import { tr } from "./i18n";
import { refreshMonitor } from "./monitor";
import { VisionSession, type VisionSnapshot } from "./visionSession";

const OWNER = "psych";
const session = new VisionSession();
let stream: MediaStream | null = null;
let video: HTMLVideoElement;
let overlay: HTMLCanvasElement;
const el: Record<string, HTMLElement> = {};
let savedCloseness = false;

function closenessAnswer(): number | null {
  const v = (AC().App as { psych?: { answers?: Record<string, unknown> } }).psych?.answers?.close;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function saveCloseness(): Promise<void> {
  const close = closenessAnswer();
  const crewId = AC().Profiles.currentId();
  const member = crewById(crewId);
  if (close === null || !crewId || !member) return;
  const score = Math.max(1, Math.min(5, Math.round(close / 2))); // the indicator is a 1-5 score
  try {
    await api.entry(crewId, "crew_cohesion", score, `Emotional check-in: self-reported closeness to crew (${close}/10)`);
    savedCloseness = true;
    setText(el.closeStatus, tr("✓ Guardado en tu historial de misión (cercanía con la tripulación).", "✓ Saved to your mission history (closeness to the crew).", "✓ Enregistré dans votre historique de mission (proximité avec l’équipage)."));
    (el.saveClose as HTMLButtonElement).disabled = true;
    refreshMonitor();
  } catch (e) {
    console.warn("[psychMission] closeness", e);
    setText(el.closeStatus, e instanceof ApiError && e.status === 403 ? tr("No se guardó: falta el consentimiento de este tripulante.", "Not saved: this crew member has not consented.", "Non enregistré : ce membre d’équipage n’a pas consenti.") : tr("No se pudo guardar en el historial de misión.", "Could not save to the mission history.", "Impossible d’enregistrer dans l’historique de mission."));
  }
}

function render(s: VisionSnapshot): void {
  const hr = s.heart;
  if (!hr || !hr.result) {
    setText(el.bpm, hr ? tr(`Midiendo… ${Math.round(hr.progress * 100)}%`, `Measuring… ${Math.round(hr.progress * 100)}%`, `Mesure… ${Math.round(hr.progress * 100)} %`) : "–");
  } else {
    setText(el.bpm, hr.bpm !== null ? `${Math.round(hr.bpm)} ${tr("lpm", "bpm", "bpm")}` : "–");
  }
  (el.savePulse as HTMLButtonElement).disabled = !(session.heartReliable && session.stableBpm !== null);
}

async function savePulse(): Promise<void> {
  const bpm = session.stableBpm;
  const crewId = AC().Profiles.currentId();
  const member = crewById(crewId);
  if (bpm === null || !crewId || !member) return;
  try {
    await api.entry(crewId, "resting_heart_rate", Math.round(bpm), "Camera pulse during the emotional check-in", "camera");
    setText(el.pulseStatus, tr(`✓ Pulso guardado: ${Math.round(bpm)} lpm (fuente: cámara).`, `✓ Pulse saved: ${Math.round(bpm)} bpm (source: camera).`, `✓ Pouls enregistré : ${Math.round(bpm)} bpm (source : caméra).`));
    refreshMonitor();
  } catch (e) {
    console.warn("[psychMission] pulse", e);
    setText(el.pulseStatus, e instanceof ApiError && e.status === 403 ? tr("No se guardó: falta el consentimiento de este tripulante.", "Not saved: this crew member has not consented.", "Non enregistré : ce membre d’équipage n’a pas consenti.") : tr("No se pudo guardar el pulso.", "Could not save the pulse.", "Impossible d’enregistrer le pouls."));
  }
}

function stopCamera(): void {
  if (session.status !== "idle") session.stop();
  closeCamera(stream, video);
  stream = null;
  if (el.cam) el.cam.hidden = true;
  if (el.camToggle) setText(el.camToggle, tr("📷 Medir mi pulso con la cámara (opcional)", "📷 Measure my pulse with the camera (optional)", "📷 Mesurer mon pouls avec la caméra (facultatif)"));
}

async function toggleCamera(): Promise<void> {
  AC().sfx.click();
  if (stream) {
    stopCamera();
    return;
  }
  claimCamera(OWNER);
  el.cam.hidden = false;
  setText(el.bpm, tr("Abriendo la cámara…", "Opening the camera…", "Ouverture de la caméra…"));
  setText(el.pulseStatus, "");
  try {
    stream = await openCamera(video);
  } catch {
    setText(el.bpm, tr("No se pudo activar la cámara.", "Could not enable the camera.", "Impossible d’activer la caméra."));
    return;
  }
  setText(el.camToggle, tr("Detener cámara", "Stop camera", "Arrêter la caméra"));
  const ok = await session.start(video, overlay);
  if (!ok) {
    setText(el.bpm, tr("No se pudo cargar el modelo de visión (se necesita internet la primera vez).", "Could not load the vision model (internet is needed the first time).", "Impossible de charger le modèle de vision (Internet requis la première fois)."));
    stopCamera();
  }
}

function build(): HTMLElement {
  video = h("video", { muted: true, playsinline: true });
  video.muted = true;
  overlay = h("canvas", { class: "ax-overlay" });
  el.closeVal = h("b", null, "–");
  el.saveClose = h("button", { type: "button", class: "btn primary", onclick: () => void saveCloseness() }, "Guardar en mi historial de misión");
  el.closeStatus = h("p", { class: "wellness-status", role: "status" });
  el.bpm = h("b", { class: "ax-stat-val" }, "–");
  el.savePulse = h("button", { type: "button", class: "btn ghost", disabled: true, onclick: () => void savePulse() }, "Guardar pulso en la misión");
  el.pulseStatus = h("p", { class: "wellness-status", role: "status" });
  el.camToggle = h("button", { type: "button", class: "btn ghost", onclick: () => void toggleCamera() }, "📷 Medir mi pulso con la cámara (opcional)");
  el.cam = h(
    "div",
    { class: "ax-psych-cam", hidden: true },
    h("div", { class: "ax-video-wrap ax-small" }, video, overlay),
    h("div", { class: "ax-psych-cam-side" }, h("span", { class: "ax-stat-lab" }, "Pulso por cámara"), el.bpm, el.savePulse, el.pulseStatus),
  );
  return h(
    "section",
    { class: "wellness-card ax-emo-mission", id: "ax-emo-mission" },
    h("h3", null, "Datos para tu misión"),
    h(
      "p",
      null,
      "Esto NO guarda un diagnóstico de salud mental: el cuestionario no es una escala clínica. Solo guarda lo que tú reportaste, para ver tu tendencia durante la misión.",
    ),
    h("p", { class: "ax-emo-close" }, h("span", null, "Cercanía con tu tripulación (tu respuesta): "), el.closeVal, h("span", null, " / 10")),
    h("div", { class: "wellness-btn-row", style: "justify-content:flex-start" }, el.saveClose),
    el.closeStatus,
    el.camToggle,
    el.cam,
  );
}

export function setupPsychMission(): void {
  const ac = AC();
  session.onSnapshot = render;
  onCameraClaim((owner) => {
    if (owner !== OWNER) stopCamera();
  });
  window.addEventListener("pagehide", () => closeCamera(stream, video));

  const enter = ac.hooks.enter[6];
  ac.hooks.enter[6] = () => {
    enter?.();
    const host = document.querySelector("#s6 .psy-wrap");
    const close = closenessAnswer();
    document.getElementById("ax-emo-mission")?.remove();
    if (!host || !backend.online || close === null || !crewById(ac.Profiles.currentId())) return;
    const block = build();
    savedCloseness = false;
    document.getElementById("psyRecs")?.after(block);
    setText(el.closeVal, String(close));
    ac.Lang.apply(block);
    if (import.meta.env.DEV) Object.assign(window, { __axPsych: { render, savePulse, session } });
  };
  const leave = ac.hooks.leave[6];
  ac.hooks.leave[6] = () => {
    stopCamera();
    leave?.();
  };
  void savedCloseness;
}
