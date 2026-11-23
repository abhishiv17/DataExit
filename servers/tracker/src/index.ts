#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { RESPONSE_DEADLINE_DAYS, type RequestStatus } from "@dataexit/shared";
import { AuditLog } from "@dataexit/policy";

// TODO: replace in-memory store with Postgres (db/schema.sql).
interface TrackedRequest {
  id: string;
  companyId: string;
  companyName: string;
  type: string;
  status: RequestStatus;
  sentAt: string;
  deadlineAt: string;
  gmailMessageId: string | null;
  calendarEventId: string | null;
  sourceRef: string | null;
  evidence: string[]; // message IDs of replies
}

const USER_ID = "demo-user";
const requests = new Map<string, TrackedRequest>();
const audit = new AuditLog();

const server = new McpServer({ name: "dataexit-tracker", version: "0.1.0" });
const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const StatusZ = z.enum([
  "sent", "acknowledged", "id_requested", "confirmed", "rejected", "overdue",
  "escalated_go", "escalated_dpb", "closed", "cancelled",
]);

function isOverdue(r: TrackedRequest, now = new Date()): boolean {
  return !["confirmed", "closed", "cancelled"].includes(r.status) && new Date(r.deadlineAt) < now;
}

server.registerTool(
  "record_request",
  {
    description: "Record a request that the user approved and that was sent via Gmail. Requires the approval reference from the policy layer.",
    inputSchema: {
      companyId: z.string(),
      companyName: z.string(),
      requestType: z.string(),
      approvalRef: z.string().describe("Audit hash of the user's approval event"),
      gmailMessageId: z.string().nullable(),
      calendarEventId: z.string().nullable().default(null),
      sourceRef: z.string().nullable().describe("Message ID the suggestion came from"),
    },
  },
  async (i) => {
    const sentAt = new Date();
    const r: TrackedRequest = {
      id: randomUUID(),
      companyId: i.companyId,
      companyName: i.companyName,
      type: i.requestType,
      status: "sent",
      sentAt: sentAt.toISOString(),
      deadlineAt: new Date(sentAt.getTime() + RESPONSE_DEADLINE_DAYS * 864e5).toISOString(),
      gmailMessageId: i.gmailMessageId,
      calendarEventId: i.calendarEventId,
      sourceRef: i.sourceRef,
      evidence: [],
    };
    requests.set(r.id, r);
    audit.append({ userId: USER_ID, actor: "agent", action: "send", target: r.id, sourceRef: i.sourceRef, details: { approvalRef: i.approvalRef, type: r.type, companyId: r.companyId } });
    return json(r);
  },
);

server.registerTool(
  "list_requests",
  {
    description: "List tracked requests, optionally filtered by status or overdue.",
    inputSchema: { status: StatusZ.optional(), overdueOnly: z.boolean().default(false) },
  },
  async ({ status, overdueOnly }) =>
    json([...requests.values()].filter((r) => (!status || r.status === status) && (!overdueOnly || isOverdue(r)))),
);

server.registerTool(
  "update_status",
  {
    description: "Update a request's status after a reply is classified. Attach the reply's message ID as evidence (never the body).",
    inputSchema: { requestId: z.string(), status: StatusZ, evidenceMessageId: z.string().optional() },
  },
  async ({ requestId, status, evidenceMessageId }) => {
    const r = requests.get(requestId);
    if (!r) return json({ error: "unknown request" });
    const from = r.status;
    r.status = status;
    if (evidenceMessageId) r.evidence.push(evidenceMessageId);
    audit.append({ userId: USER_ID, actor: "agent", action: "status_change", target: r.id, sourceRef: evidenceMessageId ?? null, details: { from, to: status } });
    return json(r);
  },
);

server.registerTool(
  "export_evidence",
  {
    description: "Export the evidence bundle for a request: timeline, message IDs and the audit chain with an integrity check.",
    inputSchema: { requestId: z.string() },
  },
  async ({ requestId }) => {
    const r = requests.get(requestId);
    if (!r) return json({ error: "unknown request" });
    const events = audit.all();
    return json({
      request: r,
      auditEvents: events.filter((e) => e.target === requestId),
      auditChainIntact: AuditLog.verify(events) === null,
    });
  },
);

server.registerTool(
  "draft_escalation",
  {
    description: "Prepare an escalation for an overdue or refused request. Returns the template to use with request-engine; the user reviews and sends/files it. Never escalate a refusal that cites RBI KYC/PMLA retention.",
    inputSchema: { requestId: z.string(), level: z.enum(["grievance_officer", "dpb"]) },
  },
  async ({ requestId, level }) => {
    const r = requests.get(requestId);
    if (!r) return json({ error: "unknown request" });
    // TODO: render escalation_<level> template (shared renderer with request-engine).
    return json({
      template: `escalation_${level}`,
      vars: { company_name: r.companyName, original_date: r.sentAt.slice(0, 10), reference: r.gmailMessageId ?? r.id },
      evidence: r.evidence,
      note: level === "dpb" ? "User must review and file the complaint personally." : null,
    });
  },
);

server.registerTool(
  "weekly_digest",
  {
    description: "Summarise request outcomes for the weekly chat/WhatsApp digest.",
    inputSchema: {},
  },
  async () => {
    const all = [...requests.values()];
    const count = (s: RequestStatus) => all.filter((r) => r.status === s).length;
    const overdue = all.filter((r) => isOverdue(r));
    return json({
      confirmed: count("confirmed"),
      idRequested: count("id_requested"),
      ignored: overdue.length,
      open: all.filter((r) => ["sent", "acknowledged"].includes(r.status)).length,
      text: `${count("confirmed")} confirmed deletion, ${count("id_requested")} asked for ID, ${overdue.length} ignored you.${overdue.length ? " Escalate?" : ""}`,
      escalateCandidates: overdue.map((r) => ({ id: r.id, company: r.companyName })),
    });
  },
);

await server.connect(new StdioServerTransport());
