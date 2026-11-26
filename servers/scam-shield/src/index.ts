#!/usr/bin/env node
import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer, createContext, findRoot, loadDotEnv, runStdio } from "@dataexit/runtime";
import { registerScamShield } from "./tools.js";

const NAME = "dataexit-scam-shield";
const VERSION = "0.2.0";
loadDotEnv(findRoot());

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 20_000) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}

async function runHttp(): Promise<void> {
  const secret = process.env.MCP_HTTP_SECRET ?? "";
  if (secret.length < 24) throw new Error("Set MCP_HTTP_SECRET to a random string of 24+ characters for HTTP mode.");
  const host = process.env.MCP_HTTP_HOST || "127.0.0.1";
  const port = Number(process.env.MCP_HTTP_PORT || 8788);
  const ctx = await createContext(NAME);
  const http = createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    const match = path.match(/^\/mcp\/([^/]+)$/);
    if (!match || !safeEqual(match[1], secret)) { res.writeHead(404).end(); return; }
    if ((req.headers["content-length"] && Number(req.headers["content-length"]) > 20_000)) { res.writeHead(413).end(); return; }
    try {
      const server = buildServer(NAME, VERSION, ctx, [registerScamShield]);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      const body = req.method === "POST" ? await readJson(req) : undefined;
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid request" }));
    }
  });
  http.listen(port, host, () => console.error(`Scam-shield MCP listening at http://${host}:${port}/mcp/<secret>`));
  const close = async () => { http.close(); await ctx.close(); };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

if (process.argv.includes("--http")) await runHttp();
else await runStdio(NAME, VERSION, [registerScamShield]);
