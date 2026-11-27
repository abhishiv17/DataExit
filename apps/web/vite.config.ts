import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

// Data source (see src/api.ts):
//   live: the Data Exit MCP tools. In `npm run dev` the dev server proxies /api/mcp to the local
//         HTTP server (`npm run start:http`) and adds MCP_HTTP_SECRET on the Node side, so the
//         secret is never in the browser bundle. Default whenever MCP_HTTP_SECRET is set.
//   demo: the seeded mock JSON. Default for `vite build` (the static site on Lambda has no MCP server
//         yet) and for dev without a secret. Override either way with VITE_DATA_SOURCE=live|demo.
export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, ROOT, ""), ...process.env };
  const secret = env.MCP_HTTP_SECRET ?? "";
  const port = env.MCP_HTTP_PORT || "8787";
  const source = env.VITE_DATA_SOURCE || (command === "serve" && secret ? "live" : "demo");

  return {
    define: { "import.meta.env.VITE_DATA_SOURCE": JSON.stringify(source) },
    // Bind to 127.0.0.1: Chrome can send oversized localhost cookies (HTTP 431).
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: secret
        ? {
            "/api/mcp": {
              target: `http://127.0.0.1:${port}`,
              changeOrigin: true,
              rewrite: () => `/mcp/${secret}`,
            },
          }
        : undefined,
    },
  };
});
