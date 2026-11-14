import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
const LEFT_EYE  = [362, 385, 387, 263, 373, 380];
const MOUTH = { top: 13, bottom: 14, left: 78, right: 308 };

// Umbrales (ajústalos probando con tu cámara)
const EAR_CLOSED = 0.21;    // menor a esto = ojo cerrado
const MAR_YAWN   = 0.6;     // mayor a esto = boca muy abierta
const YAWN_MIN_MS = 1500;   // boca abierta al menos 1.5 s = bostezo
const WINDOW_MS = 60_000;   // ventana para PERCLOS y parpadeos/min
const YAWN_WINDOW_MS = 5 * 60_000;

/**
 * Los landmarks vienen normalizados (x sobre el ancho, y sobre el alto).
 * Multiplicamos x por el aspect ratio (ancho/alto) para que las distancias
 * sean proporcionales a píxeles reales; si no, el EAR sale deformado.
 */
function dist(a: NormalizedLandmark, b: NormalizedLandmark, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

function eyeAspectRatio(lm: NormalizedLandmark[], idx: number[], aspect: number): number {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => lm[i]);
  return (dist(p2, p6, aspect) + dist(p3, p5, aspect)) / (2 * dist(p1, p4, aspect));
}

export function computeEAR(lm: NormalizedLandmark[], aspect = 1): number {
  return (eyeAspectRatio(lm, LEFT_EYE, aspect) + eyeAspectRatio(lm, RIGHT_EYE, aspect)) / 2;
}

export function computeMAR(lm: NormalizedLandmark[], aspect = 1): number {
  return (
    dist(lm[MOUTH.top], lm[MOUTH.bottom], aspect) /
    dist(lm[MOUTH.left], lm[MOUTH.right], aspect)
  );
}

export type FatigueStats = ReturnType<FatigueTracker["update"]>;

/** Lleva la cuenta de parpadeos, bostezos y PERCLOS a lo largo del tiempo */
export class FatigueTracker {
  blinks = 0;
  yawns = 0;
  private firstT: number | null = null;   // t del primer frame, para saber si la ventana ya se llenó
  private eyeClosed = false;
  private mouthOpenSince: number | null = null;
  private history: { t: number; closed: boolean }[] = [];
  private blinkTimes: number[] = [];
  private yawnTimes: number[] = [];

  /** @param aspect ancho/alto del video (video.videoWidth / video.videoHeight) */
  update(lm: NormalizedLandmark[], t: number, aspect = 1) {
    this.firstT ??= t;
    const ear = computeEAR(lm, aspect);
    const mar = computeMAR(lm, aspect);
    const closed = ear < EAR_CLOSED;

    // Parpadeo: el ojo pasa de cerrado a abierto
    if (this.eyeClosed && !closed) {
      this.blinks++;
      this.blinkTimes.push(t);
    }
    this.eyeClosed = closed;

    // Bostezo: boca abierta durante más de YAWN_MIN_MS
    if (mar > MAR_YAWN) {
      this.mouthOpenSince ??= t;
    } else {
      if (this.mouthOpenSince !== null && t - this.mouthOpenSince >= YAWN_MIN_MS) {
        this.yawns++;
        this.yawnTimes.push(t);
      }
      this.mouthOpenSince = null;
    }

    // Quitar datos viejos de las ventanas
    this.history.push({ t, closed });
    while (this.history.length && t - this.history[0].t > WINDOW_MS) this.history.shift();
    while (this.blinkTimes.length && t - this.blinkTimes[0] > WINDOW_MS) this.blinkTimes.shift();
    while (this.yawnTimes.length && t - this.yawnTimes[0] > YAWN_WINDOW_MS) this.yawnTimes.shift();

    // PERCLOS: % de TIEMPO con ojos cerrados en el último minuto.
    // Se pesa por el dt entre muestras, porque el frame rate no es constante.
    let closedMs = 0;
    let totalMs = 0;
    for (let i = 1; i < this.history.length; i++) {
      const dt = this.history[i].t - this.history[i - 1].t;
      totalMs += dt;
      if (this.history[i].closed) closedMs += dt;
    }
    const perclos = totalMs > 0 ? closedMs / totalMs : 0;

    // ¿Ya llevamos al menos un minuto observando? Hasta entonces, blinksPerMin
    // todavía no es una tasa real y no conviene juzgar el parpadeo.
    const elapsedMs = t - (this.firstT ?? t);

    return {
      ear,
      mar,
      closed,
      perclos,
      blinks: this.blinks,
      yawns: this.yawns,
      blinksPerMin: this.blinkTimes.length,   // conteo en la ventana de 60 s = parpadeos/min una vez que windowReady es true
      yawnsLast5Min: this.yawnTimes.length,
      elapsedMs,
      windowReady: elapsedMs >= WINDOW_MS,
    };
  }

  reset() {
    this.blinks = 0;
    this.yawns = 0;
    this.firstT = null;
    this.eyeClosed = false;
    this.mouthOpenSince = null;
    this.history = [];
    this.blinkTimes = [];
    this.yawnTimes = [];
  }
}