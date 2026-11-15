/** Shape of the ApolloCare prototype (frontend/index.html) as seen from the integration modules. */
import type { CrewMember } from "./api";

export interface ACMetric {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  status: "ok" | "warn" | "bad";
  organ: string;
  min?: number;
  max?: number;
  qualitative?: boolean;
  basis?: string; // [integration] where the color comes from
}

export interface ACPhysicalResult {
  metrics: ACMetric[];
  advice: string;
  demo?: boolean;
}

export interface ACProfile {
  id: string;
  name: string;
  role?: string;
  demo?: boolean;
  crew?: boolean;
}

export interface ApolloCareApi {
  go(n: number, options?: { back?: boolean }): void;
  readonly current: number;
  App: {
    physical: { values: Record<string, number | null>; answers: Record<string, unknown>; result: ACPhysicalResult | null };
  };
  Profiles: {
    currentId(): string | null;
    active(): ACProfile | null;
    show(): void;
    close(): void;
    select(id: string): void;
    render(): void;
    useCrew(list: Pick<CrewMember, "id" | "name" | "role">[]): void;
    list(): ACProfile[];
    isCrewMode(): boolean;
    decorate: ((item: HTMLElement, profile: ACProfile) => void) | null;
  };
  hooks: { enter: Record<number, (() => void) | undefined>; leave: Record<number, (() => void) | undefined> };
  THEME: Record<number, string>;
  Lang: {
    current(): "es" | "en" | "fr";
    t(text: string): string;
    apply(root?: ParentNode): void;
    set(lang: "es" | "en" | "fr"): void;
    extend(more: Record<string, { en: string; fr: string }>): void;
  };
  TalkBack: { say(text: string, delay?: number): void; isEnabled(): boolean };
  toast(text: string): void;
  sfx: { click(): void; confirm(): void; soft(): void };
}

declare global {
  interface Window {
    ApolloCare?: ApolloCareApi;
    diagnosePhysical?: () => Promise<ACPhysicalResult>;
    renderPhysical?: (res: ACPhysicalResult) => void;
  }
}
