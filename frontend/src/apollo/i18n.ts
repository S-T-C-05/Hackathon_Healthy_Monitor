/** Sentences with numbers or names in them (the static UI strings go through ApolloCare's own catalog, see strings.ts). */
import { AC } from "./dom";

export function tr(es: string, en: string, fr: string): string {
  const lang = window.ApolloCare ? AC().Lang.current() : "es";
  return lang === "en" ? en : lang === "fr" ? fr : es;
}
