import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const run = promisify(execFile);

let dir: string;
let git: (...args: string[]) => Promise<unknown>;
let svc: typeof import("../../src/services/git.service.js");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mcp-git-test-"));
  git = (...args) =>
    run(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: dir },
    );

  // Fixture repo: two commits, one unstaged change, one staged change, one untracked secret.
  await git("init", "-q");
  writeFileSync(join(dir, "note.md"), "one\n");
  await git("add", "note.md");
  await git("commit", "-q", "-m", "first commit");

  writeFileSync(join(dir, "note.md"), "one\ntwo\n");
  await git("add", "note.md");
  await git("commit", "-q", "-m", "second commit");

  writeFileSync(join(dir, "note.md"), "one\ntwo\nunstaged-line\n"); // unstaged
  writeFileSync(join(dir, "staged.md"), "staged-line\n");
  await git("add", "staged.md"); // staged
  writeFileSync(join(dir, ".env"), "SECRET=hunter2\n"); // untracked secret

  // config.ts and sandbox.ts read the environment at import time, so set it first
  // and import the service afterwards.
  vi.stubEnv("WORKSPACE_ROOT", dir);
  vi.stubEnv("PORT", "3000");
  vi.stubEnv("MAX_FILE_BYTES", "1048576");
  vi.stubEnv("MCP_KEY", "k".repeat(40));
  vi.resetModules();
  svc = await import("../../src/services/git.service.js");
});

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe("gitStatus", () => {
  it("lists changed files", async () => {
    const result = await svc.gitStatus();
    expect(result).toContain("note.md");
    expect(result).toContain("staged.md");
  });

  it("hides blocked files", async () => {
    const result = await svc.gitStatus();
    expect(result).not.toMatch(/(^|[\s/])\.env(\s|$)/m);
  });
});

describe("gitDiff", () => {
  it("returns the unstaged diff", async () => {
    const result = await svc.gitDiff({ staged: false });
    expect(result).toContain("unstaged-line");
    expect(result).not.toContain("staged-line\n+"); // staged.md is not in this diff
  });

  it("returns the staged diff", async () => {
    const result = await svc.gitDiff({ staged: true });
    expect(result).toContain("staged.md");
  });

  it("never leaks blocked file contents, even if staged", async () => {
    await git("add", "-f", ".env");
    try {
      const result = await svc.gitDiff({ staged: true });
      expect(result).not.toContain("hunter2");
    } finally {
      await git("reset", "-q", ".env");
    }
  });
});

describe("gitLog", () => {
  it("returns commit history", async () => {
    const result = await svc.gitLog({ maxCount: 5 });
    expect(result).toContain("first commit");
    expect(result).toContain("second commit");
  });

  it("respects maxCount", async () => {
    const result = await svc.gitLog({ maxCount: 1 });
    expect(result).toContain("second commit");
    expect(result).not.toContain("first commit");
  });
});
