/** Opening and closing the webcam. One stream per <video>. */

export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera_unsupported");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  try {
    await video.play();
  } catch (e) {
    // "AbortError": play() was interrupted by a new srcObject; not fatal
    if (!(e instanceof DOMException && e.name === "AbortError")) {
      closeCamera(stream, video);
      throw e;
    }
  }
  return stream;
}

export function closeCamera(stream: MediaStream | null, video: HTMLVideoElement | null): void {
  stream?.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

/** Lets one camera user ask the others to release the webcam (profile overlay vs. check-in panel). */
const listeners = new Set<(owner: string) => void>();
export function onCameraClaim(fn: (owner: string) => void): void {
  listeners.add(fn);
}
export function claimCamera(owner: string): void {
  listeners.forEach((fn) => fn(owner));
}
