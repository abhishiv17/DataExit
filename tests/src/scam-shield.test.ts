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

test("every demo sample gets the right verdict; genuine OTP SMS are not flagged", () => {
  // The sample texts shown in apps/web/src/scam.ts (rural mode), checked by the same code the Lambda runs.
  const samples: Array<[string, string, "scam" | "likely_scam" | "no_red_flags"]> = [
    ["bank KYC", "प्रिय ग्राहक, आपका बैंक खाता आज रात बंद हो जाएगा। तुरंत KYC अपडेट करें: http://bit.ly/kyc-upd8", "scam"],
    ["electricity", "प्रिय उपभोक्ता, आपका पिछला बिल अपडेट नहीं हुआ है। आज रात 9:30 बजे बिजली कट जाएगी। तुरंत बिजली अधिकारी को 98XXXXX412 पर कॉल करें।", "likely_scam"],
    ["farmer scheme", "PM Kisan की अगली किस्त पाने के लिए आपके मोबाइल पर आया OTP इस नंबर पर बताएं।", "scam"],
    ["QR cashback", "आपको ₹2,000 कैशबैक मिला है। पैसे पाने के लिए QR स्कैन करें और UPI पिन डालें।", "scam"],
    ["digital arrest", "This is Mumbai Police Cyber Cell. A parcel in your name has drugs. You are under digital arrest. Join the video call now and do not tell your family.", "scam"],
    ["lottery", "Congratulations! You won ₹25,00,000 in the KBC lucky draw. Pay ₹5,000 processing fee to claim.", "scam"],
    ["part-time job", "Part time job! Like YouTube videos and earn ₹3000 daily. Join: t.me/earn_daily_job", "scam"],
    ["real OTP", "482913 is your OTP to log in. Do not share it with anyone. It is valid for 10 minutes.", "no_red_flags"],
  ];
  for (const [name, text, verdict] of samples) {
    const r = checkScam({ text });
    assert.equal(r.verdict, verdict, `${name}: got ${r.verdict} ${r.score} [${r.flags.map((f) => f.id)}]`);
  }

  for (const text of [
    "123456 is your OTP for login to HDFC Bank NetBanking. Do not share this OTP with anyone. -HDFC Bank",
    "आपका OTP 552301 है। इसे किसी को न बताएं।",
    "ನಿಮ್ಮ OTP 552301. ಯಾರೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.",
  ]) {
    const r = checkScam({ text });
    assert.equal(r.verdict, "no_red_flags", `${text}: ${r.flags.map((f) => f.id)}`);
    assert.doesNotMatch(r.reply_text, /\bsafe\b|सुरक्षित है/);
  }

  // "Do not share … except with our officer" is still an OTP request.
  const trick = checkScam({ text: "Do not share this OTP with anyone except our bank officer. Tell him the OTP when he calls." });
  assert.ok(trick.flags.some((f) => f.id === "asks_otp"));

  // Every flag has a Kannada reason.
  const kn = checkScam({ text: "This is CBI. Parcel has drugs. Join the video call now, do not tell your family. Scan QR to receive refund. Pay fee to claim. Like YouTube videos, earn ₹3000 daily. Call 98765 43210. t.me/x", language: "kn" });
  assert.ok(kn.flags.length >= 8);
  for (const f of kn.flags) assert.ok(f.reason && /[ಀ-೿]/.test(f.reason), `${f.id} has no Kannada reason`);
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

test("Kannada checks do not append an English AI explanation", async () => {
  const input = { text: "ನಿಮ್ಮ OTP ಹೇಳಿ", language: "kn" as const };
  const english = (async () => Response.json({ choices: [{ message: { content: "Share your OTP is a warning sign." } }] })) as typeof fetch;
  const result = await checkScamWithAi(input, config, english);
  assert.equal(result.ai.status, "unavailable");
  assert.equal(result.reply_text, checkScam(input).reply_text);
});
