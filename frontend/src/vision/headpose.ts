export interface HeadPose {
  pitch: number; // grados, + = cabeza hacia abajo (CALIBRAR el signo con PITCH_SIGN)
  yaw: number;   // grados, + = mira a un lado
  roll: number;  // grados, + = inclina la cabeza
}

const RAD2DEG = 180 / Math.PI;

// Si al bajar la cabeza el pitch relativo sale NEGATIVO, cambia esto a -1.
const PITCH_SIGN = -1;
const YAW_SIGH = -1;

export function headPoseFromMatrix(data: number[] | Float32Array): HeadPose {
  // column-major: fila i, col j -> data[j*4 + i]
  const r00 = data[0], r10 = data[1], r20 = data[2];
  const r21 = data[6], r22 = data[10];

  const pitch = Math.atan2(r21, r22);
  const yaw   = Math.atan2(-r20, Math.hypot(r21, r22));
  const roll  = Math.atan2(r10, r00);

  return { pitch: PITCH_SIGN * pitch * RAD2DEG, yaw: YAW_SIGH * yaw * RAD2DEG, roll: roll * RAD2DEG };
}

// Umbrales (calibra con tu cámara). Son RELATIVOS a la postura base.
export const HEAD_DOWN_PITCH = 20;   // grados: cabeza gacha (desconexión de la tarea)
export const LOOK_AWAY_YAW = 30;     // grados: mirando a un lado
const HYSTERESIS = 5;                // grados: para salir del estado hay que regresar 5° más (evita on/off rápido)
const MIN_DURATION_MS = 3000;        // la postura debe mantenerse al menos 3 s para contar
const CALIBRATION_MS = 2500;         // primeros 2.5 s con cara visible = postura base
const SMOOTHING = 0.3;               // 0..1, más alto = responde más rápido pero tiembla más
const GAP_RESET_MS = 1000;           // si la cara se pierde más de 1 s, reiniciar los contadores de duración

export function isHeadDown(pose: HeadPose, baselinePitch = 0): boolean {
  return pose.pitch - baselinePitch > HEAD_DOWN_PITCH;
}

export interface HeadPoseState {
  raw: HeadPose;               // pose suavizada absoluta
  relative: HeadPose;          // pose respecto a la postura base
  calibrated: boolean;
  calibrationProgress: number; // 0..1
  headDown: boolean;           // cabeza gacha sostenida >= MIN_DURATION_MS
  lookingAway: boolean;        // mirando a un lado sostenido >= MIN_DURATION_MS
  headDownEvents: number;
  lookingAwayEvents: number;
}

/** Calibra la postura base, suaviza la pose y detecta cabeza gacha / mirada a un lado sostenidas */
export class HeadPoseTracker {
  private smoothed: HeadPose | null = null;
  private calibStart: number | null = null;
  private calibSum = { pitch: 0, yaw: 0, roll: 0, n: 0 };
  private baseline: HeadPose | null = null;
  private lastT: number | null = null;

  private downSince: number | null = null;
  private awaySince: number | null = null;
  private headDown = false;
  private lookingAway = false;
  private headDownEvents = 0;
  private lookingAwayEvents = 0;

  update(pose: HeadPose, t: number): HeadPoseState {
    // Si la cara se perdió un rato, reiniciar los "desde cuándo"
    if (this.lastT !== null && t - this.lastT > GAP_RESET_MS) {
      this.downSince = null;
      this.awaySince = null;
    }
    this.lastT = t;

    // Suavizado exponencial (EMA) para quitar temblor
    const p = this.smoothed;
    const raw: HeadPose = p
      ? {
          pitch: p.pitch + SMOOTHING * (pose.pitch - p.pitch),
          yaw: p.yaw + SMOOTHING * (pose.yaw - p.yaw),
          roll: p.roll + SMOOTHING * (pose.roll - p.roll),
        }
      : { ...pose };
    this.smoothed = raw;

    // Calibración: promedio de los primeros CALIBRATION_MS
    if (!this.baseline) {
      this.calibStart ??= t;
      this.calibSum.pitch += raw.pitch;
      this.calibSum.yaw += raw.yaw;
      this.calibSum.roll += raw.roll;
      this.calibSum.n++;
      const progress = Math.min(1, (t - this.calibStart) / CALIBRATION_MS);
      if (progress < 1) return this.state(raw, { pitch: 0, yaw: 0, roll: 0 }, progress);

      const n = this.calibSum.n;
      this.baseline = { pitch: this.calibSum.pitch / n, yaw: this.calibSum.yaw / n, roll: this.calibSum.roll / n };
    }

    const b = this.baseline;
    const relative: HeadPose = { pitch: raw.pitch - b.pitch, yaw: raw.yaw - b.yaw, roll: raw.roll - b.roll };

    // Cabeza gacha sostenida (con histéresis)
    const downNow = this.headDown ? relative.pitch > HEAD_DOWN_PITCH - HYSTERESIS : relative.pitch > HEAD_DOWN_PITCH;
    if (downNow) {
      this.downSince ??= t;
      if (!this.headDown && t - this.downSince >= MIN_DURATION_MS) {
        this.headDown = true;
        this.headDownEvents++;
      }
    } else {
      this.downSince = null;
      this.headDown = false;
    }

    // Mirando a un lado sostenido (con histéresis)
    const absYaw = Math.abs(relative.yaw);
    const awayNow = this.lookingAway ? absYaw > LOOK_AWAY_YAW - HYSTERESIS : absYaw > LOOK_AWAY_YAW;
    if (awayNow) {
      this.awaySince ??= t;
      if (!this.lookingAway && t - this.awaySince >= MIN_DURATION_MS) {
        this.lookingAway = true;
        this.lookingAwayEvents++;
      }
    } else {
      this.awaySince = null;
      this.lookingAway = false;
    }

    return this.state(raw, relative, 1);
  }

  /** Vuelve a tomar la postura base (p.ej. si el usuario movió la laptop) */
  recalibrate() {
    this.baseline = null;
    this.calibStart = null;
    this.calibSum = { pitch: 0, yaw: 0, roll: 0, n: 0 };
    this.downSince = null;
    this.awaySince = null;
    this.headDown = false;
    this.lookingAway = false;
  }

  reset() {
    this.recalibrate();
    this.smoothed = null;
    this.lastT = null;
    this.headDownEvents = 0;
    this.lookingAwayEvents = 0;
  }

  private state(raw: HeadPose, relative: HeadPose, progress: number): HeadPoseState {
    return {
      raw,
      relative,
      calibrated: this.baseline !== null,
      calibrationProgress: progress,
      headDown: this.headDown,
      lookingAway: this.lookingAway,
      headDownEvents: this.headDownEvents,
      lookingAwayEvents: this.lookingAwayEvents,
    };
  }
}
