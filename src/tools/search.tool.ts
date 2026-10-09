import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchCode } from "../services/search.service.js";
import { run } from "./result.tool.js";

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "search_code",
    {
      title: "Search code",
      description:
        "Search text files in the workspace for a string and return matching lines as " +
        "'file:line:text'. Case-sensitive literal match by default; set regex for an extended " +
        "regular expression. Binary files and git-ignored files are skipped.",
      inputSchema: {
        pattern: z
          .string()
          .min(1)
          .max(500)
          .describe("Text or regular expression to find."),
        path: z
          .string()
          .optional()
          .describe("Limit the search to this file or directory."),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Default 50."),
        ignore_case: z.boolean().optional().describe("Default false."),
        regex: z
          .boolean()
          .optional()
          .describe("Treat pattern as a regular expression. Default false."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ pattern, path, max_results, ignore_case, regex }) =>
      run(async () => {
        const { lines, truncated } = await searchCode({
          pattern,
          ...(path === undefined ? {} : { path }),
          maxResults: max_results ?? 50,
          ignoreCase: ignore_case ?? false,
          regex: regex ?? false,
        });
        if (lines.length === 0) return "No matches found.";
        const note = truncated
          ? `\n[more matches exist; narrow the search or raise max_results]`
          : "";
        return lines.join("\n") + note;
      }),
  );
}
