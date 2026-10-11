import { env } from "./config.js";
import { createRequireAuth } from "./credentials.js";

export const requireAuth = createRequireAuth({
  authToken: env.AUTH_TOKEN,
  connectorKey: env.CONNECTOR_KEY,
});
