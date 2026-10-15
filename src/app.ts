import express from "express";
import type { RequestHandler } from "express";
import { healthRoutes } from "./routes/health.routes.js";
import { mcpRoutes } from "./routes/mcp.routes.js";

/** Builds the Express app without listening or tunnelling, so tests can drive it directly. */
export function buildApp(requireAuth: RequestHandler) {
  const app = express();
  app.use(healthRoutes);
  app.use("/mcp", requireAuth, mcpRoutes);
  return app;
}
