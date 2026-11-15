/** Client for the FastAPI backend (backend/main.py). Everything goes through /api (Vite proxy in dev). */

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  sex: string;
  age: number;
  mission_day: number;
  mission_length_days: number;
  data_source: string;
  consent: { face_recognition: boolean; store_daily_history: boolean; consent_date: string | null };
}

export type Level = "green" | "yellow" | "red" | null;
export type Basis = "sourced" | "dataset_range" | "demo_criterion" | "none";

export interface IndicatorCard {
  id: string;
  label: string;
  system: string;
  kind: string;
  unit: string | null;
  input: string;
  concern_direction: string;
  why_in_space: string;
  how_to_measure: string;
  card_ids: string[];
  source_ids: string[];
  evidence_level: string;
  review_status: string;
  threshold_basis: Basis;
  threshold_type: string | null;
}

export interface OverviewRow extends IndicatorCard {
  n_days: number;
  baseline: number | null;
  recent: number | null;
  latest: number | null;
  pct: number | null;
  level: Level;
  action: string[] | null;
  escalate_when: string | null;
}

export interface Overview {
  crew: CrewMember;
  indicators: OverviewRow[];
}

export interface SeriesPoint {
  date: string;
  mission_day: number | null;
  value: number;
  unit: string | null;
  source: string;
  level: Level;
}

export interface Series {
  indicator: IndicatorCard;
  baseline: number | null;
  recent: number | null;
  pct: number | null;
  level: Level;
  points: SeriesPoint[];
}

export interface ThresholdRule {
  level: "yellow" | "red";
  op: string;
  value: number;
  unit: string | null;
  source_id: string;
  note: string | null;
}

export interface IndicatorFull extends IndicatorCard {
  thresholds: {
    type: string;
    status: string;
    warn_deviation_pct: number | null;
    alert_deviation_pct: number | null;
    by_sex: Record<string, { min: number; max: number }> | null;
    range_note: string | null;
    rules: ThresholdRule[];
    source_ids: string[];
  };
  actions: { yellow?: string[]; red?: string[] };
  escalate_when: string | null;
}

export interface EvidenceCard {
  card_id: string;
  category: string;
  title: string;
  scientific_summary: string;
  key_findings?: string[];
  limitations?: string[];
  operational_relevance?: string;
  source: string;
  validation_status?: string;
  evidence_type?: string;
}

export interface Source {
  id: string;
  label: string;
  title: string;
  year: number | null;
  type: string;
  url: string | null;
  checked: boolean;
}

export interface CheckinItem {
  field: string;
  indicator_id: string;
  label: string;
  value: number;
  unit: string | null;
  level: Level;
  threshold_basis: Basis;
  baseline: number | null;
  action: string[] | null;
  escalate_when: string | null;
  source_ids: string[];
  entry_id: number | null;
}

export interface CheckinResult {
  crew_id: string;
  stored: boolean;
  items: CheckinItem[];
  unmapped: string[];
}

export interface CameraSessionResult {
  stored: { indicator_id: string; value: number; entry_id: number }[];
  skipped: { indicator_id: string; reason: string }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown, method?: "DELETE"): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      let detail = r.statusText;
      try {
        const j = await r.json();
        detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      } catch {
        /* not JSON (e.g. the dev proxy answering while the backend is down) */
      }
      throw new ApiError(r.status, detail);
    }
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

export const api = {
  health: () => request<{ status: string; crew: number; indicators: number; cards: number }>("/api/health"),
  crew: () => request<CrewMember[]>("/api/crew"),
  overview: (crewId: string) => request<Overview>(`/api/crew/${enc(crewId)}/overview`),
  series: (crewId: string, indicatorId: string, days: number) =>
    request<Series>(`/api/crew/${enc(crewId)}/series/${enc(indicatorId)}?days=${days}`),
  indicator: (id: string) => request<IndicatorFull>(`/api/indicators/${enc(id)}`),
  evidenceFor: (indicatorId: string) => request<EvidenceCard[]>(`/api/evidence?indicator_id=${enc(indicatorId)}`),
  sources: () => request<Source[]>("/api/sources"),
  entry: (crewId: string, indicatorId: string, value: number, note?: string, source: "manual" | "camera" | "auto" = "manual") =>
    request<{ entry_id: number }>(`/api/crew/${enc(crewId)}/entries`, { indicator_id: indicatorId, value, source, note }),
  checkin: (crewId: string, values: Record<string, number | null>, store: boolean) =>
    request<CheckinResult>(`/api/crew/${enc(crewId)}/checkin`, { values, store }),
  purgeEntries: (crewId: string) => request<{ deleted: number }>(`/api/crew/${enc(crewId)}/entries`, undefined, "DELETE"),
  cameraSession: (crewId: string, summary: object) =>
    request<CameraSessionResult>(`/api/crew/${enc(crewId)}/camera-session`, summary),
};

/** Shared connection state, filled by main.ts at start-up. */
export const backend: { online: boolean; crew: CrewMember[] } = { online: false, crew: [] };

export function crewById(id: string | null): CrewMember | null {
  return backend.crew.find((m) => m.id === id) ?? null;
}
