import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScam } from "@dataexit/scam-shield/ops";
import { aiConfig, checkScamWithAi, redactForModel, type AiConfig } from "@dataexit/scam-shield/ai";

const config: AiConfig = {
  provider: "groq",
  groqKey: "test-key",
  groqModel: "openai/gpt-oss-120b",
  anthropicModel: "claude-haiku-4-5-20251001",
};

test("Kannada scam rules detect OTP, job deposit and lost money without AI", () => {
  const otp = checkScam({ text: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ಮುಚ್ಚುತ್ತದೆ. OTP ಹೇಳಿ.", language: "kn" });
  assert.equal(otp.language, "kn");
  assert.ok(otp.flags.some((f) => f.id === "asks_otp"));
  assert.match(otp.reply_text, /OTP.*PIN.*ಆಧಾರ್/u);
  const job = checkScam({ text: "ದಿನಕ್ಕೆ 5000 ರೂಪಾಯಿ ಗಳಿಸಿ. ಮೊದಲು ಹಣ ಕಳುಹಿಸಿ." });
  assert.equal(job.language, "kn");
  assert.ok(job.flags.some((f) => f.id === "job_task"));
  const lost = checkScam({ text: "ನಾನು ಹಣ ಕಳುಹಿಸಿದೆ. ವಂಚನೆಗೆ ಒಳಗಾದೆ." });
  assert.equal(lost.lost_money, true);
  assert.match(lost.reply_text, /1930/);
  const unclear = checkScam({ text: "ನಾಳೆ ಭೇಟಿಯಾಗೋಣವೇ?" });
  assert.equal(unclear.verdict, "no_red_flags");
  assert.doesNotMatch(unclear.reply_text, /ಸುರಕ್ಷಿತವಾಗಿದೆ/);
});

test("Groq and Anthropic adapters keep rule verdict and safety line", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const mock = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return Response.json(calls.length === 1
      ? { choices: [{ message: { content: "The link imitates a bank domain." } }] }
      : { content: [{ type: "text", text: "The sender asks for your OTP." }] });
  }) as typeof fetch;
  const input = { text: "Share OTP 123456 to unlock your bank account at sbi-kyc.xyz?token=secret" };
  const groq = await checkScamWithAi(input, config, mock);
  assert.equal(groq.ai.status, "ok");
  assert.equal(groq.ai.provider, "groq");
  assert.equal(groq.verdict, checkScam(input).verdict);
  assert.ok(groq.reply_text.endsWith(groq.safety_line));
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.doesNotMatch(calls[0].init.body as string, /123456|token=secret/);
  const anthropic = await checkScamWithAi(input, { ...config, provider: "anthropic", anthropicKey: "test-anthropic-key" }, mock);
  assert.equal(anthropic.ai.status, "ok");
  assert.equal(anthropic.ai.provider, "anthropic");
  assert.equal(calls[1].url, "https://api.anthropic.com/v1/messages");
  assert.equal((calls[1].init.headers as Record<string, string>)["x-api-key"], "test-anthropic-key");
});

test("AI failure falls back to the same rule result", async () => {
  const input = { text: "Share your OTP now" };
  const failed = await checkScamWithAi(input, config, (async () => new Response("", { status: 503 })) as typeof fetch);
  assert.equal(failed.ai.status, "unavailable");
  assert.equal(failed.reply_text, checkScam(input).reply_text);
  assert.equal(aiConfig({ GROQ_API_KEY: "key" }).groqModel, "openai/gpt-oss-120b");
  assert.equal(redactForModel("OTP 123456, email me@site.com, https://x.com/?token=secret"), "OTP [number redacted], email [email redacted], https://x.com/?token=[redacted]");
});
