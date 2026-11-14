import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let instance: FaceLandmarker | null = null;
let loading: Promise<FaceLandmarker> | null = null;
let lastTimestamp = -1;

async function create(delegate: "GPU" | "CPU"): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true, // para head pose después
  });
}

export async function loadFaceLandmarker(): Promise<FaceLandmarker> {
  // Ya cargado -> reutilizar
  if (instance) return instance;
  // Cargando -> esperar la misma carga (evita doble descarga)
  if (loading) return loading;

  loading = (async () => {
    try {
      // Algunas compus/navegadores no soportan GPU: si falla, usar CPU
      instance = await create("GPU").catch(() => create("CPU"));
      return instance;
    } catch (e) {
      loading = null; // permitir reintentar si falló (p.ej. sin internet)
      throw e;
    }
  })();

  return loading;
}

export function detectFrame(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
  if (!instance) return null;

  // MediaPipe truena si el timestamp no va SIEMPRE en aumento
  if (timestampMs <= lastTimestamp) return null;
  lastTimestamp = timestampMs;

  const result = instance.detectForVideo(video, timestampMs);

  // Sin cara -> null
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

  return result;
}
