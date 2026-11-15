/**
 * Physical check-in <-> backend.
 *  - After ApolloCare computes its local result, heart rate, temperature and sleep get their
 *    level from the data layer (cited thresholds) and the guidance that goes with it.
 *  - "Save this check-in" also stores those values in the crew member's mission history.
 * The other vital signs keep ApolloCare's orientative ranges and are labelled as such.
 */
import { api, ApiError, backend, crewById, type CheckinResult } from "./api";
import { AC, h, setText } from "./dom";
import type { ACPhysicalResult } from "./globals";
import { tr } from "./i18n";
import { AC_STATUS, basisTag, levelClass, levelTag } from "./levels";
import { openIndicatorDetail, refreshMonitor } from "./monitor";

let last: CheckinResult | null = null;

const RANK = { ok: 0, warn: 1, bad: 2 };
// Same three sentences as localPhysical() in index.html (the advice must match the final colors)
const ADVICE = [
  "Todo se ve dentro de lo esperado. Sigue con tu rutina de descanso y ejercicio.",
  "Algunos valores están en observación. Descansa, hidrátate y vuelve a medir en un rato.",
  "Hay valores en rango de peligro. Avisa a la tripulación o al oficial médico de vuelo (flight surgeon) y repite la medición con calma.",
];

function numericValues(): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(AC().App.physical.values)) out[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
  return out;
}

async function evaluate(res: ACPhysicalResult): Promise<void> {
  last = null;
  const crewId = AC().Profiles.currentId();
  if (!backend.online || res.demo || !crewId || !crewById(crewId)) return;
  try {
    const r = await api.checkin(crewId, numericValues(), false);
    for (const item of r.items) {
      const m = res.metrics.find((x) => x.id === item.field);
      if (!m || !item.level) continue;
      m.status = AC_STATUS[item.level];
      m.basis = item.threshold_basis;
    }
    const worst = Math.max(0, ...res.metrics.map((m) => RANK[m.status]));
    res.advice = ADVICE[worst];
    last = r;
  } catch (e) {
    console.warn("[checkin] evaluation not available, keeping the local result", e);
  }
}

function guidance(res: ACPhysicalResult): HTMLElement | null {
  const items = last?.items.filter((i) => i.level) ?? [];
  if (!items.length) return null;
  const crewId = AC().Profiles.currentId();
  return h(
    "div",
    { class: "panel ax-guidance", id: "ax-guidance" },
    h("h3", null, "Guía basada en evidencia"),
    h("p", { class: "aux" }, "Estos niveles usan umbrales con fuente citada de la capa de datos del equipo. Los demás signos usan rangos orientativos de demostración."),
    h(
      "div",
      { class: "ax-guide-list" },
      ...items.map((i) => {
        const m = res.metrics.find((x) => x.id === i.field);
        return h(
          "div",
          { class: "ax-guide " + levelClass(i.level) },
          h("div", { class: "ax-guide-head" }, h("b", null, m?.label ?? i.label), h("span", null, `${i.value} ${m?.unit ?? ""}`), levelTag(i.level), basisTag(i.threshold_basis)),
          i.action?.length ? h("ul", null, ...i.action.map((a) => h("li", null, a))) : null,
          i.action?.length && i.escalate_when ? h("p", { class: "aux" }, h("b", null, "Cuándo avisar: "), i.escalate_when) : null,
          h("button", { type: "button", class: "btn ghost ax-more", onclick: () => void openIndicatorDetail(i.indicator_id, crewId) }, "Por qué importa y evidencia"),
        );
      }),
    ),
    h("div", { class: "actions" }, h("button", { type: "button", class: "btn ghost", "data-go": "7" }, "🛰️ Ver mi tendencia en la misión")),
  );
}

function decorate(res: ACPhysicalResult): void {
  document.getElementById("ax-guidance")?.remove();
  if (!last) return;
  // Say where each color comes from, next to ApolloCare's own tag
  const bars = document.querySelectorAll<HTMLElement>("#vbars .vbar .st");
  res.metrics
    .filter((m) => !m.qualitative)
    .forEach((m, i) => {
      const st = bars[i];
      if (!st || st.querySelector(".ax-basis")) return;
      st.append(" ", m.basis ? basisTag(m.basis as never) : h("span", { class: "ax-basis" }, "Rango orientativo (criterio demo)"));
    });
  const block = guidance(res);
  if (block) document.querySelector("#s5 .res-grid")?.after(block);
}

async function saveToMission(): Promise<void> {
  const status = document.getElementById("ax-save-status");
  const consent = document.getElementById("physicalHistoryConsent") as HTMLInputElement | null;
  const res = AC().App.physical.result;
  const crewId = AC().Profiles.currentId();
  const member = crewById(crewId);
  // same conditions as ApolloCare's own save(); demo data never goes to the history
  if (!status || !consent?.checked || !res || res.demo || !backend.online || !crewId || !member) return;
  try {
    const r = await api.checkin(crewId, numericValues(), true);
    setText(
      status,
      r.items.length
        ? "✓ También guardado en tu historial de misión (pulso, temperatura y sueño)."
        : "Esta revisión no incluye pulso, temperatura ni sueño: nada que guardar en el historial de misión.",
    );
    refreshMonitor();
  } catch (e) {
    console.warn("[checkin] save", e);
    setText(
      status,
      e instanceof ApiError && e.status === 403
        ? "No se guardó en el historial de misión: este tripulante no ha dado su consentimiento."
        : "No se pudo guardar en el historial de misión (el servidor no respondió). Sí quedó guardada en este navegador.",
    );
  }
}

export function setupCheckin(): void {
  const diagnose = window.diagnosePhysical;
  const render = window.renderPhysical;
  if (!diagnose || !render) {
    console.warn("[integration] diagnosePhysical/renderPhysical not found; check-in stays local");
    return;
  }
  window.diagnosePhysical = async () => {
    const res = await diagnose();
    await evaluate(res);
    return res;
  };
  window.renderPhysical = (res) => {
    render(res);
    try {
      decorate(res);
    } catch (e) {
      console.warn("[checkin] decorate", e);
    }
  };

  const save = document.getElementById("savePhysicalHistory");
  const localStatus = document.getElementById("physicalHistoryStatus");
  if (save && localStatus) {
    localStatus.after(h("p", { class: "wellness-status", id: "ax-save-status", role: "status" }));
    save.addEventListener("click", () => void saveToMission());
  }
}

async function purge(): Promise<void> {
  const status = document.getElementById("physicalHistoryModalStatus");
  const crewId = AC().Profiles.currentId();
  const member = crewById(crewId);
  if (!crewId || !member) return;
  const q = tr(
    `¿Borrar del historial de misión todas las mediciones reales de ${member.name} (revisiones y pulso por cámara)? Los datos simulados de la demo se conservan.`,
    `Delete all of ${member.name}'s real measurements (check-ins and camera pulse) from the mission history? The simulated demo data is kept.`,
    `Supprimer de l’historique de mission toutes les mesures réelles de ${member.name} (bilans et pouls par caméra) ? Les données simulées de la démo sont conservées.`,
  );
  if (!confirm(q)) return;
  try {
    const r = await api.purgeEntries(crewId);
    if (status) setText(status, tr(`Mediciones borradas del historial de misión: ${r.deleted}.`, `Measurements deleted from the mission history: ${r.deleted}.`, `Mesures supprimées de l’historique de mission : ${r.deleted}.`));
    refreshMonitor();
  } catch (e) {
    console.warn("[checkin] purge", e);
    if (status) setText(status, "No se pudieron borrar las mediciones del historial de misión.");
  }
}

/** Texts of the history panel that stop being true once a backend is connected, and the way to take the consent back. */
export function describeStorage(): void {
  if (!backend.online) return;
  document
    .querySelector("#physicalHistoryOverlay .wellness-btn-row")
    ?.prepend(h("button", { type: "button", class: "btn ghost", id: "ax-purge", onclick: () => void purge() }, "Borrar mis mediciones del historial de misión"));
  const panel = document.querySelector(".physical-history-panel");
  const intro = panel?.querySelector("p.aux");
  if (intro) setText(intro, "Guarda los resultados que elijas y compáralos en futuras revisiones. Se guardan en este navegador y, si hay conexión, en la base de datos local de la misión (esta computadora). No salen a internet.");
  const label = document.getElementById("physicalHistoryConsent")?.parentElement;
  if (label) {
    const box = label.querySelector("input")!;
    label.replaceChildren(box, " ", "Autorizo guardar mis signos vitales, datos complementarios y respuestas de síntomas en este navegador, y mi pulso, temperatura y sueño en mi historial de misión (sin notas libres ni cámara). Puedo borrar los registros cuando quiera.");
  }
}
