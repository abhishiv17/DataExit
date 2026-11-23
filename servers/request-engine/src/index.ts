#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  adjustForRetention,
  legalBasisOn,
  RESPONSE_DEADLINE_DAYS,
  RETENTION_LABELS,
  SECTION_REFS,
  type RequestType,
} from "@dataexit/shared";
import { classifyTier } from "@dataexit/policy";
import { classifyReply } from "./classify.js";
import { LEGAL_BASIS_NOTE, loadTemplate, missingPlaceholders, render } from "./templates.js";

const server = new McpServer({ name: "dataexit-request-engine", version: "0.1.0" });

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const RequestTypeZ = z.enum(["stop_marketing", "withdraw_consent", "access", "correct", "erase", "restrict_use"]);
const SectorZ = z.enum([
  "ecommerce", "food_delivery", "social", "bank", "fintech", "broker", "insurance",
  "telecom", "health", "travel", "edtech", "gaming", "utility", "government", "other",
]);
const RetentionZ = z.array(z.enum(["rbi_kyc", "pmla", "telecom_licence", "tax", "medical"]));
const DAY = 24 * 60 * 60 * 1000;

server.registerTool(
  "recommend_request",
  {
    description: "Recommend the request type for a company given the user's goal. Turns erasure into restrict-use when a law requires the company to retain data. Returns the approval tier.",
    inputSchema: { goal: RequestTypeZ, sector: SectorZ, retentionDuties: RetentionZ },
  },
  async ({ goal, sector, retentionDuties }) => {
    const type = adjustForRetention(goal, retentionDuties);
    return json({
      requestType: type,
      changed: type !== goal,
      reason: type !== goal ? `Must retain under ${retentionDuties.map((d) => RETENTION_LABELS[d]).join(", ")}` : null,
      tier: classifyTier(type, sector),
    });
  },
);

server.registerTool(
  "draft_request",
  {
    description: "Draft a DPDP request email in English or Hindi. Only drafts; sending requires user approval via the policy layer, then Gmail. Returns any placeholders still missing.",
    inputSchema: {
      requestType: RequestTypeZ,
      language: z.enum(["en", "hi"]).default("en"),
      companyName: z.string(),
      sector: SectorZ,
      retentionDuties: RetentionZ.default([]),
      recipient: z.string().nullable(),
      userName: z.string(),
      userEmail: z.string(),
      accountIdentifier: z.string().optional(),
      correctionDetails: z.string().optional(),
    },
  },
  async (i) => {
    const type: RequestType = adjustForRetention(i.requestType, i.retentionDuties);
    const basis = legalBasisOn(new Date());
    const tpl = loadTemplate(i.language, type);
    const vars = {
      company_name: i.companyName,
      user_name: i.userName,
      user_email: i.userEmail,
      account_identifier: i.accountIdentifier ?? i.userEmail,
      date: new Date().toISOString().slice(0, 10),
      section_ref: SECTION_REFS[type],
      legal_basis_note: LEGAL_BASIS_NOTE[i.language][basis],
      deadline_days: RESPONSE_DEADLINE_DAYS,
      correction_details: i.correctionDetails,
      retention_law: i.retentionDuties.map((d) => RETENTION_LABELS[d]).join(", ") || undefined,
    };
    const subject = render(tpl.subject, vars);
    const body = render(tpl.body, vars);
    return json({
      requestType: type,
      tier: classifyTier(type, i.sector),
      legalBasis: basis,
      recipient: i.recipient,
      subject,
      body,
      missing: missingPlaceholders(subject + body),
      needsRecipient: !i.recipient,
    });
  },
);

server.registerTool(
  "compute_deadline",
  {
    description: "Compute the 90-day response deadline and reminder dates for a sent request.",
    inputSchema: { sentAt: z.string().describe("ISO date-time the request was sent") },
  },
  async ({ sentAt }) => {
    const sent = new Date(sentAt).getTime();
    const at = (days: number) => new Date(sent + days * DAY).toISOString();
    return json({
      deadlineAt: at(RESPONSE_DEADLINE_DAYS),
      reminders: [at(30), at(60), at(RESPONSE_DEADLINE_DAYS - 7), at(RESPONSE_DEADLINE_DAYS)],
    });
  },
);

server.registerTool(
  "classify_reply",
  {
    description: "Classify a company's reply: confirmed, id_requested, rejected_retention, acknowledged or other. 'other' means the agent should read and classify it itself. The reply body is not stored.",
    inputSchema: { text: z.string() },
  },
  async ({ text }) => json(classifyReply(text)),
);

await server.connect(new StdioServerTransport());
