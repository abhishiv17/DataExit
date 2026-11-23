import { z } from "zod";
import { audit, defineTool, type Register } from "@dataexit/runtime";
import {
  approveRequests,
  draftRequests,
  getRequest,
  rejectRequest,
  sendRequests,
  undoRequest,
} from "./ops.js";

const RequestTypeZ = z.enum(["stop_marketing", "withdraw_consent", "access", "correct", "erase", "restrict"]);

export const registerRequestEngine: Register = (server, ctx) => {
  defineTool(
    server,
    ctx,
    "draft_request",
    {
      description:
        "Draft DPDP requests (English or Hindi) for one or more companies. Applies the retention check: erasure to banks, brokers, " +
        "telecoms, insurers and health companies becomes a restrict-use request. Returns drafts with tier (auto / one_tap / full_review), " +
        "the source emails and the full text. Drafts are not sent.",
      inputSchema: {
        company_ids: z.array(z.string()).min(1).max(50),
        type: RequestTypeZ,
        language: z.enum(["en", "hi"]).optional(),
        recipient: z.string().email().optional().describe("Override the directory's grievance email (single company)"),
        account_identifier: z.string().optional().describe("Registered phone/email/customer id; defaults to the user's email"),
        correction_details: z.string().optional().describe("Required for type=correct"),
        user_name: z.string().optional().describe("User's full name, saved for later requests"),
        user_email: z.string().email().optional(),
      },
      annotations: { title: "Draft requests", readOnlyHint: false, destructiveHint: false },
    },
    (a, c) => draftRequests(c, a),
  );

  defineTool(
    server,
    ctx,
    "approve_request",
    {
      description:
        "Record the USER's approval of drafted requests. Only call after the user explicitly approves in this conversation or the app. " +
        "full_review requests need reviewed: true, meaning the user saw the full text; they then get a 10-minute undo window before sending.",
      inputSchema: {
        request_ids: z.array(z.string()).min(1).max(50),
        reviewed: z.boolean().optional(),
        recipient: z.string().email().optional().describe("Set the recipient while approving a single request"),
      },
      annotations: { title: "Approve requests", readOnlyHint: false, destructiveHint: false },
    },
    (a, c) => approveRequests(c, a),
  );

  defineTool(
    server,
    ctx,
    "undo_request",
    {
      description: "Withdraw approval of a request that has not been sent yet (e.g. during the undo window). It returns to draft.",
      inputSchema: { request_id: z.string() },
      annotations: { title: "Undo approval", readOnlyHint: false },
    },
    (a, c) => undoRequest(c, a),
  );

  defineTool(
    server,
    ctx,
    "reject_request",
    {
      description: "Cancel a draft or approved request the user does not want.",
      inputSchema: { request_id: z.string(), reason: z.string().optional() },
      annotations: { title: "Reject request", readOnlyHint: false },
    },
    (a, c) => rejectRequest(c, a),
  );

  defineTool(
    server,
    ctx,
    "send_request",
    {
      description:
        "Send approved requests from the user's own Gmail and add each deadline to Google Calendar. With no ids, sends every approved " +
        "request whose undo window has ended. Respects SEND_MODE (dry_run / sandbox / live); the result says which mode ran.",
      inputSchema: { request_ids: z.array(z.string()).max(50).optional() },
      annotations: { title: "Send requests", readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    (a, c) => sendRequests(c, a),
  );

  defineTool(
    server,
    ctx,
    "get_request",
    {
      description: "Get one request with its full text, status, deadline and classified replies.",
      inputSchema: { request_id: z.string() },
      annotations: { title: "Get request", readOnlyHint: true },
    },
    (a, c) => getRequest(c, a),
  );

  defineTool(
    server,
    ctx,
    "set_preferences",
    {
      description:
        "Save the user's preferences: full name and email for signing requests, language (en/hi), and auto_low_risk " +
        "(let 'stop marketing' requests run without asking). Only change auto_low_risk when the user asks.",
      inputSchema: {
        user_name: z.string().optional(),
        user_email: z.string().email().optional(),
        language: z.enum(["en", "hi"]).optional(),
        auto_low_risk: z.boolean().optional(),
      },
      annotations: { title: "Set preferences", readOnlyHint: false },
    },
    async (a, c) => {
      const patch = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
      const settings = await c.store.saveSettings(c.userId, patch);
      await audit(c, { actor: "user", action: "set_preferences", details: { changed: Object.keys(patch) } });
      return settings;
    },
  );
};
