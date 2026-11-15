import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The app calls /api/...; in development Vite forwards it to the FastAPI backend.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: {
    rollupOptions: {
      // index.html = ApolloCare (the product). lab.html = the original camera test page.
      input: { main: "index.html", lab: "lab.html" },
    },
  },
});
