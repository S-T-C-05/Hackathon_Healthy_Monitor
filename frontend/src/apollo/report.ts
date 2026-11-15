/**
 * "Print / Save as PDF" for both result screens.
 *
 * The app's screens are fixed, animated layers that print badly, so the report is a separate,
 * plain document (black on white, shapes next to colors) written into a hidden iframe and sent to
 * the browser's print dialog, where "Save as PDF" is one of the printers. Nothing leaves the browser.
 */
import type { Basis } from "./api";
import { cameraPulseUsed, lastEvaluation } from "./checkin";
import { currentCameraSummary } from "./cameraPanel";
import { CAMERA_DISCLAIMER, cameraRows, cameraVerdict, levelWord, type CamLevel } from "./cameraReport";
import { AC, h } from "./dom";
import { tr } from "./i18n";
import { basisText } from "./levels";

const SHAPE: Record<string, string> = { ok: "●", warn: "▲", bad: "■" };
const LOCALE: Record<string, string> = { es: "es-MX", en: "en-US", fr: "fr-FR" };

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const t = (s: string) => AC().Lang.t(s);

function chip(level: CamLevel): string {
  return level ? `<span class="chip ${level}">${SHAPE[level]} ${esc(levelWord(level))}</span>` : "";
}

/** Rows of a "question / answer" review list already rendered (and translated) on screen. */
function reviewRows(listId: string): [string, string][] {
  return [...document.querySelectorAll(`#${listId} .review-item`)].map((it) => [
    it.querySelector("strong")?.textContent?.trim() ?? "",
    it.querySelector("span")?.textContent?.trim() ?? "",
  ]);
}

function table(rows: [string, string][], head?: [string, string]): string {
  if (!rows.length) return "";
  return `<table>${head ? `<thead><tr><th>${esc(head[0])}</th><th>${esc(head[1])}</th></tr></thead>` : ""}<tbody>${rows
    .map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function header(title: string): string {
  const p = AC().Profiles.active();
  const lang = AC().Lang.current();
  const when = new Date().toLocaleString(LOCALE[lang] ?? "es-MX", { dateStyle: "long", timeStyle: "short" });
  return `<header><div class="brand">ApolloCare</div><h1>${esc(title)}</h1>
    <p class="meta"><b>${esc(tr("Tripulante", "Crew member", "Membre d’équipage"))}:</b> ${esc(p?.name ?? "–")}${p?.role ? ` · ${esc(t(p.role))}` : ""}
    &nbsp;·&nbsp; <b>${esc(tr("Fecha", "Date", "Date"))}:</b> ${esc(when)}</p></header>`;
}

function cameraSection(): string {
  const s = currentCameraSummary();
  if (!s) return "";
  const v = cameraVerdict(s);
  return `<section><h2>${esc(tr("Lo que midió la cámara", "What the camera measured", "Ce que la caméra a mesuré"))}</h2>
    <p class="verdict">${chip(v.level)} ${esc(v.text)}</p>
    <table><thead><tr><th>${esc(tr("Señal", "Signal", "Signal"))}</th><th>${esc(tr("Valor", "Value", "Valeur"))}</th><th>${esc(tr("Lectura", "Reading", "Lecture"))}</th></tr></thead><tbody>
    ${cameraRows(s)
      .map((r) => `<tr><td>${esc(r.label)}${r.note ? `<small>${esc(r.note)}</small>` : ""}</td><td>${esc(r.value)}</td><td>${chip(r.level)}</td></tr>`)
      .join("")}
    </tbody></table><p class="note">${esc(CAMERA_DISCLAIMER())}</p></section>`;
}

function physicalHtml(): string | null {
  const res = AC().App.physical.result;
  if (!res) return null;
  const worst = (["bad", "warn", "ok"] as const).find((w) => res.metrics.some((m) => m.status === w)) ?? "ok";
  const word = { ok: "Todo se ve en rango", warn: "Hay algo que vigilar", bad: "Requiere atención" }[worst];

  const vitals = res.metrics
    .map((m) => {
      const value = m.qualitative ? t(String(m.value)) : `${m.value} ${m.unit ? t(m.unit) : ""}`;
      const basis = m.basis ? t(basisText(m.basis as Basis)) : "";
      return `<tr><td>${esc(t(m.label))}${basis ? `<small>${esc(basis)}</small>` : ""}</td><td>${esc(value)}</td><td>${chip(m.status)}</td></tr>`;
    })
    .join("");

  const actions = (lastEvaluation()?.items ?? [])
    .filter((i) => i.level && i.action?.length)
    .map(
      (i) => `<div class="action"><b>${esc(t(i.label))}</b><ul>${(i.action ?? []).map((a) => `<li>${esc(t(a))}</li>`).join("")}</ul>${
        i.escalate_when ? `<p><b>${esc(tr("Cuándo avisar", "When to report", "Quand alerter"))}:</b> ${esc(t(i.escalate_when))}</p>` : ""
      }</div>`,
    )
    .join("");

  const context = document.getElementById("physicalContextSummary")?.textContent?.trim() ?? "";
  const pulse = cameraPulseUsed();
  return `${header(tr("Reporte de revisión física", "Physical check-in report", "Rapport de bilan physique"))}
    <section class="dx ${worst}"><h2>${chip(worst)} ${esc(t(word))}</h2><p>${esc(t(res.advice || ""))}</p>
      ${pulse !== null ? `<p class="note">${esc(tr(`Frecuencia cardíaca tomada de la cámara: ${pulse} lpm.`, `Heart rate taken from the camera: ${pulse} bpm.`, `Fréquence cardiaque prise par la caméra : ${pulse} bpm.`))}</p>` : ""}</section>
    <section><h2>${esc(tr("Signos vitales y síntomas", "Vital signs and symptoms", "Signes vitaux et symptômes"))}</h2>
      ${vitals ? `<table><thead><tr><th>${esc(tr("Indicador", "Indicator", "Indicateur"))}</th><th>${esc(tr("Valor", "Value", "Valeur"))}</th><th>${esc(tr("Lectura", "Reading", "Lecture"))}</th></tr></thead><tbody>${vitals}</tbody></table>` : `<p>${esc(tr("No se capturaron signos vitales.", "No vital signs were entered.", "Aucun signe vital saisi."))}</p>`}
    </section>
    ${actions ? `<section><h2>${esc(tr("Qué hacer", "What to do", "Que faire"))}</h2>${actions}</section>` : ""}
    ${cameraSection()}
    ${context ? `<section><h2>${esc(t("Datos complementarios"))}</h2><p class="pre">${esc(context)}</p></section>` : ""}
    ${(() => {
      const rows = reviewRows("physicalAnswersList");
      return rows.length ? `<section><h2>${esc(tr("Tus respuestas", "Your answers", "Vos réponses"))}</h2>${table(rows)}</section>` : "";
    })()}
    <footer>${esc(tr("Las clasificaciones son orientativas y no sustituyen la valoración del oficial médico de vuelo.", "Classifications are orientative and do not replace the flight surgeon's assessment.", "Les classifications sont indicatives et ne remplacent pas l’avis du médecin de bord."))}</footer>`;
}

function psychHtml(): string | null {
  const title = document.getElementById("psyTitle")?.textContent?.trim();
  if (!title) return null;
  const msg = document.getElementById("psyMsg")?.textContent?.trim() ?? "";
  const recs = [...document.querySelectorAll("#psyRecs > *")].map((e) => e.textContent?.trim() ?? "").filter(Boolean);
  const support = document.getElementById("psySupport")?.textContent?.trim() ?? "";
  const rows = reviewRows("psychAnswersList");
  return `${header(tr("Reporte de bienestar emocional", "Emotional wellbeing report", "Rapport de bien-être émotionnel"))}
    <section class="dx"><p class="kicker">${esc(t("Lo que percibimos hoy"))}</p><h2>${esc(title)}</h2><p>${esc(msg)}</p></section>
    ${recs.length ? `<section><h2>${esc(tr("Recomendaciones", "Recommendations", "Recommandations"))}</h2><ul>${recs.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></section>` : ""}
    ${rows.length ? `<section><h2>${esc(tr("Tus respuestas", "Your answers", "Vos réponses"))}</h2>${table(rows)}</section>` : ""}
    ${support ? `<section><p>${esc(support)}</p></section>` : ""}
    <footer>${esc(tr("Este cuestionario no es una escala clínica ni un diagnóstico de salud mental.", "This questionnaire is not a clinical scale nor a mental-health diagnosis.", "Ce questionnaire n’est ni une échelle clinique ni un diagnostic de santé mentale."))}</footer>`;
}

const CSS = `
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
/* No colors: black text, gray lines. The level is told by its word and shape (● ▲ ■), not by color. */
body { font: 11pt/1.5 system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #000; background: #fff; margin: 0; }
header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 14px; }
.brand { font-size: 10pt; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; }
h1 { font-size: 19pt; margin: 2px 0 4px; }
h2 { font-size: 13pt; margin: 0 0 8px; }
.meta { margin: 0; color: #333; font-size: 10pt; }
section { margin: 0 0 16px; break-inside: avoid-page; }
.dx { border: 1px solid #999; border-left: 6px solid #000; border-radius: 6px; padding: 10px 14px; }
.dx.ok { border-left-style: solid; } .dx.warn { border-left-style: double; } .dx.bad { border-left-width: 9px; }
.dx h2 { font-size: 15pt; }
.kicker { margin: 0; color: #333; font-size: 10pt; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #bbb; vertical-align: top; }
th { border-bottom: 1.5px solid #000; font-weight: 700; }
tr { break-inside: avoid; }
td small { display: block; color: #444; font-size: 8.5pt; }
.chip { display: inline-block; white-space: nowrap; font-size: 9pt; font-weight: 600; padding: 1px 7px; border-radius: 10px; border: 1px solid #000; color: #000; }
.chip.bad { font-weight: 800; border-width: 2px; }
.verdict { margin: 0 0 8px; }
.action { margin-bottom: 8px; } .action ul { margin: 2px 0 2px 18px; padding: 0; } .action p { margin: 0; }
.note { color: #444; font-size: 9pt; margin: 6px 0 0; }
.pre { white-space: pre-wrap; margin: 0; }
footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #999; color: #444; font-size: 9pt; }
`;

function printDocument(title: string, body: string): void {
  document.getElementById("ax-print-frame")?.remove();
  const frame = h("iframe", { id: "ax-print-frame", title: "print", "aria-hidden": "true", tabindex: "-1" });
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.append(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return;
  const lang = AC().Lang.current();
  doc.open();
  doc.write(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`);
  doc.close();
  setTimeout(() => {
    // The PDF file name comes from the page title in most browsers. Set it right before printing:
    // the translator rewrites the tab title whenever the page changes (e.g. when the iframe was added).
    const prevTitle = document.title;
    document.title = title;
    try {
      win.focus();
      win.print();
    } finally {
      document.title = prevTitle;
    }
  }, 200);
}

function fileTitle(kind: string): string {
  const name = (AC().Profiles.active()?.name ?? "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  const day = new Date().toISOString().slice(0, 10);
  return ["ApolloCare", kind, name, day].filter(Boolean).join("_");
}

export function printPhysical(): void {
  AC().sfx.click();
  const body = physicalHtml();
  if (!body) {
    AC().toast(tr("Todavía no hay resultados para imprimir.", "There are no results to print yet.", "Aucun résultat à imprimer pour l’instant."));
    return;
  }
  printDocument(fileTitle(tr("Revision-fisica", "Physical-check-in", "Bilan-physique")), body);
}

export function printPsych(): void {
  AC().sfx.click();
  const body = psychHtml();
  if (!body) {
    AC().toast(tr("Todavía no hay resultados para imprimir.", "There are no results to print yet.", "Aucun résultat à imprimer pour l’instant."));
    return;
  }
  printDocument(fileTitle(tr("Bienestar-emocional", "Emotional-wellbeing", "Bien-etre-emotionnel")), body);
}

const LABEL = "🖨️ Imprimir / Guardar PDF";

export function setupReport(): void {
  const physicalActions = document.querySelector("#s5 .res-grid .actions");
  physicalActions?.append(h("button", { type: "button", class: "btn ghost", id: "ax-print-physical", onclick: printPhysical }, LABEL));
  const psychActions = document.querySelector("#s6 .psy-wrap > .actions");
  psychActions?.prepend(h("button", { type: "button", class: "btn ghost", id: "ax-print-psych", onclick: printPsych }, LABEL));
}
