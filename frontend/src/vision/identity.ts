import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/";

/** Distancia máxima para considerar "es la misma persona" (face-api usa 0.6; 0.5 = menos falsos positivos) */
export const MATCH_THRESHOLD = 0.5;
const MIN_DETECTION_SCORE = 0.6;   // tomas con la cara poco clara se rechazan
const MIN_FACE_FRACTION = 0.15;    // la cara debe ocupar al menos 15% del ancho del video
const STORAGE_KEY = "crew-registry-v1";

// inputSize más grande que en expresión (224): aquí importa más la precisión que la velocidad
const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

// ---------- Modelos (se cargan solo cuando se usa registro/identificación, ~7 MB) ----------
let loading: Promise<void> | null = null;

export function loadIdentityModels(): Promise<void> {
  loading ??= (async () => {
    try {
      const nets = faceapi.nets;
      // tinyFaceDetector también lo usa la emoción, pero puede que esté apagada: cargarlo si falta
      await Promise.all([
        nets.tinyFaceDetector.isLoaded ? null : nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        nets.faceLandmark68Net.isLoaded ? null : nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        nets.faceRecognitionNet.isLoaded ? null : nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    } catch (e) {
      loading = null; // permitir reintentar (p.ej. sin internet)
      throw e;
    }
  })();
  return loading;
}

// ---------- Descriptor ----------
export type DescriptorResult =
  | { ok: true; descriptor: Float32Array }
  | { ok: false; reason: string };

/** Descriptor de 128-D del que está frente a la cámara, validando que la toma sea buena. Tarda ~100–300 ms. */
export async function getDescriptor(video: HTMLVideoElement): Promise<DescriptorResult> {
  // detectAll (y no detectSingle) para poder rechazar tomas con 2+ personas
  const dets = await faceapi.detectAllFaces(video, detectorOptions).withFaceLandmarks().withFaceDescriptors();
  if (dets.length === 0) return { ok: false, reason: "No se detecta ninguna cara" };
  if (dets.length > 1) return { ok: false, reason: "Hay más de una cara frente a la cámara" };

  const d = dets[0];
  if (d.detection.score < MIN_DETECTION_SCORE) return { ok: false, reason: "La cara no se ve clara (mejora la luz)" };
  if (d.detection.box.width < video.videoWidth * MIN_FACE_FRACTION) return { ok: false, reason: "Acércate un poco a la cámara" };

  return { ok: true, descriptor: d.descriptor };
}

/** Promedio de varios descriptores (más estable que uno solo) */
export function meanDescriptor(descs: Float32Array[]): Float32Array {
  const out = new Float32Array(128);
  for (const d of descs) for (let i = 0; i < 128; i++) out[i] += d[i] / descs.length;
  return out;
}

// ---------- Registro de tripulantes ----------
export interface EnrolledCrew {
  id: string;
  name: string;
  descriptors: number[][]; // number[][] y no Float32Array[] para poder serializar a JSON
  enrolledAt: number;
}

export interface CrewMatch {
  id: string;
  name: string;
  distance: number;
}

export class CrewRegistry {
  private crew: EnrolledCrew[] = [];
  private matcher: faceapi.FaceMatcher | null = null;

  list(): EnrolledCrew[] {
    return [...this.crew];
  }

  enroll(name: string, shots: Float32Array[]): EnrolledCrew {
    const member: EnrolledCrew = {
      id: crypto.randomUUID(),
      name: name.trim(),
      descriptors: shots.map((d) => Array.from(d)),
      enrolledAt: Date.now(),
    };
    this.crew.push(member);
    this.rebuild();
    return member;
  }

  remove(id: string) {
    this.crew = this.crew.filter((c) => c.id !== id);
    this.rebuild();
  }

  /**
   * El tripulante más parecido, si su distancia promedio está bajo el umbral.
   * FaceMatcher promedia la distancia del query a TODAS las tomas de cada persona.
   */
  identify(descriptor: Float32Array): CrewMatch | null {
    if (!this.matcher) return null;
    const best = this.matcher.findBestMatch(descriptor);
    if (best.label === "unknown") return null;
    const member = this.crew.find((c) => c.id === best.label);
    return member ? { id: member.id, name: member.name, distance: best.distance } : null;
  }

  private rebuild() {
    // FaceMatcher truena con lista vacía
    this.matcher = this.crew.length
      ? new faceapi.FaceMatcher(
          this.crew.map((c) => new faceapi.LabeledFaceDescriptors(c.id, c.descriptors.map((d) => new Float32Array(d)))),
          MATCH_THRESHOLD,
        )
      : null;
  }

  // Persistencia (localStorage por ahora; backend cuando lo integren)
  toJSON(): string {
    return JSON.stringify(this.crew);
  }

  loadJSON(json: string) {
    const data: unknown = JSON.parse(json);
    if (!Array.isArray(data)) throw new Error("Formato de registro inválido");
    // Validación mínima: ignorar entradas corruptas
    this.crew = data.filter(
      (c): c is EnrolledCrew =>
        typeof c?.id === "string" &&
        typeof c?.name === "string" &&
        Array.isArray(c?.descriptors) &&
        c.descriptors.length > 0 &&
        c.descriptors.every((d: unknown) => Array.isArray(d) && d.length === 128),
    );
    this.rebuild();
  }
}

/** Lee el registro guardado en este navegador (vacío si no hay o si está corrupto) */
export function loadRegistry(): CrewRegistry {
  const reg = new CrewRegistry();
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) reg.loadJSON(json);
  } catch (e) {
    console.warn("[identity] no se pudo leer el registro", e);
  }
  return reg;
}

export function saveRegistry(reg: CrewRegistry): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, reg.toJSON());
    return true;
  } catch (e) {
    console.warn("[identity] no se pudo guardar el registro", e);
    return false;
  }
}
