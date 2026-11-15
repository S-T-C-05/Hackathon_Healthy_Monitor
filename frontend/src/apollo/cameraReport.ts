/**
 * Everything the camera measured, turned into report rows (results screen + printable report).
 * The cut-offs are the team's orientative criteria for a webcam, not clinical thresholds:
 * every row says so, and nothing here changes the color of the vital signs.
 */
import { fatigueLevel, type SessionSummary } from "../vision/aggregate";
import { h } from "./dom";
import { tr } from "./i18n";
import { levelTag } from "./levels";

export type CamLevel = "ok" | "warn" | "bad" | null;

export interface CamRow {
  key: string;
  label: string;
  value: string;
  level: CamLevel; // null = information only
  note?: string;
}

const LEVEL_API: Record<Exclude<CamLevel, null>, "green" | "yellow" | "red"> = { ok: "green", warn: "yellow", bad: "red" };

const EMOTION: Record<string, [string, string, string]> = {
  neutral: ["neutral", "neutral", "neutre"],
  happy: ["alegría", "happiness", "joie"],
  sad: ["tristeza", "sadness", "tristesse"],
  angry: ["enojo", "anger", "colère"],
  fearful: ["miedo", "fear", "peur"],
  disgusted: ["desagrado", "disgust", "dégoût"],
  surprised: ["sorpresa", "surprise", "surprise"],
};

const times = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function levelWord(level: CamLevel): string {
  if (level === "ok") return tr("En rango", "In range", "Dans la plage");
  if (level === "warn") return tr("Vigilar", "Watch", "À surveiller");
  if (level === "bad") return tr("Atención", "Needs attention", "Alerte");
  return "";
}

export function cameraRows(s: SessionSummary): CamRow[] {
  const rows: CamRow[] = [];
  const secs = Math.round(s.durationMs / 1000);
  rows.push({
    key: "duration",
    label: tr("Duración de la medición", "Measurement length", "Durée de la mesure"),
    value: secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`,
    level: null,
  });
  rows.push({
    key: "face",
    label: tr("Cara visible", "Face visible", "Visage visible"),
    value: `${s.faceVisiblePct}%`,
    level: s.faceVisiblePct < 60 ? "warn" : null,
    note: s.faceVisiblePct < 60 ? tr("Medición parcial: la cara salió del cuadro.", "Partial measurement: the face left the frame.", "Mesure partielle : le visage est sorti du cadre.") : undefined,
  });

  // Pulse (rPPG)
  const bpm = tr("lpm", "bpm", "bpm");
  rows.push({
    key: "pulse",
    label: tr("Pulso por cámara", "Camera pulse", "Pouls par caméra"),
    value: s.avgBpm !== null ? `${s.avgBpm} ${bpm} (${s.minBpm}–${s.maxBpm})` : tr("sin lecturas confiables", "no reliable readings", "aucune mesure fiable"),
    level: null,
    note: tr(`Señal confiable el ${s.heartReliablePct}% del tiempo.`, `Reliable signal ${s.heartReliablePct}% of the time.`, `Signal fiable ${s.heartReliablePct} % du temps.`) +
      (s.avgBpm !== null && s.heartReliablePct < 50 ? " " + tr("Confírmalo con un oxímetro.", "Confirm it with an oximeter.", "Confirmez avec un oxymètre.") : ""),
  });

  // Fatigue score (eyes + yawns + blink rate)
  const fl = fatigueLevel(s.avgFatigue);
  rows.push({
    key: "fatigue",
    label: tr("Fatiga observada", "Observed fatigue", "Fatigue observée"),
    value: `${s.avgFatigue}/100 (${tr("máx", "max", "max")} ${s.maxFatigue})`,
    level: fl === "alto" ? "bad" : fl === "medio" ? "warn" : "ok",
  });
  rows.push({
    key: "perclos",
    label: tr("Ojos cerrados (PERCLOS)", "Eyes closed (PERCLOS)", "Yeux fermés (PERCLOS)"),
    value: `${s.avgPerclos}%`,
    level: s.avgPerclos > 15 ? "bad" : s.avgPerclos > 8 ? "warn" : "ok",
    note: tr("% del tiempo con los ojos cerrados; más de 15% sugiere somnolencia.", "% of time with eyes closed; above 15% suggests drowsiness.", "% du temps les yeux fermés ; au-delà de 15 % : somnolence probable."),
  });
  rows.push({
    key: "blinks",
    label: tr("Parpadeos", "Blinks", "Clignements"),
    value:
      s.blinksPerMin !== null
        ? tr(`${s.blinksPerMin}/min (${s.totalBlinks} en total)`, `${s.blinksPerMin}/min (${s.totalBlinks} total)`, `${s.blinksPerMin}/min (${s.totalBlinks} au total)`)
        : String(s.totalBlinks),
    level: s.blinksPerMin === null ? null : s.blinksPerMin < 6 || s.blinksPerMin > 30 ? "warn" : "ok",
    note: s.blinksPerMin === null ? tr("Ritmo no calculado: la medición duró menos de 30 s.", "Rate not computed: under 30 s of measurement.", "Rythme non calculé : moins de 30 s de mesure.") : undefined,
  });
  rows.push({
    key: "yawns",
    label: tr("Bostezos", "Yawns", "Bâillements"),
    value: String(s.totalYawns),
    level: s.totalYawns >= 3 ? "bad" : s.totalYawns === 2 ? "warn" : "ok",
  });

  // Head pose
  rows.push({
    key: "headDown",
    label: tr("Cabeza gacha", "Head down", "Tête baissée"),
    value: tr(`${s.headDownPct}% del tiempo (${times(s.headDownEvents, "vez", "veces")})`, `${s.headDownPct}% of the time (${times(s.headDownEvents, "time", "times")})`, `${s.headDownPct} % du temps (${times(s.headDownEvents, "fois", "fois")})`),
    level: s.headDownPct > 40 ? "bad" : s.headDownPct > 15 ? "warn" : "ok",
  });
  rows.push({
    key: "away",
    label: tr("Mirando a otro lado", "Looking away", "Regard ailleurs"),
    value: tr(`${s.lookingAwayPct}% del tiempo (${times(s.lookingAwayEvents, "vez", "veces")})`, `${s.lookingAwayPct}% of the time (${times(s.lookingAwayEvents, "time", "times")})`, `${s.lookingAwayPct} % du temps (${times(s.lookingAwayEvents, "fois", "fois")})`),
    level: s.lookingAwayPct > 40 ? "bad" : s.lookingAwayPct > 15 ? "warn" : "ok",
  });

  // Facial expression (only if it was switched on)
  const emo = Object.entries(s.emotions).filter(([, p]) => (p ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (emo.length) {
    const name = (e: string) => tr(...(EMOTION[e] ?? [e, e, e]));
    rows.push({
      key: "expr",
    label: tr("Expresión facial", "Facial expression", "Expression faciale"),
      value: emo.slice(0, 3).map(([e, p]) => `${name(e)} ${p}%`).join(" · "),
      level: null,
      note: tr("Una expresión no demuestra un estado de ánimo.", "An expression does not prove a mood.", "Une expression ne prouve pas un état d’esprit."),
    });
  }
  return rows;
}

/** One sentence that sums up what the camera saw. */
export function cameraVerdict(s: SessionSummary): { level: CamLevel; text: string } {
  const rows = cameraRows(s);
  const drowsy = rows.some((r) => r.level === "bad" && ["fatigue", "perclos", "yawns"].includes(r.key));
  if (drowsy)
    return {
      level: "bad",
      text: tr(
        "La cámara observó señales claras de somnolencia. Descansa antes de tareas críticas y vuelve a medir.",
        "The camera saw clear signs of drowsiness. Rest before critical tasks and measure again.",
        "La caméra a observé des signes nets de somnolence. Reposez-vous avant les tâches critiques et refaites la mesure.",
      ),
    };
  if (rows.some((r) => r.level === "warn" || r.level === "bad"))
    return {
      level: "warn",
      text: tr("La cámara observó algunas señales que conviene vigilar.", "The camera saw a few signs worth watching.", "La caméra a observé quelques signes à surveiller."),
    };
  return {
    level: "ok",
    text: tr("La cámara no observó señales de fatiga ni de distracción.", "The camera saw no signs of fatigue or distraction.", "La caméra n’a observé aucun signe de fatigue ni de distraction."),
  };
}

export const CAMERA_DISCLAIMER = (): string =>
  tr(
    "Señales experimentales medidas con la cámara web y criterios orientativos del equipo. No son un diagnóstico médico.",
    "Experimental webcam signals and the team's orientative criteria. Not a medical diagnosis.",
    "Signaux expérimentaux mesurés par webcam et critères indicatifs de l’équipe. Ce n’est pas un diagnostic médical.",
  );

/** Card for the physical results screen (state 5). */
export function cameraBlock(s: SessionSummary): HTMLElement {
  const v = cameraVerdict(s);
  return h(
    "div",
    { class: "ax-camrep", id: "ax-camera-report" },
    h("h3", null, tr("📷 Lo que midió la cámara", "📷 What the camera measured", "📷 Ce que la caméra a mesuré")),
    h("p", { class: "ax-camrep-verdict" }, v.level ? levelTag(LEVEL_API[v.level]) : null, " ", v.text),
    h(
      "ul",
      { class: "ax-camrep-list" },
      ...cameraRows(s).map((r) =>
        h(
          "li",
          null,
          h("span", { class: "ax-camrep-lab" }, r.label),
          h("b", null, r.value),
          r.level ? levelTag(LEVEL_API[r.level]) : null,
          r.note ? h("small", null, r.note) : null,
        ),
      ),
    ),
    h("p", { class: "aux ax-dx-note" }, CAMERA_DISCLAIMER()),
  );
}
