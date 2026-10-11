import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as fsSync from "node:fs";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

const WORKSPACE = fsSync.mkdtempSync(path.join(os.tmpdir(), "mcp-git-test-"));
process.env.WORKSPACE_ROOT = WORKSPACE;

afterAll(async () => {
  await fs.rm(WORKSPACE, { recursive: true, force: true });
});

const { commitChanges, gitStatus, gitDiff, gitLog } =
  await import("../../src/services/git.service.js");
const { ROOT } = await import("../../src/sandbox.js");

function rawGit(...args: string[]) {
  return execFileSync("git", args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "ignore"],
  }).toString();
}

beforeEach(async () => {
  await fs.rm(path.join(ROOT, ".git"), { recursive: true, force: true });
  for (const e of await fs.readdir(ROOT)) {
    await fs.rm(path.join(ROOT, e), { recursive: true, force: true });
  }
  rawGit("init");
});

describe("commitChanges", () => {
  it("commits a specific path and leaves others untouched", async () => {
    await fs.writeFile(path.join(ROOT, "a.txt"), "a");
    await fs.writeFile(path.join(ROOT, "b.txt"), "b");
    const result = await commitChanges({ message: "add a", paths: ["a.txt"] });
    expect(result.filesChanged).toBe(1);
    expect(result.commitHash).toMatch(/^[0-9a-f]{7,}$/);
    const tracked = rawGit("ls-files");
    expect(tracked).toContain("a.txt");
    expect(tracked).not.toContain("b.txt");
  });

  it("commits everything when no paths given", async () => {
    await fs.writeFile(path.join(ROOT, "x.txt"), "x");
    await fs.writeFile(path.join(ROOT, "y.txt"), "y");
    const result = await commitChanges({ message: "add both" });
    expect(result.filesChanged).toBe(2);
  });

  it("rejects an empty message", async () => {
    await fs.writeFile(path.join(ROOT, "z.txt"), "z");
    await expect(commitChanges({ message: "   " })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("rejects when there's nothing to commit", async () => {
    await expect(
      commitChanges({ message: "nothing here" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects staging a blocked path", async () => {
    await fs.writeFile(path.join(ROOT, ".env"), "SECRET=1");
    await expect(
      commitChanges({ message: "sneak secret", paths: [".env"] }),
    ).rejects.toMatchObject({ code: "BLOCKED_PATH" });
  });

  it("rejects a path escape", async () => {
    await expect(
      commitChanges({ message: "escape", paths: ["../outside.txt"] }),
    ).rejects.toMatchObject({ code: "OUTSIDE_WORKSPACE" });
  });
});

describe("commitChanges + gitStatus/gitDiff/gitLog together", () => {
  it("status is clean after commit, diff is empty, log shows the commit", async () => {
    await fs.writeFile(path.join(ROOT, "f.txt"), "v1");
    const { commitHash } = await commitChanges({ message: "first" });

    const statusAfter = await gitStatus();
    expect(
      statusAfter
        .trim()
        .split("\n")
        .filter((l: string) => !l.startsWith("##")),
    ).toEqual([]);

    expect((await gitDiff({})).trim()).toBe("");

    const log = await gitLog({ maxCount: 5 });
    expect(log).toContain(commitHash);
    expect(log).toContain("first");
  });

  it("shows an uncommitted change in both status and diff, then clears after commit", async () => {
    await fs.writeFile(path.join(ROOT, "f.txt"), "v1");
    await commitChanges({ message: "first" });

    await fs.writeFile(path.join(ROOT, "f.txt"), "v2");
    expect(await gitStatus()).toContain("f.txt");

    const diffMid = await gitDiff({});
    expect(diffMid).toContain("-v1");
    expect(diffMid).toContain("+v2");

    await commitChanges({ message: "second" });
    const statusAfter = await gitStatus();
    expect(
      statusAfter
        .trim()
        .split("\n")
        .filter((l: string) => !l.startsWith("##")),
    ).toEqual([]);
  });

  it("gitStatus hides a blocked file's name even though it's untracked", async () => {
    await fs.writeFile(path.join(ROOT, ".env"), "SECRET=1");
    expect(await gitStatus()).not.toContain(".env");
  });
});
