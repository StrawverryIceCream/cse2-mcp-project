import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gitDiff, gitLog, gitStatus } from "../services/git.service.js";
import { run, truncate } from "./result.tool.js";

const MAX_DIFF_CHARS = 30_000;

export function registerGitTools(server: McpServer): void {
  server.registerTool(
    "git_status",
    {
      title: "Git status",
      description:
        "Show the workspace repository's branch and changed files in short format " +
        "(XY path; '??' means untracked).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => run(() => gitStatus()),
  );

  server.registerTool(
    "git_diff",
    {
      title: "Git diff",
      description:
        "Show uncommitted changes to tracked files. Untracked files do not appear; " +
        "use git_status to see them. Output is truncated if very long.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("Limit the diff to this file or directory."),
        staged: z
          .boolean()
          .optional()
          .describe("Show staged changes instead. Default false."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ path, staged }) =>
      run(async () => {
        const diff = await gitDiff({
          ...(path !== undefined ? { path } : {}),
          ...(staged !== undefined ? { staged } : {}),
        });
        return diff === "" ? "No changes." : truncate(diff, MAX_DIFF_CHARS);
      }),
  );

  server.registerTool(
    "git_log",
    {
      title: "Git log",
      description:
        "Show recent commits, newest first, as 'hash date author: message'.",
      inputSchema: {
        max_count: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Default 10."),
        path: z
          .string()
          .optional()
          .describe("Only commits touching this file or directory."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ max_count, path }) =>
      run(async () => {
        const log = await gitLog({
          maxCount: max_count ?? 10,
          ...(path !== undefined ? { path } : {}),
        });
        return log === "" ? "No commits." : log;
      }),
  );
}
