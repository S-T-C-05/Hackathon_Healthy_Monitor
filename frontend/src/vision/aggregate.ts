import type { FatigueStats } from "./fatigue";
import type { Emotion } from "./expression";

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));

/**
 * Puntaje de fatiga 0..100 (heurística, ajústala con pruebas):
 *  - PERCLOS: 0.30 o más ya es somnolencia fuerte  -> hasta 60 pts
 *  - Bostezos en los últimos 5 min                  -> 10 pts c/u (máx 30)
 *  - Parpadeo anormal (<8/min = mirada fija, >25/min = ojos cansados) -> 10 pts
 */
export function computeFatigueScore(stats: FatigueStats): number {
  const perclosPts = clamp((stats.perclos / 0.3) * 60, 0, 60);
  const yawnPts = Math.min(stats.yawnsLast5Min, 3) * 10;
  const blinkPts = stats.blinksPerMin < 8 || stats.blinksPerMin > 25 ? 10 : 0;
  return Math.round(clamp(perclosPts + yawnPts + blinkPts));
}

export function fatigueLevel(score: number): "bajo" | "medio" | "alto" {
  if (score >= 60) return "alto";
  if (score >= 30) return "medio";
  return "bajo";
}

export interface SessionSummary {
  durationMs: number;
  avgFatigue: number;
  maxFatigue: number;
  totalBlinks: number;
  totalYawns: number;
  faceVisiblePct: number;
  emotions: Partial<Record<Emotion, number>>; // % del tiempo en cada emoción
}

/** Junta las muestras de toda la sesión para dar un resumen al final */
export class SessionAggregator {
  private startedAt: number | null = null;
  private lastT = 0;
  private samples = 0;
  private faceSamples = 0;
  private fatigueSum = 0;
  private maxFatigue = 0;
  private lastStats: FatigueStats | null = null;
  private emotionCounts: Partial<Record<Emotion, number>> = {};
  private emotionSamples = 0;

  add(t: number, stats: FatigueStats | null, fatigueScore: number | null, emotion: Emotion | null) {
    this.startedAt ??= t;
    this.lastT = t;
    this.samples++;

    if (stats && fatigueScore !== null) {
      this.faceSamples++;
      this.fatigueSum += fatigueScore;
      this.maxFatigue = Math.max(this.maxFatigue, fatigueScore);
      this.lastStats = stats;
    }
    if (emotion) {
      this.emotionCounts[emotion] = (this.emotionCounts[emotion] ?? 0) + 1;
      this.emotionSamples++;
    }
  }

  summary(): SessionSummary {
    const emotions: Partial<Record<Emotion, number>> = {};
    for (const [e, n] of Object.entries(this.emotionCounts) as [Emotion, number][]) {
      emotions[e] = Math.round((n / this.emotionSamples) * 100);
    }
    return {
      durationMs: this.startedAt === null ? 0 : this.lastT - this.startedAt,
      avgFatigue: this.faceSamples ? Math.round(this.fatigueSum / this.faceSamples) : 0,
      maxFatigue: this.maxFatigue,
      totalBlinks: this.lastStats?.blinks ?? 0,
      totalYawns: this.lastStats?.yawns ?? 0,
      faceVisiblePct: this.samples ? Math.round((this.faceSamples / this.samples) * 100) : 0,
      emotions,
    };
  }

  reset() {
    this.startedAt = null;
    this.lastT = 0;
    this.samples = 0;
    this.faceSamples = 0;
    this.fatigueSum = 0;
    this.maxFatigue = 0;
    this.lastStats = null;
    this.emotionCounts = {};
    this.emotionSamples = 0;
  }
}
