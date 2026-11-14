import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export interface RppgResult {
  bpm: number;
  hrv: number | null;   // SDNN ms (experimental)
  quality: number;      // 0..1
  reliable: boolean;    // quality >= umbral
  wave: number[];       // señal filtrada, para graficar
}

export interface Roi { x: number; y: number; w: number; h: number }

// ---------- Lectura de la frente ----------
const ROI_W = 32;
const ROI_H = 16;

/** Crea (una sola vez) el canvas chiquito donde se copia la frente */
export function createRoiContext(): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = ROI_W;
  canvas.height = ROI_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D no disponible");
  return ctx;
}

// Lee la media del canal verde de una caja del video.
export function roiGreenMean(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, roi: Roi): number {
  ctx.drawImage(video, roi.x, roi.y, roi.w, roi.h, 0, 0, ROI_W, ROI_H);
  const d = ctx.getImageData(0, 0, ROI_W, ROI_H).data;
  let sum = 0;
  for (let i = 1; i < d.length; i += 4) sum += d[i]; // d[i+0]=R, +1=G, +2=B, +3=A
  return sum / (d.length / 4);
}

// Bounding box de la frente (pares simétricos izq/der: 67/297, 69/299, 104/333, 108/337)
const FOREHEAD = [10, 151, 67, 297, 69, 299, 104, 333, 108, 337];
const SHRINK = 0.15; // encoger 15% por lado para no agarrar cabello/cejas

export function foreheadROI(lm: NormalizedLandmark[], videoW: number, videoH: number): Roi | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of FOREHEAD) {
    const p = lm[i];
    if (!p) return null;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  let w = (maxX - minX) * videoW;
  let h = (maxY - minY) * videoH;
  let x = minX * videoW + w * SHRINK;
  let y = minY * videoH + h * SHRINK;
  w *= 1 - 2 * SHRINK;
  h *= 1 - 2 * SHRINK;

  // No salirse del video
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.min(w, videoW - x);
  h = Math.min(h, videoH - y);
  return w >= 4 && h >= 4 ? { x, y, w, h } : null;
}

// ---------- Procesamiento de señal ----------
const FS = 30;              // Hz de remuestreo
const MIN_MS = 6000;        // mínimo de datos para estimar
const F_MIN = 0.7;          // 42 bpm
const F_MAX = 4.0;          // 240 bpm
const F_STEP = 0.01;        // 0.6 bpm de resolución
const PEAK_HALF_WIDTH = 0.1;
const QUALITY_MIN = 0.5;

function movingAverage(x: Float64Array, win: number): Float64Array {
  const n = x.length, half = Math.floor(win / 2);
  const ps = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + x[i];
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half), hi = Math.min(n, i + half + 1);
    out[i] = (ps[hi] - ps[lo]) / (hi - lo);
  }
  return out;
}

/** Potencia de la DFT evaluada en una frecuencia exacta f */
function dftPower(x: Float64Array, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  let re = 0, im = 0;
  for (let i = 0; i < x.length; i++) {
    re += x[i] * Math.cos(w * i);
    im -= x[i] * Math.sin(w * i);
  }
  return re * re + im * im;
}

/** SDNN a partir de picos en el tiempo (experimental con webcam) */
function estimateSdnn(x: Float64Array, fs: number, bpm: number): number | null {
  const expectedMs = 60_000 / bpm;
  const minGap = Math.round(0.6 * (expectedMs / 1000) * fs);
  const peaks: number[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > 0 && x[i] > x[i - 1] && x[i] >= x[i + 1]) {
      const last = peaks[peaks.length - 1];
      if (last !== undefined && i - last < minGap) {
        if (x[i] > x[last]) peaks[peaks.length - 1] = i;
      } else {
        peaks.push(i);
      }
    }
  }
  // Interpolación parabólica para precisión sub-muestra
  const times = peaks.map((i) => {
    const a = x[i - 1], b = x[i], c = x[i + 1];
    const d = a - 2 * b + c;
    const off = d !== 0 ? (0.5 * (a - c)) / d : 0;
    return ((i + off) / fs) * 1000;
  });
  const ibis: number[] = [];
  for (let k = 1; k < times.length; k++) {
    const ibi = times[k] - times[k - 1];
    if (Math.abs(ibi - expectedMs) <= 0.3 * expectedMs) ibis.push(ibi); // descartar latidos raros
  }
  if (ibis.length < 5) return null;
  const mean = ibis.reduce((a, b) => a + b, 0) / ibis.length;
  return Math.sqrt(ibis.reduce((a, b) => a + (b - mean) ** 2, 0) / (ibis.length - 1));
}

export class RppgTracker {
  private samples: { t: number; g: number }[] = [];
  private readonly windowMs = 10_000;

  push(green: number, t: number) {
    if (!Number.isFinite(green)) return;
    this.samples.push({ t, g: green });
    while (this.samples.length && t - this.samples[0].t > this.windowMs) this.samples.shift();
  }

  estimate(): RppgResult | null {
    const s = this.samples;
    if (s.length < 2) return null;
    const t0 = s[0].t;
    const span = s[s.length - 1].t - t0;
    // 1. Mínimo ~6 s de datos
    if (span < MIN_MS) return null;

    // 2. Remuestrear a FS Hz (interpolación lineal sobre rejilla uniforme)
    const n = Math.floor((span / 1000) * FS);
    const x = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = t0 + (i * 1000) / FS;
      while (j < s.length - 2 && s[j + 1].t < t) j++;
      const a = s[j], b = s[j + 1];
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      x[i] = a.g + k * (b.g - a.g);
    }

    // 3. Normalizar (cambio relativo), detrend con media móvil de 1 s y Hanning
    let mean = 0;
    for (const v of x) mean += v;
    mean /= n;
    if (mean <= 0) return null;
    for (let i = 0; i < n; i++) x[i] = x[i] / mean - 1;

    const trend = movingAverage(x, FS);
    const y = new Float64Array(n);
    const yw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      y[i] = x[i] - trend[i];
      yw[i] = y[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    }

    // 4. Periodograma en 0.7..4 Hz -> frecuencia del máximo
    const freqs: number[] = [];
    const power: number[] = [];
    let best = 0, fPeak = F_MIN, total = 0;
    for (let k = 0; F_MIN + k * F_STEP <= F_MAX + 1e-9; k++) {
      const f = F_MIN + k * F_STEP;
      const p = dftPower(yw, f, FS);
      freqs.push(f);
      power.push(p);
      total += p;
      if (p > best) { best = p; fPeak = f; }
    }
    if (total <= 0) return null;
    const bpm = 60 * fPeak;

    // 5. Calidad = potencia (pico + armónico) / potencia total de la banda
    let signal = 0;
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i];
      if (Math.abs(f - fPeak) <= PEAK_HALF_WIDTH || Math.abs(f - 2 * fPeak) <= PEAK_HALF_WIDTH) signal += power[i];
    }
    const quality = signal / total;

    // Onda suavizada para graficar y para HRV
    const wave = movingAverage(y, 5);

    // 6. (extra) HRV
    const hrv = estimateSdnn(wave, FS, bpm);

    return { bpm, hrv, quality, reliable: quality >= QUALITY_MIN, wave: Array.from(wave) };
  }

  /** Cuánto progreso hay hacia la primera estimación (0..1) */
  progress(): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    return Math.min(1, (s[s.length - 1].t - s[0].t) / MIN_MS);
  }

  reset() {
    this.samples = [];
  }
}
