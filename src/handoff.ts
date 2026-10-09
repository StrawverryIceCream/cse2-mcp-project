import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./sandbox.js";

const TEMPLATES: Record<string, string> = {
  "PROJECT_STATE.md": `# Project State

> Read this file first in every session.
> Rewrite it at the end of a session so it always describes the present, not the history.

## Goal
(not set yet)

## Current status
(nothing done yet)

## What exists
(nothing yet)

## Open questions and blockers
(none)

## Session protocol
1. Read PROJECT_STATE.md, then the latest entries of PLAN_LOG.md, CHECKPOINTS.md and DECISIONS.md.
2. Do the work.
3. Append what you did to PLAN_LOG.md.
4. When something is stable, commit it and add an entry to CHECKPOINTS.md.
5. Record non-obvious choices, and why you made them, in DECISIONS.md.
6. Rewrite PROJECT_STATE.md for the next session.
`,
  "PLAN_LOG.md": `# Plan Log

Append-only. One entry per work session, newest last. Never edit old entries.

Entry format:

## <date> - session <n>
- Planned: ...
- Done: ...
- Next: ...
`,
  "CHECKPOINTS.md": `# Checkpoints

Stable points the next session can trust or return to. Append only.

Entry format:

## CP-<n> - <date>
- Commit: <short hash>
- State: what works at this point
- How to verify: how to check it
`,
  "DECISIONS.md": `# Decisions

Why choices were made, so later sessions do not undo them. Append only.

Entry format:

## D-<n> - <title>
- Context: ...
- Decision: ...
- Why: ...
- Consequences: ...
`,
};

export const HANDOFF_FILE_NAMES = Object.keys(TEMPLATES);

/** Give the workspace its own git repo so the git tools work. Never fails the server start. */
function ensureGitRepo(): void {
  if (fs.existsSync(path.join(ROOT, ".git"))) return;
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=mcp-file-server",
        "-c",
        "user.email=mcp-file-server@localhost",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: ROOT, stdio: "ignore", timeout: 15_000 },
    );
  try {
    git("init");
    git("add", "--", ...HANDOFF_FILE_NAMES);
    git("commit", "-m", "Seed handoff files");
  } catch (err) {
    console.error(
      "Could not initialise a git repo in the workspace; git tools will fail:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Create the four handoff files if missing, without overwriting existing ones. */
export function seedHandoffFiles(): void {
  for (const [name, content] of Object.entries(TEMPLATES)) {
    const filePath = path.join(ROOT, name);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, "utf-8");
  }
  ensureGitRepo();
}
