import express from "express";
import ngrok from "@ngrok/ngrok";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { seedHandoffFiles } from "./handoff.js";
import { createServer } from "./server.js";
import { requireAuth } from "./auth.js";
import { env } from "./config.js";

seedHandoffFiles();

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.status(200).send("OK");
});

// Stateless: a fresh server + transport per request, no shared session state.
app.post("/mcp", requireAuth, async (req, res) => {
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
});

// Stateless mode has no server-initiated stream or session to terminate.
const methodNotAllowed = (_req: express.Request, res: express.Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
};
app.get("/mcp", requireAuth, methodNotAllowed);
app.delete("/mcp", requireAuth, methodNotAllowed);

const httpServer = app.listen(env.PORT, async () => {
  console.log(`MCP server on port ${env.PORT}`);

  if (env.NGROK_AUTHTOKEN && env.NGROK_DOMAIN) {
    try {
      const listener = await ngrok.forward({
        addr: env.PORT,
        authtoken: env.NGROK_AUTHTOKEN,
        domain: env.NGROK_DOMAIN,
      });
      console.log(`Public URL: ${listener.url()}/mcp`);
    } catch (err) {
      console.error("ngrok failed to start:", err);
    }
  }
});

const shutdown = async () => {
  await ngrok.disconnect().catch(() => {});
  httpServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
