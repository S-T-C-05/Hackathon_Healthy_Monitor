import { DrawingUtils, FaceLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Roi } from "./rppg";

// Estilo discreto: en estado normal casi no se nota; solo resalta cuando hay una alerta.
const COLORS = {
  mesh: "rgba(255, 255, 255, 0.06)",     // malla densa: apenas un velo
  contour: "rgba(159, 225, 203, 0.35)",  // óvalo y labios
  alert: "rgba(255, 159, 67, 0.95)",     // naranja: ojos cerrados / cabeza gacha / mirando a otro lado
  eyes: "rgba(134, 187, 255, 0.55)",
  iris: "rgba(201, 225, 255, 0.4)",
  pulseOk: "rgba(46, 204, 113, 0.8)",    // caja de la frente con señal confiable
  pulseWeak: "rgba(187, 187, 187, 0.5)", // caja de la frente con señal débil
};

const WIDTH = {
  mesh: 0.5,
  contour: 1,
  eyes: 1,
  alert: 2.5, // cuando algo se pone naranja, más grueso para que se note
};

export interface OverlayInfo {
  eyesClosed: boolean;
  yawning: boolean;
  attentionAlert: boolean; // cabeza gacha o mirando a otro lado
  roi: Roi | null;         // caja de la frente (en píxeles del video)
  roiLabel: string;
  roiReliable: boolean;
  showMesh: boolean;       // malla, contornos, ojos y caja del pulso; con false solo se dibujan las alertas en naranja
}

/**
 * Dibuja la malla y las zonas de medición sobre un <canvas> encima del video.
 * El canvas usa la resolución NATIVA del video (videoWidth x videoHeight) y el CSS lo escala;
 * así x * canvas.width cae en el píxel correcto. El espejo lo hace el CSS (scaleX(-1)), igual que el video.
 */
export class FaceOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly du: DrawingUtils;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible para el overlay");
    this.canvas = canvas;
    this.ctx = ctx;
    this.du = new DrawingUtils(ctx);
  }

  draw(video: HTMLVideoElement, lm: NormalizedLandmark[] | null, info: OverlayInfo) {
    const { canvas, ctx, du } = this;

    // Ajustar el tamaño interno al del video (solo cuando cambia)
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // SIEMPRE limpiar, si no la malla se queda "pegada" al mover la cara
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!lm) return;

    if (info.showMesh) {
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: COLORS.mesh, lineWidth: WIDTH.mesh });
    }

    // Óvalo: con la malla apagada solo aparece (en naranja) con cabeza gacha / mirando a otro lado
    if (info.attentionAlert) {
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: COLORS.alert, lineWidth: WIDTH.alert });
    } else if (info.showMesh) {
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: COLORS.contour, lineWidth: WIDTH.contour });
    }

    // Labios: con la malla apagada solo aparecen (en naranja) al bostezar
    if (info.yawning) {
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: COLORS.alert, lineWidth: WIDTH.alert });
    } else if (info.showMesh) {
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: COLORS.contour, lineWidth: WIDTH.contour });
    }

    // Ojos: con la malla apagada solo aparecen (en naranja) al cerrarlos
    if (info.eyesClosed) {
      const alertStyle = { color: COLORS.alert, lineWidth: WIDTH.alert };
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, alertStyle);
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, alertStyle);
    } else if (info.showMesh) {
      const eyeStyle = { color: COLORS.eyes, lineWidth: WIDTH.eyes };
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, eyeStyle);
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, eyeStyle);
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, { color: COLORS.iris, lineWidth: WIDTH.eyes });
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, { color: COLORS.iris, lineWidth: WIDTH.eyes });
    }

    // Caja de la frente (de aquí sale el pulso): solo con la malla encendida
    if (info.showMesh && info.roi) this.drawRoi(info.roi, info.roiLabel, info.roiReliable);
  }

  private drawRoi(roi: Roi, label: string, reliable: boolean) {
    const { canvas, ctx } = this;
    const color = reliable ? COLORS.pulseOk : COLORS.pulseWeak;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(roi.x, roi.y, roi.w, roi.h);

    // El CSS espeja el canvas, así que el texto saldría al revés.
    // Lo dibujamos en un contexto volteado: un punto X' aquí aparece en X' en pantalla.
    const fontPx = Math.max(12, Math.round(canvas.width / 40));
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = "bottom";
    const screenLeft = canvas.width - roi.x - roi.w; // borde izquierdo de la caja tal como se ve
    ctx.fillText(`❤ ${label}`, screenLeft, Math.max(fontPx, roi.y - 4));
    ctx.restore();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
