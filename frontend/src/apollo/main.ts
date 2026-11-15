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
import { setupPsychMission } from "./psychMission";
import { setupReport } from "./report";
import { STRINGS } from "./strings";
import { CONTENT_STRINGS } from "./contentStrings";

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
  ac.Lang.extend(CONTENT_STRINGS); // the backend's English knowledge base, in Spanish and French
  // English by default for a fresh browser; a stored choice (incl. the user's own) is respected.
  try {
    if (!localStorage.getItem("apolloCareLanguage")) ac.Lang.set("en");
  } catch {
    ac.Lang.set("en");
  }
  setupMonitor();
  setupPsychMission();
  setupCameraPanel();
  setupCheckin();
  setupReport();
  ac.Lang.apply();

  void connect().then(() => {
    setupProfiles();
    describeStorage();
    refreshMonitor();
    ac.toast(ac.Lang.t(backend.online ? "🛰️ Conectado a la base de datos de la misión" : "Sin conexión con el servidor de la misión: modo local"));
  });
}

init();
