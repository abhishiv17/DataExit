import { z } from "zod";
import { defineTool, type Register } from "@dataexit/runtime";
import { checkScamWithAi } from "./ai.js";

export const registerScamShield: Register = (server, ctx) => {
  defineTool(
    server,
    ctx,
    "check_scam",
    {
      description:
        "Rural mode: 'Is this a scam?'. Checks a forwarded message, screenshot text or voice-note transcript for scam signs " +
        "(OTP/PIN requests, KYC threats, fake officials, lookalike links, task jobs, loan apps). Returns a verdict, reasons, next steps " +
        "(1930, cybercrime.gov.in, Chakshu, bank) and a short reply in English, Hindi or Kannada ending with the safety line. " +
        "Add your own judgement, never call a message 'safe', and never ask the user for OTP, PIN or Aadhaar. The message is not stored.",
      inputSchema: {
        text: z.string().min(1).max(10_000),
        language: z.enum(["en", "hi", "kn"]).optional().describe("Reply language; detected from the text if omitted"),
      },
      annotations: { title: "Is this a scam?", readOnlyHint: true },
    },
    async (a) => checkScamWithAi(a),
  );
};
