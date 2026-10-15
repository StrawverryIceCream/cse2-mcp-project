import { buildApp } from "./app.js";
import { requireAuth } from "./auth.js";
import { env } from "./config.js";
import { seedHandoffFiles } from "./handoff.js";
import { startTunnel, stopTunnel } from "./tunnel.js";

seedHandoffFiles();

const httpServer = buildApp(requireAuth).listen(env.PORT, () => {
  console.log(`MCP server on port ${env.PORT}`);
  void startTunnel();
});

const shutdown = async () => {
  await stopTunnel();
  httpServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
