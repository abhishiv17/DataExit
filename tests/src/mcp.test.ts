// Protocol-level test: spawns the real all-in-one server over stdio, as Claude would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FIXTURES, ROOT } from "./helpers.js";

const CONTRACT_TOOLS = [
  "discover_footprint", "lookup_company", "draft_request", "approve_request", "send_request",
  "list_requests", "classify_reply", "escalate_request", "export_evidence", "check_scam",
];

test("all-in-one MCP server: contract tools, real calls, structured errors", async () => {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    DATAEXIT_DATA_DIR: mkdtempSync(join(tmpdir(), "dataexit-mcp-")),
    GMAIL_BACKEND: "fixture",
    GMAIL_FIXTURE: join(FIXTURES, "inbox.json"),
    DIRECTORY_CSV: join(FIXTURES, "companies.csv"),
    SEND_MODE: "dry_run",
    SCAM_AI_PROVIDER: "none",
    DATAEXIT_NOW: "2026-11-24T10:00:00+05:30",
    LOG_LEVEL: "warn",
    DATABASE_URL: "",
  };
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "servers", "dataexit", "dist", "index.js")], env }));
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const t of CONTRACT_TOOLS) assert.ok(names.includes(t), `missing tool ${t}`);
    assert.equal(tools.find((t) => t.name === "send_request")?.annotations?.destructiveHint, true);

    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
      const text = r.content[0].text;
      // Input-schema violations are reported by the SDK as plain text, not our JSON.
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      return { data, isError: !!r.isError };
    };

    const d = await call("discover_footprint", {});
    assert.equal(d.data.headline.companies, 10);

    const look = await call("lookup_company", { sms_sender_id: "VM-HDFCBK-S" });
    assert.equal(look.data.company.id, "hdfc-bank");
    assert.equal(look.data.company.erase_becomes_restrict, true);

    const err = await call("draft_request", { company_ids: ["paytm"], type: "erase" });
    assert.equal(err.isError, true);
    assert.equal(err.data.error, "NEED_USER_NAME");
    assert.ok(err.data.hint);

    const scam = await call("check_scam", { text: "Your PM Kisan installment is pending. Share OTP to receive Rs 6000: http://pmkisan-gov.xyz" });
    assert.equal(scam.data.verdict, "scam");
    assert.ok(scam.data.reply_text.includes("never ask for your OTP"));

    const bad = await call("draft_request", { company_ids: [], type: "erase" });
    assert.equal(bad.isError, true);
    assert.match(bad.data.raw, /company_ids/);
  } finally {
    await client.close();
  }
});

test("standalone scam-shield MCP serves Kannada checks over stdio", async () => {
  const client = new Client({ name: "scam-test", version: "0" });
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    DATAEXIT_DATA_DIR: mkdtempSync(join(tmpdir(), "dataexit-scam-mcp-")),
    GMAIL_BACKEND: "fixture",
    SEND_MODE: "dry_run",
    SCAM_AI_PROVIDER: "none",
    LOG_LEVEL: "warn",
    DATABASE_URL: "",
  };
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "servers", "scam-shield", "dist", "index.js")], env }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ["check_scam"]);
    const result = await client.callTool({ name: "check_scam", arguments: { text: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ಮುಚ್ಚುತ್ತದೆ. OTP ಹೇಳಿ." } }) as { content: Array<{ text: string }>; isError?: boolean };
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.language, "kn");
    assert.ok(data.flags.some((flag: { id: string }) => flag.id === "asks_otp"));
    assert.equal(data.ai.status, "disabled");
  } finally {
    await client.close();
  }
});

test("standalone scam-shield MCP serves authenticated HTTP", async (t) => {
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const secret = "test-secret-longer-than-24-characters";
  const child = spawn(process.execPath, [join(ROOT, "servers", "scam-shield", "dist", "index.js"), "--http"], {
    env: {
      ...process.env,
      DATAEXIT_DATA_DIR: mkdtempSync(join(tmpdir(), "dataexit-scam-http-")),
      SEND_MODE: "dry_run",
      SCAM_AI_PROVIDER: "none",
      MCP_HTTP_SECRET: secret,
      MCP_HTTP_HOST: "127.0.0.1",
      MCP_HTTP_PORT: String(port),
      LOG_LEVEL: "error",
      DATABASE_URL: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("scam HTTP server did not start")), 10_000);
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`scam HTTP server exited ${code}`)); });
      child.stderr.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("Scam-shield MCP listening")) { clearTimeout(timer); resolve(); }
      });
    });
    let unauthorized: Response;
    try { unauthorized = await fetch(`http://127.0.0.1:${port}/mcp/wrong`); }
    catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === "EACCES") { t.skip("loopback connections are blocked by this sandbox"); return; }
      throw error;
    }
    assert.equal(unauthorized.status, 404);
    const client = new Client({ name: "scam-http-test", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/${secret}`)));
    try {
      assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["check_scam"]);
      const result = await client.callTool({ name: "check_scam", arguments: { text: "Share OTP now" } }) as { content: Array<{ text: string }> };
      assert.equal(JSON.parse(result.content[0].text).ai.status, "disabled");
    } finally { await client.close(); }
  } finally { child.kill(); }
});
