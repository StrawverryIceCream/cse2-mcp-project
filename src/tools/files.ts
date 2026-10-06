import { z } from 'zod';
import { resolveSafe } from '../sandbox.js';
import { listDirectoryFiles } from '../services/files.js'; // Your underlying logic

export const listFilesTool = {
  schema: {
    name: 'list_files',
    description: 'Lists files in a directory safely.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Relative directory path' }
      },
      required: ['dirPath']
    }
  },
  execute: async (args: any) => {
    const parsed = z.object({ dirPath: z.string() }).parse(args);
    const safePath = resolveSafe(parsed.dirPath);
    
    try {
      const files = await listDirectoryFiles(safePath);
      return { content: [{ type: 'text', text: files.join('\n') }] };
    } catch (error: any) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
};