import { z } from "zod";
import { defineTool, type Register } from "@dataexit/runtime";
import {
  checkReplies,
  classifyReply,
  deleteMyData,
  escalateRequest,
  exportEvidence,
  getAuditLog,
  listRequests,
  weeklyDigest,
} from "./ops.js";

const StatusZ = z.enum(["draft", "approved", "sent", "confirmed", "id_requested", "refused_retention", "redirected", "no_reply", "escalated"]);

export const registerTracker: Register = (server, ctx) => {
  defineTool(
    server,
    ctx,
    "list_requests",
    {
      description: "List the user's requests with status, deadline, days left and classified replies. Marks overdue requests as no_reply first.",
      inputSchema: {
        status: StatusZ.optional(),
        company_id: z.string().optional(),
        overdue_only: z.boolean().optional(),
        include_cancelled: z.boolean().optional(),
      },
      annotations: { title: "List requests", readOnlyHint: true },
    },
    (a, c) => listRequests(c, a),
  );

  defineTool(
    server,
    ctx,
    "check_replies",
    {
      description:
        "Check Gmail threads of sent requests for new replies, classify them (confirmed / id_requested / refused_retention / redirected / acknowledged) " +
        "and update statuses. Replies the rules cannot classify come back in needs_review for you to classify with classify_reply.",
      inputSchema: { request_ids: z.array(z.string()).optional() },
      annotations: { title: "Check replies", readOnlyHint: false, openWorldHint: true },
    },
    (a, c) => checkReplies(c, a),
  );

  defineTool(
    server,
    ctx,
    "classify_reply",
    {
      description:
        "Classify a company's reply. With only text: returns the rules' classification. With request_id + message_id: records it on the request; " +
        "pass classification to record your own judgement when the rules said unclear.",
      inputSchema: {
        text: z.string().optional(),
        request_id: z.string().optional(),
        message_id: z.string().optional(),
        classification: z.enum(["confirmed", "id_requested", "refused_retention", "redirected", "acknowledged"]).optional(),
        redirect_to: z.array(z.string().email()).optional(),
      },
      annotations: { title: "Classify reply", readOnlyHint: false },
    },
    (a, c) => classifyReply(c, a),
  );

  defineTool(
    server,
    ctx,
    "escalate_request",
    {
      description:
        "Draft the next escalation for an ignored or refused request: reminder → grievance officer → Data Protection Board complaint (DPB drafts are for " +
        "the user to file personally). Refuses when a bank or telecom validly cited KYC/licence retention: offer restrict-use instead.",
      inputSchema: {
        request_id: z.string(),
        level: z.enum(["reminder", "grievance_officer", "dpb"]).optional(),
        recipient: z.string().email().optional().describe("Grievance officer email if the directory has none"),
      },
      annotations: { title: "Escalate request", readOnlyHint: false },
    },
    (a, c) => escalateRequest(c, a),
  );

  defineTool(
    server,
    ctx,
    "export_evidence",
    {
      description: "Write a ZIP evidence bundle for a request and its escalations: timeline, Gmail message ids, sent texts and the verified audit chain.",
      inputSchema: { request_id: z.string() },
      annotations: { title: "Export evidence", readOnlyHint: false },
    },
    (a, c) => exportEvidence(c, a),
  );

  defineTool(
    server,
    ctx,
    "weekly_digest",
    {
      description:
        "Summary for the weekly chat/WhatsApp digest: confirmations, ID requests, ignored requests, new signups and upcoming deadlines, " +
        "with a ready-to-send text line in English or Hindi.",
      inputSchema: { days: z.number().int().positive().max(90).optional(), language: z.enum(["en", "hi"]).optional() },
      annotations: { title: "Weekly digest", readOnlyHint: true },
    },
    (a, c) => weeklyDigest(c, a),
  );

  defineTool(
    server,
    ctx,
    "get_audit_log",
    {
      description: "Return the hash-chained audit log (optionally for one request) and whether the chain is intact.",
      inputSchema: { target: z.string().optional(), limit: z.number().int().positive().max(1000).optional() },
      annotations: { title: "Audit log", readOnlyHint: true },
    },
    (a, c) => getAuditLog(c, a),
  );

  defineTool(
    server,
    ctx,
    "delete_my_data",
    {
      description:
        'Delete everything Data Exit holds about the user (footprint, requests, audit log, evidence files, Google token). Only after the user confirms; pass confirm: "DELETE".',
      inputSchema: { confirm: z.string(), disconnect_google: z.boolean().optional() },
      annotations: { title: "Delete my data", readOnlyHint: false, destructiveHint: true },
    },
    (a, c) => deleteMyData(c, a),
  );
};
