import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFileTools } from "./tools/files.tool.js";
import { registerGitTools } from "./tools/git.tool.js";
import { registerSearchTools } from "./tools/search.tool.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "mcp-file-server", version: "1.0.0" });
  registerFileTools(server);
  registerSearchTools(server);
  registerGitTools(server);
  return server;
}
