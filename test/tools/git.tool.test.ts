import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitStatus, gitDiff, gitLog } from "../../src/services/git.service.js";

const execFileAsync = promisify(execFile);

describe("git.tool integration", () => {
  let isGitRepo = false;

  beforeAll(async () => {
    try {
      await execFileAsync("git", ["rev-parse", "--git-dir"], {
        cwd: process.env.WORKSPACE_ROOT,
      });
      isGitRepo = true;
    } catch {
      isGitRepo = false;
    }
  });

  describe("gitStatus integration", () => {
    it("should return git status", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitStatus();
      expect(typeof result).toBe("string");
    });

    it("should filter blocked files", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitStatus();
      expect(result).not.toContain(".env");
    });
  });

  describe("gitDiff integration", () => {
    it("should return unstaged diff", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitDiff({ staged: false });
      expect(typeof result).toBe("string");
    });

    it("should return staged diff", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitDiff({ staged: true });
      expect(typeof result).toBe("string");
    });
  });

  describe("gitLog integration", () => {
    it("should return commit history", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitLog({ maxCount: 5 });
      expect(typeof result).toBe("string");
    });

    it("should respect maxCount", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitLog({ maxCount: 1 });
      const lines = result.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeLessThanOrEqual(1);
    });
  });
});