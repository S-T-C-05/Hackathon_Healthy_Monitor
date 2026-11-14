import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/";

export type Emotion = "neutral" | "happy" | "sad" | "angry" | "fearful" | "disgusted" | "surprised";

export interface ExpressionResult {
  emotion: Emotion;     // la emoción con mayor score
  confidence: number;   // score de esa emoción (0..1)
  valence: number;      // happy - (sad+angry+fearful+disgusted), de -1 a 1
}

let loaded = false;
let loading: Promise<void> | null = null;
// Opciones del detector: inputSize chico = más rápido (múltiplo de 32)
const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

export async function loadExpression(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      loaded = true;
    } catch (e) {
      loading = null; // permitir reintentar
      throw e;
    }
  })();

  return loading;
}

export async function detectExpression(video: HTMLVideoElement): Promise<ExpressionResult | null> {
  if (!loaded) return null;

  const r = await faceapi.detectSingleFace(video, detectorOptions).withFaceExpressions();
  if (!r) return null; // no encontró cara

  const e = r.expressions;
  // Emoción con mayor score
  let emotion: Emotion = "neutral";
  let confidence = 0;
  for (const key of ["neutral", "happy", "sad", "angry", "fearful", "disgusted", "surprised"] as Emotion[]) {
    if (e[key] > confidence) {
      emotion = key;
      confidence = e[key];
    }
  }

  const valence = Math.max(-1, Math.min(1, e.happy - (e.sad + e.angry + e.fearful + e.disgusted)));

  return { emotion, confidence, valence };
}
