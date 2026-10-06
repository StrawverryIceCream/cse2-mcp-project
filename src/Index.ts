import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./server.js";
import { requireAuth } from "./auth.js";
import { env } from "./config.js";

const app = express();
app.use(express.json());

app.get("/healthz", (req, res) => res.status(200).send("OK"));

// Standard MCP HTTP Transport requires an SSE endpoint and a message POST endpoint
let transport: SSEServerTransport | null = null;

app.get("/sse", requireAuth, async (req, res) => {
  const server = createServer();
  transport = new SSEServerTransport("/mcp", res);
  await server.connect(transport);
});

app.post("/mcp", requireAuth, async (req, res) => {
  if (!transport) {
    return res
      .status(400)
      .send("SSE session not established. Connect to /sse first.");
  }
  await transport.handlePostMessage(req, res);
});

app.listen(env.PORT, () => {
  console.log(`MCP Server running on port ${env.PORT}`);
});
