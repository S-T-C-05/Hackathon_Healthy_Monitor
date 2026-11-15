/**
 * Face identification without React: same logic as vision/useIdentity.ts, but the
 * enrolled id is the crew id from the backend (crew_zelinda...), so a recognised face
 * selects the right ApolloCare profile and the right history.
 *
 * Privacy: only numeric descriptors are kept, in this browser's localStorage. No photos,
 * nothing is sent to the backend.
 */
import {
  getDescriptor,
  loadIdentityModels,
  loadRegistry,
  meanDescriptor,
  saveRegistry,
  type CrewMatch,
  type CrewRegistry,
} from "../vision/identity";

export const ENROLL_PROMPTS = [
  "Mira de frente a la cámara",
  "Gira un poco la cabeza a la izquierda",
  "Gira un poco la cabeza a la derecha",
  "Levanta un poco la barbilla",
  "Baja un poco la barbilla",
];
export const MIN_ENROLL_SHOTS = 3;

const IDENTIFY_SHOTS = 3;
const IDENTIFY_MAX_TRIES = 8;
const IDENTIFY_GAP_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let registry: CrewRegistry | null = null;
function reg(): CrewRegistry {
  registry ??= loadRegistry();
  return registry;
}

export function isEnrolled(crewId: string): boolean {
  return reg().list().some((c) => c.id === crewId);
}

export function enrolledCount(): number {
  return reg().list().length;
}

export function removeEnrollment(crewId: string): boolean {
  reg().remove(crewId);
  return saveRegistry(reg());
}

export type IdentifyResult =
  | { ok: true; match: CrewMatch }
  | { ok: false; reason: "nobody_enrolled" | "no_face" | "unknown"; detail?: string };

/** Identifies once whoever is in front of the camera (about 1-2 s). */
export async function identify(video: HTMLVideoElement): Promise<IdentifyResult> {
  if (reg().list().length === 0) return { ok: false, reason: "nobody_enrolled" };
  await loadIdentityModels();
  const shots: Float32Array[] = [];
  let lastReason = "";
  for (let i = 0; i < IDENTIFY_MAX_TRIES && shots.length < IDENTIFY_SHOTS; i++) {
    const r = await getDescriptor(video);
    if (r.ok) shots.push(r.descriptor);
    else lastReason = r.reason;
    await sleep(IDENTIFY_GAP_MS);
  }
  if (shots.length === 0) return { ok: false, reason: "no_face", detail: lastReason };
  const match = reg().identify(meanDescriptor(shots));
  return match ? { ok: true, match } : { ok: false, reason: "unknown" };
}

export type ShotResult = { ok: true; descriptor: Float32Array } | { ok: false; reason: string };

export async function captureShot(video: HTMLVideoElement): Promise<ShotResult> {
  await loadIdentityModels();
  return getDescriptor(video);
}

export type EnrollResult = { ok: true } | { ok: false; reason: "too_few" | "duplicate" | "storage"; other?: string };

/** Saves the shots under the crew id. Refuses a face already enrolled as someone else. */
export function finishEnroll(crewId: string, name: string, shots: Float32Array[]): EnrollResult {
  if (shots.length < MIN_ENROLL_SHOTS) return { ok: false, reason: "too_few" };
  const dup = reg().identify(meanDescriptor(shots));
  if (dup && dup.id !== crewId) return { ok: false, reason: "duplicate", other: dup.name };
  reg().enroll(name, shots, crewId);
  return saveRegistry(reg()) ? { ok: true } : { ok: false, reason: "storage" };
}

export function preloadIdentityModels(): void {
  loadIdentityModels().catch((e) => console.warn("[faceId] models not loaded", e));
}
