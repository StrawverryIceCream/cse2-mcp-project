import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { listFilesTool } from './tools/files.js'; // Example tool import

export function createServer(): Server {
  const server = new Server(
    { name: 'mcp-file-server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register tool schemas
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [listFilesTool.schema]
  }));

  // Route tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
      case 'list_files':
        return listFilesTool.execute(request.params.arguments);
      // Add other tools here (read_file, write_file, search_code, etc.)
      default:
        throw new Error(`Tool not found: ${request.params.name}`);
    }
  });

  return server;
}