/**
 * Mission monitor (state 7): one card per indicator of the selected crew member, from
 * GET /api/crew/{id}/overview, with trend, level, action and the evidence behind it.
 */
import { api, backend, crewById, type IndicatorFull, type OverviewRow, type Source } from "./api";
import { seriesChart } from "./chart";
import { AC, h, fmt, setText } from "./dom";
import { tr } from "./i18n";
import { basisTag, levelClass, levelTag, systemText, unitText } from "./levels";

const STATE = 7;
let viewing: string | null = null; // crew member shown (defaults to the active profile)
let token = 0; // ignores answers that arrive after the user moved on
let sourcesCache: Promise<Map<string, Source>> | null = null;

function sources(): Promise<Map<string, Source>> {
  sourcesCache ??= api.sources().then((list) => new Map(list.map((s) => [s.id, s])));
  sourcesCache.catch(() => (sourcesCache = null));
  return sourcesCache;
}

function buildState(): void {
  const s = h(
    "section",
    { class: "state scroll", id: "s7", "data-state": String(STATE) },
    h(
      "div",
      { class: "wrap ax-monitor" },
      h(
        "div",
        { class: "head" },
        h("h2", null, "Monitoreo de misión"),
        h("p", null, "Tu tendencia durante la misión, comparada con tu propia línea base y con umbrales que citan su fuente."),
      ),
      h("div", { id: "ax-mon-crew", class: "ax-crew-switch" }),
      h("div", { id: "ax-mon-body" }),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn ghost", "data-go": "2" }, "Volver"),
        h("button", { class: "btn primary", "data-go": "3" }, "Hacer una revisión física"),
      ),
    ),
  );
  document.getElementById("app")!.append(s);

  const overlay = h(
    "div",
    { class: "overlay", id: "ax-detail-overlay", hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "ax-detail-title" },
    h(
      "div",
      { class: "overlay-panel ax-detail" },
      h("h2", { id: "ax-detail-title" }),
      h("div", { id: "ax-detail-body" }),
      h("div", { class: "wellness-btn-row" }, h("button", { type: "button", class: "btn primary", id: "closeAxDetail" }, "Cerrar")),
    ),
  );
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
  document.body.append(overlay);
  document.getElementById("closeAxDetail")!.addEventListener("click", () => (overlay.hidden = true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.hidden = true;
  });
}

function message(text: string, extra?: string): HTMLElement {
  return h("div", { class: "card ax-msg" }, h("p", null, text), extra ? h("p", { class: "aux" }, extra) : null);
}

function renderCrewSwitch(): void {
  const host = document.getElementById("ax-mon-crew")!;
  host.replaceChildren();
  if (!backend.online || backend.crew.length < 2) return;
  host.append(h("span", { class: "aux" }, "Vista de oficial médico (demo):"));
  for (const m of backend.crew) {
    host.append(
      h(
        "button",
        {
          type: "button",
          class: "chip" + (m.id === viewing ? " sel" : ""),
          "aria-pressed": String(m.id === viewing),
          onclick: () => {
            viewing = m.id;
            void load();
          },
        },
        m.name,
      ),
    );
  }
}

function signed(pct: number | null): string {
  if (pct === null) return "–";
  return (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct).toFixed(1) + "%";
}

function actionBlock(row: { action: string[] | null; escalate_when: string | null }): HTMLElement | null {
  if (!row.action?.length) return null;
  return h(
    "div",
    { class: "ax-actions" },
    h("strong", null, "Qué hacer ahora"),
    h("ul", null, ...row.action.map((a) => h("li", null, a))),
    row.escalate_when ? h("p", { class: "aux" }, h("b", null, "Cuándo avisar: "), row.escalate_when) : null,
  );
}

function indicatorCard(row: OverviewRow, crewId: string): HTMLElement {
  const spark = h("div", { class: "ax-spark" });
  api
    .series(crewId, row.id, 30)
    .then((s) => spark.replaceChildren(seriesChart(s.points, { width: 150, height: 44, baseline: s.baseline, label: row.label })))
    .catch(() => undefined);

  return h(
    "article",
    { class: "card ax-ind " + levelClass(row.level) },
    h("header", null, h("span", { class: "ax-sys" }, systemText(row.system)), levelTag(row.level)),
    h("h3", null, row.label),
    h(
      "div",
      { class: "ax-ind-main" },
      h("div", { class: "ax-num" }, fmt(row.latest, 2), h("small", null, " " + unitText(row.unit))),
      spark,
    ),
    h(
      "dl",
      { class: "ax-meta" },
      h("div", null, h("dt", null, "Tu línea base"), h("dd", null, fmt(row.baseline, 2))),
      h("div", null, h("dt", null, "Últimos 7 días"), h("dd", null, fmt(row.recent, 2))),
      h("div", null, h("dt", null, "Cambio"), h("dd", null, signed(row.pct))),
    ),
    basisTag(row.threshold_basis),
    actionBlock(row),
    h(
      "button",
      { type: "button", class: "btn ghost ax-more", onclick: () => void openIndicatorDetail(row.id, crewId) },
      "Por qué importa y evidencia",
    ),
  );
}

async function load(): Promise<void> {
  const my = ++token;
  const body = document.getElementById("ax-mon-body")!;
  renderCrewSwitch();
  if (!backend.online) {
    body.replaceChildren(
      message(
        "El monitoreo de misión necesita el servidor del equipo y ahora no responde.",
        "Inicia el backend (uvicorn backend.main:app --port 8000) y recarga la página. La revisión física y el bienestar emocional funcionan sin conexión.",
      ),
    );
    return;
  }
  const crewId = viewing ?? AC().Profiles.currentId();
  if (!crewId || !crewById(crewId)) {
    body.replaceChildren(message("Elige un perfil de la tripulación para ver su monitoreo."));
    return;
  }
  body.replaceChildren(h("p", { class: "aux ax-loading" }, "Cargando el historial de la misión…"));
  try {
    const ov = await api.overview(crewId);
    if (my !== token) return;
    const count = { red: 0, yellow: 0, green: 0, none: 0 };
    for (const r of ov.indicators) count[r.level ?? "none"]++;
    const c = ov.crew;
    const header = h(
      "div",
      { class: "card ax-mon-head" },
      h(
        "div",
        null,
        h("h3", null, c.name),
        h("p", { class: "aux" }, c.role),
        h("p", { class: "aux" }, h("span", null, "Día de misión"), ` ${c.mission_day} / ${c.mission_length_days}`),
      ),
      h(
        "div",
        { class: "ax-counts" },
        h("span", { class: "ax-count sev-bad" }, h("b", null, String(count.red)), h("span", null, "Atención")),
        h("span", { class: "ax-count sev-warn" }, h("b", null, String(count.yellow)), h("span", null, "Precaución")),
        h("span", { class: "ax-count sev-ok" }, h("b", null, String(count.green)), h("span", null, "En rango")),
      ),
    );
    const grid = h("div", { class: "ax-ind-grid" }, ...ov.indicators.map((r) => indicatorCard(r, crewId)));
    const note = h(
      "p",
      { class: "aux ax-note" },
      "Historial de demostración: misión simulada, más las mediciones reales que cada tripulante guardó con su consentimiento. Los colores no son un diagnóstico.",
    );
    body.replaceChildren(header, ov.indicators.length ? grid : message("Todavía no hay mediciones para este tripulante."), note);

    if (AC().TalkBack.isEnabled()) {
      const lang = AC().Lang.current();
      const say = {
        es: `Monitoreo de misión de ${c.name}. ${count.red} en atención, ${count.yellow} en precaución, ${count.green} en rango.`,
        en: `Mission monitor for ${c.name}. ${count.red} need attention, ${count.yellow} caution, ${count.green} in range.`,
        fr: `Suivi de mission de ${c.name}. ${count.red} en alerte, ${count.yellow} en prudence, ${count.green} dans la plage.`,
      };
      AC().TalkBack.say(say[lang], 300);
    }
  } catch (e) {
    if (my !== token) return;
    console.warn("[monitor]", e);
    body.replaceChildren(message("No se pudo cargar el monitoreo.", e instanceof Error ? e.message : String(e)));
  }
}

function thresholdBlock(ind: IndicatorFull, src: Map<string, Source>): HTMLElement {
  const t = ind.thresholds;
  const box = h("div", { class: "ax-detail-block" }, h("h4", null, "De dónde sale el color"), basisTag(ind.threshold_basis));
  if (ind.threshold_basis === "sourced" && t.rules.length) {
    box.append(
      h(
        "ul",
        null,
        ...t.rules.map((r) =>
          h(
            "li",
            null,
            levelTag(r.level),
            ` ${r.op} ${r.value} ${unitText(r.unit)}`,
            // the note in its own text node, so the translator can match it exactly
            r.note ? h("span", { class: "aux" }, " — ", h("span", null, r.note)) : null,
            h("span", { class: "aux" }, ` [${src.get(r.source_id)?.label ?? r.source_id}]`),
          ),
        ),
      ),
    );
  } else if (ind.threshold_basis === "demo_criterion") {
    box.append(
      h(
        "p",
        { class: "aux" },
        h("span", null, "Cambio respecto a tu línea base:"),
        ` ${t.warn_deviation_pct}% / ${t.alert_deviation_pct}%. `,
        h("span", null, "Son números redondos elegidos por el equipo para la demostración; no vienen de una fuente."),
      ),
    );
  } else if (ind.threshold_basis === "dataset_range" && t.by_sex) {
    box.append(
      h(
        "p",
        { class: "aux" },
        Object.entries(t.by_sex)
          .map(([sex, r]) => `${sex === "F" ? tr("Mujeres", "Women", "Femmes") : sex === "M" ? tr("Hombres", "Men", "Hommes") : sex}: ${r.min}–${r.max} ${unitText(ind.unit)}`)
          .join(" · "),
      ),
    );
    if (t.range_note) box.append(h("p", { class: "aux" }, t.range_note));
  } else {
    box.append(h("p", { class: "aux" }, "No encontramos un umbral publicado que podamos citar, así que solo mostramos tu tendencia."));
  }
  return box;
}

/** Explanation, thresholds, 60-day chart, evidence cards and sources of one indicator. */
export async function openIndicatorDetail(indicatorId: string, crewId: string | null): Promise<void> {
  const overlay = document.getElementById("ax-detail-overlay")!;
  const title = document.getElementById("ax-detail-title")!;
  const body = document.getElementById("ax-detail-body")!;
  setText(title, "…");
  body.replaceChildren(h("p", { class: "aux" }, "Cargando la evidencia…"));
  overlay.hidden = false;
  document.getElementById("closeAxDetail")!.focus();
  try {
    const [ind, cards, src, series] = await Promise.all([
      api.indicator(indicatorId),
      api.evidenceFor(indicatorId),
      sources(),
      crewId ? api.series(crewId, indicatorId, 60).catch(() => null) : Promise.resolve(null),
    ]);
    setText(title, ind.label);
    const parts: HTMLElement[] = [
      h("div", { class: "ax-detail-block" }, h("h4", null, "Por qué importa en el espacio"), h("p", null, ind.why_in_space)),
      h("div", { class: "ax-detail-block" }, h("h4", null, "Cómo se mide"), h("p", null, ind.how_to_measure)),
    ];
    if (series && series.points.length > 1) {
      const chart = seriesChart(series.points, {
        width: 500, height: 170, baseline: series.baseline, dots: true, axis: true, label: ind.label,
        rules: ind.threshold_basis === "sourced" ? ind.thresholds.rules : [],
      });
      parts.push(
        h(
          "div",
          { class: "ax-detail-block" },
          h("h4", null, "Tu tendencia (últimos 60 días)"),
          chart,
          h("p", { class: "aux" }, "Línea discontinua gris: tu línea base. Líneas punteadas de color: umbrales citados. Puntos grandes: mediciones reales."),
        ),
      );
    }
    parts.push(thresholdBlock(ind, src));
    if (cards.length) {
      parts.push(
        h(
          "div",
          { class: "ax-detail-block" },
          h("h4", null, "Evidencia en astronautas"),
          ...cards.map((c) =>
            h(
              "details",
              { class: "ax-evidence" },
              h("summary", null, c.title),
              h("p", null, c.scientific_summary),
              c.limitations?.length
                ? h("div", null, h("strong", null, "Limitaciones"), h("ul", null, ...c.limitations.map((l) => h("li", null, l))))
                : null,
              h("p", { class: "aux" }, c.source),
              c.validation_status ? h("span", { class: "ax-basis" }, `${c.card_id} · ${c.validation_status}`) : null,
            ),
          ),
        ),
      );
    }
    const list = ind.source_ids.map((id) => src.get(id)).filter((s): s is Source => !!s);
    if (list.length) {
      parts.push(
        h(
          "div",
          { class: "ax-detail-block" },
          h("h4", null, "Fuentes"),
          h(
            "ul",
            { class: "ax-sources" },
            ...list.map((s) =>
              h(
                "li",
                null,
                s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.label) : s.label,
                s.year ? ` (${s.year})` : "",
                h("span", { class: "aux" }, ` — ${s.title}`),
              ),
            ),
          ),
        ),
      );
    }
    parts.push(h("p", { class: "aux" }, "Resúmenes traducidos por el equipo a partir de fuentes en inglés; los títulos y las citas se dejan en su idioma original. Borrador pendiente de revisión por un profesional de la salud."));
    body.replaceChildren(...parts);
  } catch (e) {
    console.warn("[detail]", e);
    body.replaceChildren(h("p", null, "No se pudo cargar la evidencia."), h("p", { class: "aux" }, e instanceof Error ? e.message : String(e)));
  }
}

export function setupMonitor(): void {
  buildState();
  const ac = AC();
  ac.THEME[STATE] = "phys";
  ac.hooks.enter[STATE] = () => {
    viewing = ac.Profiles.currentId();
    void load();
  };
  ac.hooks.leave[STATE] = () => {
    token++;
    document.getElementById("ax-detail-overlay")!.hidden = true;
  };

  // Entry point on the "where do you want to start" screen
  const s2 = document.getElementById("s2");
  s2?.append(h("button", { type: "button", class: "ax-monitor-entry", "data-go": String(STATE) }, "🛰️ Monitoreo de misión"));
}

/** Called after the connection state changes or new data is saved. */
export function refreshMonitor(): void {
  if (AC().current === STATE) void load();
}
