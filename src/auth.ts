import { env } from "./config.js";
import { createRequireAuth } from "./credentials.js";
 
export const requireAuth = createRequireAuth(env.MCP_KEY);
 