// Minimal MCP client for the browser: JSON-RPC tools/call over the stateless Streamable HTTP
// endpoint of servers/dataexit (--http). The dev server proxies MCP_URL to /mcp/<MCP_HTTP_SECRET>,
// so the secret stays on the Node side and never ships in the bundle (see vite.config.ts).

export const MCP_URL = ((import.meta.env.VITE_MCP_URL as string | undefined) ?? "/api/mcp").replace(/\/$/, "");

/** An expected refusal from a tool (UserFacingError / PolicyError on the server). */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string | null = null,
  ) {
    super(message);
  }
}

/** The MCP server could not be reached or answered with a protocol error. */
export class McpUnavailable extends Error {}

let nextId = 1;

function parseBody(contentType: string, text: string): unknown {
  if (!contentType.includes("text/event-stream")) return JSON.parse(text);
  // One SSE event per JSON-RPC response; take the last data payload.
  const data = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  if (!data.length) throw new McpUnavailable("Empty response from the MCP server.");
  return JSON.parse(data[data.length - 1]);
}

export async function callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(MCP_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }),
    });
  } catch (e) {
    throw new McpUnavailable(`Cannot reach the MCP server at ${MCP_URL}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new McpUnavailable(`MCP server at ${MCP_URL} answered HTTP ${res.status}.`);
  const msg = parseBody(res.headers.get("content-type") ?? "", await res.text()) as {
    result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    error?: { message: string };
  };
  if (msg.error) throw new McpUnavailable(`${name}: ${msg.error.message}`);
  const text = msg.result?.content?.find((c) => c.type === "text")?.text ?? "null";
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (msg.result?.isError) throw new ToolError("TOOL_ERROR", text);
    payload = text;
  }
  if (msg.result?.isError) {
    const e = payload as { error?: string; message?: string; hint?: string | null };
    throw new ToolError(e.error ?? "TOOL_ERROR", e.message ?? `${name} failed`, e.hint ?? null);
  }
  return payload as T;
}
