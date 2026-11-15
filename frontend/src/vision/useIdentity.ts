import { useCallback, useRef, useState } from "react";
import {
  getDescriptor,
  loadIdentityModels,
  loadRegistry,
  meanDescriptor,
  saveRegistry,
  type CrewMatch,
  type CrewRegistry,
  type EnrolledCrew,
} from "./identity";

export type IdentityStatus = "idle" | "loading-models" | "identifying" | "identified" | "unknown" | "error";

/** Indicaciones para cada toma del registro: variar un poco el ángulo hace el registro más robusto */
export const ENROLL_PROMPTS = [
  "Mira de frente a la cámara",
  "Gira un poco la cabeza a la izquierda",
  "Gira un poco la cabeza a la derecha",
  "Levanta un poco la barbilla",
  "Baja un poco la barbilla",
];
export const MIN_ENROLL_SHOTS = 3;

const IDENTIFY_SHOTS = 3;      // descriptores a promediar para identificar
const IDENTIFY_MAX_TRIES = 8;  // intentos máximos (si no hay cara en algunos)
const IDENTIFY_GAP_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface EnrollState {
  name: string;
  shots: Float32Array[];
}

export function useIdentity() {
  const registryRef = useRef<CrewRegistry | null>(null);
  registryRef.current ??= loadRegistry();
  const busyRef = useRef(false); // getDescriptor es pesado: una operación a la vez

  const [crew, setCrew] = useState<EnrolledCrew[]>(() => registryRef.current!.list());
  const [status, setStatus] = useState<IdentityStatus>("idle");
  const [current, setCurrent] = useState<CrewMatch | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<EnrollState | null>(null);
  const [busy, setBusy] = useState(false);

  const withBusy = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const persist = useCallback(() => {
    const reg = registryRef.current!;
    if (!saveRegistry(reg)) setMessage("⚠️ No se pudo guardar el registro en este navegador");
    setCrew(reg.list());
  }, []);

  /** Identifica UNA vez a quien está frente a la cámara (no corre en el loop) */
  const identify = useCallback(
    (video: HTMLVideoElement) =>
      withBusy(async () => {
        const reg = registryRef.current!;
        if (reg.list().length === 0) {
          setStatus("idle");
          setMessage("No hay tripulantes registrados todavía");
          return;
        }
        try {
          setMessage(null);
          setStatus("loading-models");
          await loadIdentityModels();
          setStatus("identifying");

          const shots: Float32Array[] = [];
          let lastReason = "";
          for (let i = 0; i < IDENTIFY_MAX_TRIES && shots.length < IDENTIFY_SHOTS; i++) {
            const r = await getDescriptor(video);
            if (r.ok) shots.push(r.descriptor);
            else lastReason = r.reason;
            await sleep(IDENTIFY_GAP_MS);
          }
          if (shots.length === 0) {
            setStatus("unknown");
            setCurrent(null);
            setMessage(lastReason || "No se pudo leer la cara");
            return;
          }

          const match = reg.identify(meanDescriptor(shots));
          setCurrent(match);
          setStatus(match ? "identified" : "unknown");
          if (!match) setMessage("Cara no registrada");
        } catch (e) {
          setStatus("error");
          setMessage("Error al identificar: " + errMsg(e));
        }
      }),
    [withBusy],
  );

  const startEnroll = useCallback((name: string) => {
    if (!name.trim()) {
      setMessage("Escribe el nombre del tripulante");
      return;
    }
    setMessage(null);
    setEnrolling({ name: name.trim(), shots: [] });
    // Empezar a descargar los modelos mientras la persona se acomoda
    loadIdentityModels().catch((e) => setMessage("No se pudieron cargar los modelos: " + errMsg(e)));
  }, []);

  /** Captura una toma del registro (valida que sea buena) */
  const captureShot = useCallback(
    (video: HTMLVideoElement) =>
      withBusy(async () => {
        try {
          setMessage(null);
          await loadIdentityModels();
          const r = await getDescriptor(video);
          if (!r.ok) {
            setMessage(`Toma rechazada: ${r.reason}`);
            return;
          }
          setEnrolling((prev) => (prev ? { ...prev, shots: [...prev.shots, r.descriptor] } : prev));
        } catch (e) {
          setMessage("Error al capturar: " + errMsg(e));
        }
      }),
    [withBusy],
  );

  const finishEnroll = useCallback(() => {
    if (!enrolling) return;
    if (enrolling.shots.length < MIN_ENROLL_SHOTS) {
      setMessage(`Faltan tomas: mínimo ${MIN_ENROLL_SHOTS}`);
      return;
    }
    const reg = registryRef.current!;
    // Evitar registrar dos veces a la misma persona con otro nombre
    const dup = reg.identify(meanDescriptor(enrolling.shots));
    if (dup) {
      setMessage(`Esta cara ya está registrada como "${dup.name}". Bórralo primero si quieres volver a registrarlo.`);
      return;
    }
    const member = reg.enroll(enrolling.name, enrolling.shots);
    persist();
    setEnrolling(null);
    setMessage(`✅ ${member.name} registrado con ${member.descriptors.length} tomas`);
  }, [enrolling, persist]);

  const cancelEnroll = useCallback(() => {
    setEnrolling(null);
    setMessage(null);
  }, []);

  const removeCrew = useCallback(
    (id: string) => {
      registryRef.current!.remove(id);
      persist();
      setCurrent((c) => (c?.id === id ? null : c));
    },
    [persist],
  );

  /** Olvida quién está frente a la cámara (p.ej. al iniciar una nueva sesión) */
  const resetIdentity = useCallback(() => {
    setCurrent(null);
    setStatus("idle");
    setMessage(null);
  }, []);

  return {
    crew, status, current, message, enrolling, busy,
    identify, startEnroll, captureShot, finishEnroll, cancelEnroll, removeCrew, resetIdentity,
  };
}

export type IdentityApi = ReturnType<typeof useIdentity>;
