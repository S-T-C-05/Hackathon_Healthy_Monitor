/** How a level from the backend is shown: ApolloCare severity class + word + shape (never color alone). */
import type { Basis, Level } from "./api";
import { h } from "./dom";

export const SEV_CLASS: Record<string, string> = { green: "sev-ok", yellow: "sev-warn", red: "sev-bad" };
export const AC_STATUS: Record<string, "ok" | "warn" | "bad"> = { green: "ok", yellow: "warn", red: "bad" };

const LEVEL_WORD: Record<string, string> = { green: "En rango", yellow: "Precaución", red: "Atención" };
const LEVEL_SHAPE: Record<string, string> = { green: "●", yellow: "▲", red: "■" };

export function levelClass(level: Level): string {
  return level ? SEV_CLASS[level] : "sev-none";
}

export function levelTag(level: Level): HTMLElement {
  return h(
    "span",
    { class: "ax-level " + levelClass(level) },
    h("i", { "aria-hidden": "true" }, level ? LEVEL_SHAPE[level] : "◇"),
    h("span", null, level ? LEVEL_WORD[level] : "Solo tendencia"),
  );
}

const BASIS_TEXT: Record<Basis, string> = {
  sourced: "Umbral con fuente citada",
  dataset_range: "Rango del laboratorio (datos NASA)",
  demo_criterion: "Criterio demo del equipo (sin fuente)",
  none: "Sin umbral citado: solo tendencia",
};

export function basisTag(basis: Basis): HTMLElement {
  return h("span", { class: "ax-basis ax-basis-" + basis }, BASIS_TEXT[basis]);
}

const UNIT: Record<string, string> = { degC: "°C", "min/day": "min/día" };
export function unitText(unit: string | null | undefined): string {
  return unit ? UNIT[unit] ?? unit : "";
}

const SYSTEM: Record<string, string> = {
  mental_sleep: "Mente y sueño",
  cardiovascular: "Cardiovascular",
  immune_metabolic: "Inmunidad y metabolismo",
  bone_muscle: "Huesos y músculos",
  radiation: "Radiación",
  environment: "Entorno de la misión",
};
export function systemText(system: string): string {
  return SYSTEM[system] ?? system;
}
