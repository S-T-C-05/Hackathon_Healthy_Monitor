/** Tiny DOM helpers (no framework: ApolloCare is plain HTML/JS). */

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean | ((e: Event) => void)> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
      else if (typeof v === "boolean") {
        if (v) el.setAttribute(k, "");
      } else if (k === "class") el.className = v;
      else el.setAttribute(k, v);
    }
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Replace the text of an element. Always use this (never nodeValue): ApolloCare's
 *  translation layer remembers text nodes, so nodes must be replaced, not edited. */
export function setText(el: Element | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

export function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return String(Number(n.toFixed(digits))); // 36.60 -> "36.6", 7 -> "7"
}

export function AC() {
  const ac = window.ApolloCare;
  if (!ac) throw new Error("ApolloCare is not loaded");
  return ac;
}
