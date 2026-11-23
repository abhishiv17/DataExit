import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PolicyError } from "@dataexit/policy";
import type { z, ZodRawShape } from "zod";
import { createContext, type Ctx } from "./context.js";

/** An error the agent should explain to the user (bad input, missing data), not a crash. */
export class UserFacingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function jsonResult(data: unknown, isError = false): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], ...(isError ? { isError } : {}) };
}

/**
 * Registers a tool with uniform error handling and logging. Expected failures (PolicyError,
 * UserFacingError) come back as isError results with a code and hint the agent can act on.
 */
export function defineTool<S extends ZodRawShape>(
  server: McpServer,
  ctx: Ctx,
  name: string,
  config: { description: string; inputSchema: S; annotations?: ToolAnnotations },
  handler: (args: z.objectOutputType<S, z.ZodTypeAny>, ctx: Ctx) => Promise<unknown>,
): void {
  const run = async (args: z.objectOutputType<S, z.ZodTypeAny>): Promise<ToolResult> => {
    const started = Date.now();
    try {
      const out = await handler(args, ctx);
      ctx.log.info("tool ok", { tool: name, ms: Date.now() - started });
      return jsonResult(out);
    } catch (e) {
      if (e instanceof PolicyError || e instanceof UserFacingError) {
        ctx.log.info("tool refused", { tool: name, code: e.code });
        return jsonResult({ error: e.code, message: e.message, hint: e.hint ?? null }, true);
      }
      ctx.log.error("tool failed", { tool: name, err: e instanceof Error ? e.message : String(e) });
      return jsonResult({ error: "INTERNAL", message: e instanceof Error ? e.message : String(e) }, true);
    }
  };
  // The SDK's generic overloads are hard to satisfy through a wrapper; the shape is validated by the SDK.
  (server.registerTool as (n: string, c: unknown, cb: (a: never) => Promise<ToolResult>) => unknown).call(
    server,
    name,
    { description: config.description, inputSchema: config.inputSchema, annotations: config.annotations },
    run as (a: never) => Promise<ToolResult>,
  );
}

export type Register = (server: McpServer, ctx: Ctx) => void;

export function buildServer(name: string, version: string, ctx: Ctx, registers: Register[]): McpServer {
  const server = new McpServer(
    { name, version },
    {
      instructions:
        "Data Exit helps an Indian user find companies holding their data and exercise DPDP rights. " +
        "Never approve on the user's behalf: call approve_request only after the user explicitly approves. " +
        "For full_review requests, show the complete draft first. Cite the source email for every suggestion. " +
        "Never ask for OTP, PIN, Aadhaar or ID documents.",
    },
  );
  for (const r of registers) r(server, ctx);
  return server;
}

/** Starts a server over stdio. Used by every standalone server entry point. */
export async function runStdio(name: string, version: string, registers: Register[]): Promise<void> {
  const ctx = await createContext(name);
  const server = buildServer(name, version, ctx, registers);
  await server.connect(new StdioServerTransport());
  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await ctx.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
