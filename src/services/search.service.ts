import { isBlockedRelative, resolveSafe, toRelative } from "../sandbox.js";
import { runGit } from "./git.service.js";

const MAX_LINE_CHARS = 300;

export interface SearchOptions {
  pattern: string;
  path?: string;
  maxResults: number;
  ignoreCase: boolean;
  regex: boolean;
}

export interface SearchResult {
  lines: string[];
  truncated: boolean;
}

/**
 * Text search through `git grep`, which skips binary files and honours .gitignore, and needs
 * no extra program. The pattern is passed after -e and the path after --, so neither can be
 * read as an option.
 */
export async function searchCode(opts: SearchOptions): Promise<SearchResult> {
  const rel = opts.path ? toRelative(await resolveSafe(opts.path)) : "";
  const stdout = await runGit(
    [
      "grep",
      "-n",
      "-I",
      "--no-color",
      "--untracked",
      "--exclude-standard",
      ...(opts.ignoreCase ? ["-i"] : []),
      opts.regex ? "-E" : "-F",
      "-e",
      opts.pattern,
      "--",
      rel === "" ? "." : rel,
    ],
    { okExitCodes: [0, 1] }, // exit 1 means "no matches"
  );

  const matches = stdout
    .split("\n")
    .filter(Boolean)
    .filter((line) => !isBlockedRelative(line.slice(0, line.indexOf(":"))))
    .map((line) =>
      line.length > MAX_LINE_CHARS
        ? `${line.slice(0, MAX_LINE_CHARS)}...`
        : line,
    );

  return {
    lines: matches.slice(0, opts.maxResults),
    truncated: matches.length > opts.maxResults,
  };
}
