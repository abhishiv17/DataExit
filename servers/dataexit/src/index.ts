#!/usr/bin/env node
// All Data Exit tools in one MCP server.
//   stdio (Claude Code / Claude Desktop):  node servers/dataexit/dist/index.js
//   HTTP  (claude.ai custom connector):    node servers/dataexit/dist/index.js --http
import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer, createContext, runStdio } from "@dataexit/runtime";
import { ALL_REGISTERS, SERVER_NAME, SERVER_VERSION } from "./registers.js";

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function runHttp() {
  const secret = process.env.MCP_HTTP_SECRET ?? "";
  if (secret.length < 24) {
    console.error("Refusing to start: set MCP_HTTP_SECRET to a random string of 24+ characters (it becomes part of the URL).");
    process.exit(1);
  }
  const host = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
  const port = Number(process.env.MCP_HTTP_PORT ?? 8787);
  const ctx = await createContext(SERVER_NAME);

  const http = createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    const m = path.match(/^\/mcp\/([^/]+)$/);
    if (!m || !safeEqual(m[1], secret)) {
      res.writeHead(404).end();
      return;
    }
    try {
      // Stateless: a fresh server + transport per request; state lives in the store.
      const server = buildServer(SERVER_NAME, SERVER_VERSION, ctx, ALL_REGISTERS);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      const body = req.method === "POST" ? await readJson(req) : undefined;
      await transport.handleRequest(req, res, body);
    } catch (e) {
      ctx.log.error("http request failed", { err: (e as Error).message });
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "internal" }));
    }
  });
  http.listen(port, host, () => {
    console.error(`Data Exit MCP over HTTP at http://${host}:${port}/mcp/<MCP_HTTP_SECRET>`);
  });
}

if (process.argv.includes("--http")) await runHttp();
else await runStdio(SERVER_NAME, SERVER_VERSION, ALL_REGISTERS);
