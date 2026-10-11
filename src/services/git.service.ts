import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ToolError } from "../errors.js";
import {
  ROOT,
  isBlockedRelative,
  resolveSafe,
  toRelative,
} from "../sandbox.js";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 1024 * 1024;

type ExecError = Error & {
  code?: number | string;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
};

interface GitOptions {
  /** Exit codes that are not failures (git grep exits 1 when nothing matches). */
  okExitCodes?: number[];
}

/**
 * The only place git is spawned. Arguments go in as an array (no shell), with a timeout, a
 * bounded buffer, no prompts, and literal pathspecs so a path can never act as pathspec magic.
 */
export async function runGit(
  args: string[],
  opts: GitOptions = {},
): Promise<string> {
  const okExitCodes = opts.okExitCodes ?? [0];
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-c", "core.quotepath=false", ...args],
      {
        cwd: ROOT,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_LITERAL_PATHSPECS: "1",
        },
      },
    );
    return stdout;
  } catch (err) {
    const e = err as ExecError;
    if (typeof e.code === "number" && okExitCodes.includes(e.code))
      return e.stdout ?? "";
    if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return e.stdout ?? "";
    if (e.code === "ENOENT") {
      throw new ToolError("GIT_FAILED", "git is not installed or not on PATH.");
    }
    if (e.killed)
      throw new ToolError("GIT_FAILED", `git ${args[0]} timed out.`);
    const detail = (e.stderr ?? "").trim().split("\n").slice(0, 4).join(" ");
    throw new ToolError(
      "GIT_FAILED",
      `git ${args[0]} failed: ${detail || "unknown error"}`,
    );
  }
}

async function pathspec(path: string | undefined): Promise<string[]> {
  if (!path) return [];
  const rel = toRelative(await resolveSafe(path));
  return rel === "" ? [] : ["--", rel];
}

export async function gitStatus(): Promise<string> {
  const stdout = await runGit([
    "status",
    "--porcelain=v1",
    "--branch",
    "--untracked-files=all",
  ]);
  // Hide blocked files (.env, keys) so their names are not revealed either.
  return stdout
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("##") ||
        !line.slice(3).split(" -> ").some(isBlockedRelative),
    )
    .join("\n");
}

export async function gitDiff(opts: {
  path?: string;
  staged?: boolean;
}): Promise<string> {
  return runGit([
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    ...(opts.staged ? ["--staged"] : []),
    ...(await pathspec(opts.path)),
  ]);
}

export async function gitLog(opts: {
  maxCount: number;
  path?: string;
}): Promise<string> {
  return runGit([
    "log",
    `--max-count=${opts.maxCount}`,
    "--date=short",
    "--pretty=format:%h %ad %an: %s",
    ...(await pathspec(opts.path)),
  ]);
}

/**
 * Same identity config handoff.ts's ensureGitRepo() uses when it seeds the
 * repo — export it here so commitChanges() doesn't duplicate it, and have
 * handoff.ts import this instead of its own inline copy (see below).
 */
export const GIT_IDENTITY_ARGS = [
  "-c", "user.name=mcp-file-server",
  "-c", "user.email=mcp-file-server@localhost",
  "-c", "commit.gpgsign=false",
];

export interface CommitInput {
  message: string;
  /** Specific files/dirs to stage and commit. Omit to stage all current changes. */
  paths?: string[];
}

export interface CommitResult {
  commitHash: string;
  filesChanged: number;
}

export async function commitChanges(input: CommitInput): Promise<CommitResult> {
  if (!input.message.trim()) {
    throw new ToolError("INVALID_INPUT", "Commit message cannot be empty.");
  }

  if (input.paths?.length) {
    // Reuse resolveSafe/toRelative so a commit can't be used to sneak a
    // write/stage operation outside the workspace or onto a blocked path —
    // same sandbox guarantee every other tool here gets.
    const relPaths = await Promise.all(
      input.paths.map(async (p) => toRelative(await resolveSafe(p))),
    );
    await runGit(["add", "--", ...relPaths]);
  } else {
    await runGit(["add", "-A"]);
  }

  const staged = await runGit(["diff", "--cached", "--name-only"]);
  const changedFiles = staged.split("\n").filter(Boolean);
  if (changedFiles.length === 0) {
    throw new ToolError("INVALID_INPUT", "Nothing to commit — no staged changes.");
  }

  await runGit([...GIT_IDENTITY_ARGS, "commit", "-m", input.message]);
  const hash = (await runGit(["rev-parse", "--short", "HEAD"])).trim();

  return { commitHash: hash, filesChanged: changedFiles.length };
}
