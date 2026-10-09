import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listDirectory, readTextFile } from "../services/files.service.js";
import { run } from "./result.tool.js";

export function registerFileTools(server: McpServer): void {
  server.registerTool(
    "list_files",
    {
      title: "List files",
      description:
        "List the files and folders directly inside a workspace directory. Folders end with '/'. " +
        "Use '.' for the workspace root. Paths are relative to the workspace root.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("Directory to list. Defaults to the workspace root."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ path }) =>
      run(async () => {
        const { lines, total, truncated } = await listDirectory(path ?? ".");
        if (total === 0) return "(empty directory)";
        const note = truncated
          ? `\n[showing ${lines.length} of ${total} entries]`
          : "";
        return lines.join("\n") + note;
      }),
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description:
        "Read a UTF-8 text file from the workspace. The first line reports the file's version; " +
        "pass that version as if_version when you later write or edit the file so a concurrent " +
        "change is detected. Fails for directories, binary files, and files over the size limit.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("File to read, relative to the workspace root."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ path }) =>
      run(async () => {
        const { content, version, bytes } = await readTextFile(path);
        return `[version: ${version}, ${bytes} bytes]\n\n${content}`;
      }),
  );
}
