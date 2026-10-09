import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  deleteFile,
  listDirectory,
  readTextFile,
  strReplace,
  writeTextFile,
} from "../services/files.service.js";
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

  server.registerTool(
    "write_file",
    {
      title: "Write file",
      description:
        "Create or overwrite a UTF-8 text file in the workspace. Pass if_version (from a prior " +
        "read_file, write_file, or str_replace call) to reject the write if the file changed since.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("File to write, relative to the workspace root."),
        content: z.string().describe("Full file content to write."),
        if_version: z
          .string()
          .optional()
          .describe(
            "Version from a prior read — rejects the write if the file changed since.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    ({ path, content, if_version }) =>
      run(async () => {
        const { version, bytes } = await writeTextFile(
          path,
          content,
          if_version,
        );
        return `Wrote "${path}" (${bytes} bytes). [version: ${version}]`;
      }),
  );

  server.registerTool(
    "str_replace",
    {
      title: "Replace text in file",
      description:
        "Replace text in a workspace file that must match exactly once. Fails if old_str is " +
        "missing or appears more than once. Pass if_version to guard against a stale edit.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("File to edit, relative to the workspace root."),
        old_str: z
          .string()
          .min(1)
          .describe(
            "Exact text to replace; must occur exactly once in the file.",
          ),
        new_str: z.string().describe("Replacement text."),
        if_version: z
          .string()
          .optional()
          .describe(
            "Version from a prior read — rejects the edit if the file changed since.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    ({ path, old_str, new_str, if_version }) =>
      run(async () => {
        const { version, bytes } = await strReplace(
          path,
          old_str,
          new_str,
          if_version,
        );
        return `Updated "${path}" (${bytes} bytes). [version: ${version}]`;
      }),
  );

  server.registerTool(
    "delete_file",
    {
      title: "Delete file",
      description:
        "Delete a single file in the workspace. Directories (and symlinks to directories) are refused.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("File to delete, relative to the workspace root."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    ({ path }) =>
      run(async () => {
        await deleteFile(path);
        return `Deleted "${path}".`;
      }),
  );
}
