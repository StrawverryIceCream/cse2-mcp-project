import express, { Router } from "express";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "../server.js";
import { env } from "../config.js";

// Tool calls carry file contents inside JSON, so the body limit must exceed MAX_FILE_BYTES
// (Express defaults to 100kb, which would reject large write_file calls with a 413).
const bodyLimit = env.MAX_FILE_BYTES * 2 + 64 * 1024;

// Stateless: a fresh server + transport per request, no shared session state.
async function handleMcp(req: Request, res: Response): Promise<void> {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport as Parameters<typeof server.connect>[0]);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

// Stateless mode has no server-initiated stream or session to terminate.
function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

// Mounted at "/mcp" in app.ts, after auth, so unauthenticated bodies are never parsed.
export const mcpRoutes = Router();
mcpRoutes.post("/", express.json({ limit: bodyLimit }), handleMcp);
mcpRoutes.get("/", methodNotAllowed);
mcpRoutes.delete("/", methodNotAllowed);