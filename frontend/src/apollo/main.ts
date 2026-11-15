/**
 * Integration entry point: connects the ApolloCare prototype (index.html) with the
 * FastAPI backend and with the camera modules in src/vision.
 *
 * ApolloCare stays a plain HTML page; this module only adds to it. If the backend is
 * down, ApolloCare keeps working exactly as the standalone prototype (local profiles).
 */
import "./apollo.css";
import { api, backend } from "./api";
import { setupCameraPanel } from "./cameraPanel";
import { describeStorage, setupCheckin } from "./checkin";
import { refreshMonitor, setupMonitor } from "./monitor";
import { setupProfiles } from "./profiles";
import { STRINGS } from "./strings";

async function connect(): Promise<void> {
  try {
    const [health, crew] = await Promise.all([api.health(), api.crew()]);
    backend.crew = crew;
    backend.online = health.status === "ok" && crew.length > 0;
  } catch (e) {
    backend.online = false;
    console.info("[integration] backend not reachable, running in local mode", e);
  }
}

function init(): void {
  const ac = window.ApolloCare;
  if (!ac?.hooks || !ac.Lang?.extend || !ac.Profiles?.useCrew) {
    console.error("[integration] index.html is not the integrated ApolloCare page. Run: python tools/integrate_apollocare.py <ApolloCare.html>");
    return;
  }
  ac.Lang.extend(STRINGS);
  setupMonitor();
  setupCameraPanel();
  setupCheckin();
  ac.Lang.apply();

  void connect().then(() => {
    setupProfiles();
    describeStorage();
    refreshMonitor();
    ac.toast(ac.Lang.t(backend.online ? "🛰️ Conectado a la base de datos de la misión" : "Sin conexión con el servidor de la misión: modo local"));
  });
}

init();
