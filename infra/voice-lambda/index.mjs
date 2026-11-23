// Data Exit live MVP on AWS Lambda (Function URL, ap-south-1 Mumbai). One function serves:
//   GET  /, /assets/*                         -> the web app (apps/web build, bundled into the zip)
//   POST /api/check {text, language?}         -> check_scam result (same code as the MCP scam-shield server)
//   POST /api/tts   {text, lang: hi|en|kn}    -> audio/mpeg from ElevenLabs (key stays server-side)
// The message text is never stored or logged.
import { readFile } from "node:fs/promises";
import { checkScam } from "./scam-shield/ops.js";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };
async function serveStatic(path) {
  const rel = path === "/" || !path.includes(".") ? "index.html" : path.replace(/^\/+/, "");
  if (rel.includes("..")) return null;
  try {
    const buf = await readFile(new URL(`./site/${rel}`, import.meta.url));
    const ext = rel.slice(rel.lastIndexOf("."));
    const immutable = rel.startsWith("assets/");
    return { statusCode: 200, isBase64Encoded: true, body: buf.toString("base64"),
      headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } };
  } catch {
    return null;
  }
}

const KEY = process.env.ELEVENLABS_API_KEY ?? "";
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
// eleven_v3 covers Kannada; multilingual v2 is fast and good for Hindi/English.
const MODEL = { kn: "eleven_v3", hi: "eleven_multilingual_v2", en: "eleven_multilingual_v2" };
const MAX_TTS = 700;

const json = (status, body) => ({ statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? "GET";
  const raw = event.rawPath ?? "/";
  if (method === "GET" && !raw.startsWith("/api/")) return (await serveStatic(raw)) ?? json(404, { error: "NOT_FOUND" });
  const path = raw.replace(/^\/api/, "");
  if (method === "GET" && path === "/health") return json(200, { ok: true, tts: Boolean(KEY) });
  if (method !== "POST") return json(405, { error: "METHOD" });

  let body;
  try {
    body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : event.body ?? "{}");
  } catch {
    return json(400, { error: "BAD_JSON" });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json(400, { error: "NO_TEXT" });

  if (path === "/check") {
    const language = body.language === "hi" || body.language === "en" ? body.language : undefined;
    return json(200, checkScam({ text: text.slice(0, 10_000), language }));
  }

  if (path === "/tts") {
    if (!KEY) return json(503, { error: "TTS_DISABLED" });
    const lang = ["hi", "en", "kn"].includes(body.lang) ? body.lang : "hi";
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_22050_32`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.slice(0, MAX_TTS), model_id: MODEL[lang] }),
    });
    if (!r.ok) {
      console.error("elevenlabs", r.status);
      return json(502, { error: "TTS_UPSTREAM", status: r.status });
    }
    const audio = Buffer.from(await r.arrayBuffer());
    return { statusCode: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }, body: audio.toString("base64"), isBase64Encoded: true };
  }
  return json(404, { error: "NOT_FOUND" });
};
