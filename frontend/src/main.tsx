import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Wellbeing from "./pages/Wellbeing";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Wellbeing />
  </StrictMode>
);
