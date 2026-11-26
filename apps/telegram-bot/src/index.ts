#!/usr/bin/env node
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRoot, loadDotEnv } from "@dataexit/runtime";
import { checkScam } from "@dataexit/scam-shield/ops";
import { BOT_VERSION, routeMessage, type Request, type TelegramMessage } from "./handler.js";
import { answer, chooseLanguage, synthesize, transcribe, type ConversationTurn, type SpokenLanguage } from "./sarvam.js";

interface ApiResponse<T> { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } }
interface Update { update_id: number; message?: TelegramMessage }

const root = findRoot();
loadDotEnv(root);
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in the local .env before starting the Telegram bot.");
const sarvamKey = process.env.SARVAM_API_KEY?.trim();
if (!sarvamKey) throw new Error("Set SARVAM_API_KEY in the local .env before starting the Telegram bot.");
const allowed = new Set<number>();
for (const part of (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
  if (!/^-?\d+$/.test(part) || !Number.isSafeInteger(Number(part))) throw new Error("TELEGRAM_ALLOWED_CHAT_IDS must contain comma-separated numeric chat IDs.");
  allowed.add(Number(part));
}

const apiBase = `https://api.telegram.org/bot${token}/`;
async function api<T>(method: string, body: object | FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiBase + method, {
      method: "POST",
      ...(body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(method === "getUpdates" ? 35_000 : 15_000),
    });
  } catch {
    // Never include the token-bearing URL in logs or thrown errors.
    throw new Error(`Telegram ${method} network request failed`);
  }
  let data: ApiResponse<T>;
  try { data = await response.json() as ApiResponse<T>; }
  catch { throw new Error(`Telegram ${method} returned an invalid response (HTTP ${response.status})`); }
  if (!data.ok || data.result === undefined) {
    const retry = data.parameters?.retry_after ? ` Retry after ${data.parameters.retry_after}s.` : "";
    throw new Error(`Telegram ${method} failed (HTTP ${response.status}, code ${data.error_code ?? "unknown"}): ${data.description ?? "unknown error"}.${retry}`);
  }
  return data.result;
}

async function downloadVoice(fileId: string): Promise<Uint8Array> {
  const file = await api<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!file.file_path || (file.file_size ?? 0) > 10_000_000) throw new Error("Telegram voice file is unavailable or too large");
  const path = file.file_path.split("/").map(encodeURIComponent).join("/");
  let response: Response;
  try { response = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error("Telegram voice download failed"); }
  if (!response.ok) throw new Error(`Telegram voice download failed (HTTP ${response.status})`);
  const audio = new Uint8Array(await response.arrayBuffer());
  if (!audio.length || audio.length > 10_000_000) throw new Error("Telegram voice file is empty or too large");
  return audio;
}

async function sendText(request: Request, text: string): Promise<void> {
  await api("sendMessage", {
    chat_id: request.chatId,
    text,
    reply_parameters: { message_id: request.messageId, allow_sending_without_reply: true },
    ...(request.threadId !== undefined ? { message_thread_id: request.threadId } : {}),
    link_preview_options: { is_disabled: true },
  });
}

async function sendAudio(request: Request, audio: Uint8Array): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(request.chatId));
  form.append("reply_parameters", JSON.stringify({ message_id: request.messageId, allow_sending_without_reply: true }));
  if (request.threadId !== undefined) form.append("message_thread_id", String(request.threadId));
  form.append("voice", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "reply.mp3");
  await api("sendVoice", form);
}

const histories = new Map<string, ConversationTurn[]>();
async function handle(request: Request): Promise<void> {
  const historyKey = `${request.chatId}:${request.userId}`;
  if (request.action === "static") { await sendText(request, request.text ?? "Try /help."); return; }
  if (request.action === "reset") { histories.delete(historyKey); await sendText(request, "Conversation memory cleared. Ask me something new."); return; }

  let input = request.input;
  let languageHint: string | undefined;
  if (request.voiceFile) {
    try {
      const audio = await downloadVoice(request.voiceFile.file_id);
      const heard = await transcribe(sarvamKey!, audio, request.voiceFile.mime_type);
      input = heard.text;
      languageHint = heard.languageCode;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Voice transcription failed");
      await sendText(request, "I couldn't transcribe that voice note. Please try a clear note under 30 seconds. / वह आवाज़ समझ नहीं आई। कृपया 30 सेकंड से छोटी साफ़ रिकॉर्डिंग भेजें। / ಧ್ವನಿ ಅರ್ಥವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು 30 ಸೆಕೆಂಡಿಗಿಂತ ಚಿಕ್ಕ ಸ್ಪಷ್ಟ ಧ್ವನಿ ಸಂದೇಶ ಕಳುಹಿಸಿ.");
      return;
    }
  }
  if (!input) return;

  let reply: { text: string; languageCode: SpokenLanguage };
  try {
    reply = await answer(sarvamKey!, input, histories.get(historyKey) ?? [], request.action, languageHint);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Sarvam chat failed");
    const languageCode = chooseLanguage(input, languageHint);
    if (request.action === "check" && languageCode !== "kn-IN") {
      const firstCheck = checkScam({ text: input, language: languageCode === "hi-IN" ? "hi" : "en" });
      reply = { text: `${languageCode === "hi-IN" ? "AI उत्तर अभी उपलब्ध नहीं है। शुरुआती नियम-आधारित जाँच: " : "AI reply is unavailable. Rule-based first check: "}${firstCheck.reply_text}`, languageCode };
    } else {
      const unavailable = languageCode === "kn-IN"
        ? "ಕ್ಷಮಿಸಿ, AI ಉತ್ತರ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."
        : languageCode === "hi-IN"
          ? "माफ़ कीजिए, AI उत्तर अभी उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें।"
          : "The AI reply is unavailable right now. Please try again shortly.";
      await sendText(request, unavailable);
      return;
    }
  }
  const heardLabel = reply.languageCode === "kn-IN" ? "ನಾನು ಕೇಳಿದ್ದು" : reply.languageCode === "hi-IN" ? "मैंने सुना" : "I heard";
  const display = request.voiceFile ? `${heardLabel}: ${input.slice(0, 500)}\n\n${reply.text}` : reply.text;
  await sendText(request, display);
  histories.set(historyKey, [...(histories.get(historyKey) ?? []), { user: input, assistant: reply.text }].slice(-4));
  if (request.speak) {
    try {
      const audio = await synthesize(sarvamKey!, reply.text, reply.languageCode);
      await sendAudio(request, audio);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Audio reply failed");
      const audioError = reply.languageCode === "kn-IN"
        ? "ಪಠ್ಯ ಉತ್ತರ ಕಳುಹಿಸಿದ್ದೇನೆ, ಆದರೆ ಈ ಬಾರಿ ಧ್ವನಿ ಉತ್ತರ ಸೃಷ್ಟಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ."
        : reply.languageCode === "hi-IN"
          ? "टेक्स्ट जवाब भेज दिया है, लेकिन इस बार आवाज़ में जवाब नहीं बना पाया।"
          : "I sent the text reply, but couldn't create the audio reply this time.";
      await sendText(request, audioError);
    }
  }
}

const stateDir = join(root, ".data");
function loadOffset(statePath: string): number | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  } catch { /* first run */ }
  return undefined;
}
function saveOffset(statePath: string, offset: number): void {
  mkdirSync(stateDir, { recursive: true });
  const tmp = `${statePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(offset), { mode: 0o600 });
  renameSync(tmp, statePath);
}

async function main(): Promise<void> {
  const me = await api<{ id: number; username?: string }>("getMe", {});
  if (!me.username || !Number.isSafeInteger(me.id)) throw new Error("Telegram getMe did not return a valid bot identity.");
  const statePath = join(stateDir, `telegram-${me.id}-offset.json`);
  const webhook = await api<{ url: string }>("getWebhookInfo", {});
  if (webhook.url) throw new Error("This bot already has a webhook. Remove that webhook before using local polling.");
  console.error(`Telegram bot @${me.username} v${BOT_VERSION} ready with Sarvam AI and voice (en/hi/kn). Allowed chats: ${allowed.size}.`);
  let offset = loadOffset(statePath);
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  let delay = 1_000;
  while (!stopping) {
    try {
      const updates = await api<Update[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] });
      for (const update of updates) {
        if (offset !== undefined && update.update_id < offset) continue;
        if (update.message) {
          const request = routeMessage(update.message, me.username, me.id, allowed);
          if (request) await handle(request);
        }
        offset = update.update_id + 1;
        saveOffset(statePath, offset);
      }
      delay = 1_000;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Telegram polling failed");
      if (stopping) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30_000);
    }
  }
}

await main();
