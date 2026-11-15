/** Small SVG charts for daily series (no chart library). */
import type { SeriesPoint, ThresholdRule } from "./api";

const NS = "http://www.w3.org/2000/svg";

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const LEVEL_VAR: Record<string, string> = { green: "var(--ok)", yellow: "var(--warn)", red: "var(--bad)" };

interface ChartOptions {
  width: number;
  height: number;
  baseline?: number | null;
  rules?: ThresholdRule[];
  dots?: boolean; // one dot per day, colored by level
  axis?: boolean; // min/max labels and first/last date
  label?: string;
}

export function seriesChart(points: SeriesPoint[], o: ChartOptions): SVGElement {
  const { width: W, height: H } = o;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "ax-chart", role: "img" });
  if (o.label) svg.setAttribute("aria-label", o.label);
  if (points.length < 2) return svg;

  const padL = o.axis ? 34 : 3;
  const padR = 6;
  const padT = 6;
  const padB = o.axis ? 16 : 4;

  const extra = [o.baseline, ...(o.rules ?? []).map((r) => r.value)].filter((v): v is number => typeof v === "number");
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  // show a threshold only if it is close to the data (otherwise it would flatten the curve)
  const span0 = max - min || Math.abs(max) * 0.1 || 1;
  for (const v of extra) {
    if (v > max && v - max < span0) max = v;
    if (v < min && min - v < span0) min = v;
  }
  const pad = (max - min || 1) * 0.08;
  min -= pad;
  max += pad;

  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const inRange = (v: number) => v >= min && v <= max;

  for (const r of o.rules ?? []) {
    if (!inRange(r.value)) continue;
    svg.append(
      el("line", {
        x1: padL, x2: W - padR, y1: y(r.value), y2: y(r.value),
        stroke: LEVEL_VAR[r.level], "stroke-width": 1, "stroke-dasharray": "2 3", opacity: 0.9,
      }),
    );
  }
  if (typeof o.baseline === "number" && inRange(o.baseline)) {
    svg.append(
      el("line", {
        x1: padL, x2: W - padR, y1: y(o.baseline), y2: y(o.baseline),
        stroke: "var(--text2)", "stroke-width": 1, "stroke-dasharray": "5 4", opacity: 0.6,
      }),
    );
  }

  svg.append(
    el("polyline", {
      points: points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" "),
      fill: "none", stroke: "var(--primary)", "stroke-width": o.dots ? 1.5 : 1.8,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    }),
  );

  const dot = (p: SeriesPoint, i: number, r: number) => {
    const c = el("circle", {
      cx: x(i), cy: y(p.value), r,
      fill: p.level ? LEVEL_VAR[p.level] : "var(--text2)", stroke: "var(--card)", "stroke-width": 1,
    });
    const t = el("title", {});
    t.textContent = `${p.date}: ${p.value}${p.source === "simulated" ? "" : " (" + p.source + ")"}`;
    c.append(t);
    svg.append(c);
  };
  if (o.dots) points.forEach((p, i) => dot(p, i, p.source === "simulated" ? 2.4 : 3.6));
  else dot(points[points.length - 1], points.length - 1, 3.2);

  if (o.axis) {
    const text = (s: string, tx: number, ty: number, anchor: string) => {
      const t = el("text", { x: tx, y: ty, "text-anchor": anchor, "font-size": 10, fill: "var(--text2)" });
      t.textContent = s;
      svg.append(t);
    };
    const round = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
    text(round(max - pad), padL - 4, padT + 8, "end");
    text(round(min + pad), padL - 4, H - padB, "end");
    text(points[0].date.slice(5), padL, H - 3, "start");
    text(points[points.length - 1].date.slice(5), W - padR, H - 3, "end");
  }
  return svg;
}
