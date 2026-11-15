/**
 * Profile picker = the crew from the backend, plus face identification.
 * ApolloCare keeps owning the overlay; this module only decorates it.
 */
import { backend, crewById } from "./api";
import { claimCamera, closeCamera, onCameraClaim, openCamera } from "./camera";
import { AC, h, setText } from "./dom";
import * as faceId from "./faceId";
import { tr } from "./i18n";

const OWNER = "profiles";
let stream: MediaStream | null = null;
let busy = false;
let enrolling: { crewId: string; name: string; shots: Float32Array[] } | null = null;

let video: HTMLVideoElement;
const el: Record<string, HTMLElement> = {};

function say(text: string): void {
  setText(el.status, text);
}

function build(): HTMLElement {
  video = h("video", { muted: true, playsinline: true });
  video.muted = true;
  el.identify = h("button", { type: "button", class: "btn primary", onclick: () => void identify() }, "📷 Identificarme con la cámara");
  el.prompt = h("p", { class: "ax-face-prompt" });
  el.capture = h("button", { type: "button", class: "btn primary", onclick: () => void capture() }, "Capturar toma");
  el.saveFace = h("button", { type: "button", class: "btn ghost", onclick: finish }, "Guardar rostro");
  el.cancel = h("button", { type: "button", class: "btn ghost", onclick: () => stopCamera() }, "Cancelar");
  el.enrollRow = h("div", { class: "wellness-btn-row", hidden: true }, el.capture, el.saveFace);
  el.stage = h(
    "div",
    { class: "ax-face-stage", hidden: true },
    h("div", { class: "ax-video-wrap ax-small" }, video),
    h("div", { class: "ax-face-info" }, el.prompt, el.enrollRow, h("div", { class: "wellness-btn-row" }, el.cancel)),
  );
  el.status = h("p", { class: "wellness-status", role: "status" });
  return h(
    "div",
    { class: "ax-face", id: "ax-face" },
    h("div", { class: "ax-face-row" }, el.identify),
    el.stage,
    el.status,
    h("p", { class: "profile-security" }, "🔒 Reconocimiento facial: solo se guardan descriptores numéricos (no fotos) y solo en este navegador. Sirve para elegir el perfil, no es un control de acceso."),
  );
}

async function startCamera(): Promise<boolean> {
  claimCamera(OWNER);
  try {
    stream = await openCamera(video);
    el.stage.hidden = false;
    return true;
  } catch (e) {
    console.warn("[profiles] camera", e);
    say("No se pudo activar la cámara (permiso denegado o no disponible).");
    return false;
  }
}

function stopCamera(): void {
  closeCamera(stream, video);
  stream = null;
  enrolling = null;
  busy = false;
  if (el.stage) {
    el.stage.hidden = true;
    el.enrollRow.hidden = true;
  }
}

async function identify(): Promise<void> {
  if (busy) return;
  if (faceId.enrolledCount() === 0) {
    say("Todavía no hay rostros registrados. Usa «Registrar rostro» en tu perfil.");
    return;
  }
  busy = true;
  say("");
  if (!(await startCamera())) {
    busy = false;
    return;
  }
  el.enrollRow.hidden = true;
  setText(el.prompt, "Identificando… mira a la cámara");
  try {
    const r = await faceId.identify(video);
    if (!stream) return; // cancelled meanwhile
    if (r.ok && crewById(r.match.id)) {
      const name = r.match.name;
      stopCamera();
      AC().sfx.confirm();
      AC().toast(tr(`Hola, ${name}`, `Hello, ${name}`, `Bonjour, ${name}`));
      AC().Profiles.select(r.match.id);
      return;
    }
    stopCamera();
    say(
      r.ok || r.reason === "unknown"
        ? "No te reconocí. Elige tu perfil a mano o registra tu rostro."
        : r.reason === "no_face"
          ? r.detail || "No se detecta ninguna cara"
          : "Todavía no hay rostros registrados. Usa «Registrar rostro» en tu perfil.",
    );
  } catch (e) {
    console.warn("[profiles] identify", e);
    stopCamera();
    say("No se pudieron cargar los modelos de reconocimiento (se necesita internet la primera vez).");
  } finally {
    busy = false;
  }
}

function showPrompt(): void {
  if (!enrolling) return;
  const n = enrolling.shots.length;
  const total = faceId.ENROLL_PROMPTS.length;
  const done = n >= total;
  setText(
    el.prompt,
    done
      ? tr(`Listo: ${n} tomas de ${enrolling.name}. Guarda el rostro.`, `Done: ${n} shots of ${enrolling.name}. Save the face.`, `Terminé : ${n} prises de ${enrolling.name}. Enregistrez le visage.`)
      : tr(`${enrolling.name} · toma ${n + 1} de ${total}: `, `${enrolling.name} · shot ${n + 1} of ${total}: `, `${enrolling.name} · prise ${n + 1} sur ${total} : `) + AC().Lang.t(faceId.ENROLL_PROMPTS[n]),
  );
  (el.capture as HTMLButtonElement).disabled = done;
  (el.saveFace as HTMLButtonElement).disabled = n < faceId.MIN_ENROLL_SHOTS;
}

async function startEnroll(crewId: string, name: string): Promise<void> {
  if (busy) return;
  say("");
  stopCamera();
  if (!(await startCamera())) return;
  enrolling = { crewId, name, shots: [] };
  el.enrollRow.hidden = false;
  faceId.preloadIdentityModels();
  showPrompt();
}

async function capture(): Promise<void> {
  if (busy || !enrolling) return;
  busy = true;
  (el.capture as HTMLButtonElement).disabled = true;
  say("");
  try {
    const r = await faceId.captureShot(video);
    if (!enrolling) return;
    if (r.ok) enrolling.shots.push(r.descriptor);
    else say(tr("Toma rechazada: ", "Shot rejected: ", "Prise refusée : ") + AC().Lang.t(r.reason));
  } catch (e) {
    console.warn("[profiles] capture", e);
    say("No se pudieron cargar los modelos de reconocimiento (se necesita internet la primera vez).");
  } finally {
    busy = false;
    showPrompt();
  }
}

function finish(): void {
  if (!enrolling) return;
  const { crewId, name, shots } = enrolling;
  const r = faceId.finishEnroll(crewId, name, shots);
  if (r.ok) {
    stopCamera();
    say(tr(`✓ Rostro de ${name} registrado en este navegador.`, `✓ ${name}'s face enrolled in this browser.`, `✓ Visage de ${name} enregistré dans ce navigateur.`));
    AC().Profiles.render();
  } else if (r.reason === "duplicate") {
    say(tr(`Esta cara ya está registrada como ${r.other}.`, `This face is already enrolled as ${r.other}.`, `Ce visage est déjà enregistré sous ${r.other}.`));
  } else if (r.reason === "too_few") {
    say(tr(`Faltan tomas: mínimo ${faceId.MIN_ENROLL_SHOTS}.`, `More shots needed: at least ${faceId.MIN_ENROLL_SHOTS}.`, `Prises insuffisantes : au moins ${faceId.MIN_ENROLL_SHOTS}.`));
  } else {
    say("No se pudo guardar el registro en este navegador.");
  }
}

/** Extra lines and buttons on each crew profile card. */
function decorate(item: HTMLElement, p: { id: string; name: string; crew?: boolean }): void {
  const m = crewById(p.id);
  if (!p.crew || !m) return;
  const enrolled = faceId.isEnrolled(p.id);
  const day = h("small", null, h("span", null, "Día de misión"), ` ${m.mission_day} / ${m.mission_length_days}`);
  const row = h("div", { class: "ax-face-actions" });
  if (!m.consent.face_recognition) {
    row.append(h("small", null, "Sin consentimiento para reconocimiento facial"));
  } else {
    row.append(
      h("small", { class: enrolled ? "ax-ok" : "" }, enrolled ? "✓ Rostro registrado" : "Rostro sin registrar"),
      h("button", { type: "button", class: "profile-delete ax-link", onclick: () => void startEnroll(p.id, p.name) }, enrolled ? "Volver a registrar" : "Registrar rostro"),
    );
    if (enrolled) {
      row.append(
        h(
          "button",
          {
            type: "button",
            class: "profile-delete",
            onclick: () => {
              if (!confirm(tr(`¿Borrar el rostro registrado de ${p.name} de este navegador?`, `Delete ${p.name}'s enrolled face from this browser?`, `Supprimer le visage enregistré de ${p.name} de ce navigateur ?`))) return;
              faceId.removeEnrollment(p.id);
              AC().Profiles.render();
            },
          },
          "Borrar rostro",
        ),
      );
    }
  }
  item.append(day, row);
}

/** Call once the crew list has been downloaded. */
export function setupProfiles(): void {
  const ac = AC();
  const overlay = document.getElementById("profileOverlay");
  const list = document.getElementById("profileList");
  if (!overlay || !list || !backend.online) return;

  list.before(build());
  ac.Profiles.decorate = decorate;
  ac.Profiles.useCrew(backend.crew);

  const form = document.getElementById("profileCreateForm");
  if (form) form.style.display = "none"; // profiles are the mission crew now

  // Release the camera whenever the overlay closes (button, backdrop, Escape, profile chosen)
  new MutationObserver(() => {
    if (overlay.hidden) stopCamera();
  }).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
  onCameraClaim((owner) => {
    if (owner !== OWNER) stopCamera();
  });
}
