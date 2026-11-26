import { test } from "node:test";
import assert from "node:assert/strict";
import { routeMessage, type TelegramMessage } from "@dataexit/telegram-bot/handler";
import { answer, chooseLanguage, synthesize, transcribe } from "@dataexit/telegram-bot/sarvam";

const allowed = new Set([-100123, 42]);
const base: TelegramMessage = { message_id: 7, chat: { id: -100123, type: "supergroup" }, from: { id: 11 } };

test("Telegram group runs only explicit commands and voice replies to the bot", () => {
  assert.equal(routeMessage({ ...base, text: "random group message" }, "DataExitBot", 99, allowed), null);
  assert.equal(routeMessage({ ...base, text: "/check@OtherBot suspicious" }, "DataExitBot", 99, allowed), null);
  const check = routeMessage({ ...base, text: "/check@DataExitBot", reply_to_message: { text: "Share your OTP now" } }, "DataExitBot", 99, allowed);
  assert.equal(check?.action, "check");
  assert.equal(check?.input, "Share your OTP now");
  const voice: TelegramMessage = { ...base, voice: { file_id: "file", duration: 10 } };
  assert.equal(routeMessage(voice, "DataExitBot", 99, allowed), null);
  assert.equal(routeMessage({ ...voice, reply_to_message: { from: { id: 99 } } }, "DataExitBot", 99, allowed)?.speak, true);
  assert.match(routeMessage({ ...voice, chat: { id: 42, type: "private" }, voice: { file_id: "file", duration: 31 } }, "DataExitBot", 99, allowed)!.text!, /30 seconds/);
});

test("Telegram private chat uses AI requests; allowlist and reset still apply", () => {
  const dm: TelegramMessage = { message_id: 8, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "What does KYC mean?" };
  assert.equal(routeMessage(dm, "DataExitBot", 99, allowed)?.action, "ask");
  assert.equal(routeMessage({ ...dm, text: "/reset" }, "DataExitBot", 99, allowed)?.action, "reset");
  assert.match(routeMessage({ ...dm, chat: { id: 55, type: "private" } }, "DataExitBot", 99, allowed)!.text!, /not enabled/);
  assert.equal(routeMessage({ ...dm, from: { is_bot: true } }, "DataExitBot", 99, allowed), null);
  assert.match(routeMessage({ ...dm, text: "/status@DataExitBot" }, "DataExitBot", 99, allowed)!.text!, /Kannada/);
  const spaced = routeMessage({ ...base, text: "/voice @DataExitBot ನನಗೆ ಸಹಾಯ ಬೇಕು" }, "DataExitBot", 99, allowed);
  assert.equal(spaced?.input, "ನನಗೆ ಸಹಾಯ ಬೇಕು");
  assert.equal(spaced?.speak, true);
});

test("Sarvam calls use STT, conversational AI and MP3 TTS contracts", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const mockFetch = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init! });
    if (String(url).endsWith("/speech-to-text")) return Response.json({ transcript: "नमस्ते", language_code: "hi-IN" });
    if (String(url).endsWith("/v1/chat/completions")) return Response.json({ choices: [{ message: { content: "मैं मदद कर सकता हूँ।" } }] });
    return Response.json({ audios: [Buffer.from("fake mp3").toString("base64")] });
  }) as typeof fetch;
  const heard = await transcribe("test-key", new Uint8Array([1, 2, 3]), "audio/ogg", mockFetch);
  assert.equal(heard.text, "नमस्ते");
  assert.equal((calls[0].init.body as FormData).get("model"), "saaras:v4");
  const reply = await answer("test-key", heard.text, [], "ask", heard.languageCode, mockFetch);
  assert.match(reply.text, /OTP/);
  assert.equal(reply.languageCode, "hi-IN");
  const chatBody = JSON.parse(calls[1].init.body as string);
  assert.equal(chatBody.model, "sarvam-105b-conversations");
  const audio = await synthesize("test-key", reply.text, reply.languageCode, mockFetch);
  assert.equal(Buffer.from(audio).toString(), "fake mp3");
  assert.equal(JSON.parse(calls[2].init.body as string).output_audio_codec, "mp3");
});

test("Kannada text and detected speech keep Kannada through chat and speech", async () => {
  assert.equal(chooseLanguage("ಈ ಸಂದೇಶ ನಿಜವೇ?"), "kn-IN");
  assert.equal(chooseLanguage("is this safe?", "kn-IN"), "kn-IN");
  const calls: RequestInit[] = [];
  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push(init!);
    return calls.length === 1
      ? Response.json({ choices: [{ message: { content: "ಈ ಲಿಂಕ್ ತೆರೆಯಬೇಡಿ." } }] })
      : Response.json({ audios: [Buffer.from("audio").toString("base64")] });
  }) as typeof fetch;
  const reply = await answer("test-key", "ಈ ಲಿಂಕ್ ಸುರಕ್ಷಿತವೇ?", [], "check", "kn-IN", mockFetch);
  assert.equal(reply.languageCode, "kn-IN");
  assert.match(reply.text, /ಆಧಾರ್/);
  await synthesize("test-key", reply.text, reply.languageCode, mockFetch);
  assert.equal(JSON.parse(calls[1].body as string).language_code, "kn-IN");
});

test("an English AI reply to a Kannada question is translated before sending", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const mockFetch = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), body: init!.body as string });
    return String(url).endsWith("/translate")
      ? Response.json({ translated_text: "ಇದು ಅನುಮಾನಾಸ್ಪದ ಸಂದೇಶ. ಹಣ ಕಳುಹಿಸಬೇಡಿ." })
      : Response.json({ choices: [{ message: { content: "This looks suspicious. Do not send money." } }] });
  }) as typeof fetch;
  const result = await answer("test-key", "ಮೊದಲು ಹಣ ಕಳುಹಿಸಲು ಕೇಳುತ್ತಿದ್ದಾರೆ. ಇದು ಮೋಸವೇ?", [], "ask", undefined, mockFetch);
  assert.equal(result.languageCode, "kn-IN");
  assert.match(result.text, /ಹಣ ಕಳುಹಿಸಬೇಡಿ/);
  assert.equal(calls.length, 2);
  const translateBody = JSON.parse(calls[1].body);
  assert.equal(translateBody.source_language_code, "en-IN");
  assert.equal(translateBody.target_language_code, "kn-IN");
});
