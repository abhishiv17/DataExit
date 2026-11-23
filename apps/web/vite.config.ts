import { defineConfig } from "vite";

// Bind to 127.0.0.1: Chrome can send oversized localhost cookies (HTTP 431).
export default defineConfig({
  server: { host: "127.0.0.1", port: 5173 },
});
