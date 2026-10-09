import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitStatus, gitDiff, gitLog, runGit } from "../../src/services/git.service.js";
import { ToolError } from "../../src/errors.js";

const execFileAsync = promisify(execFile);

describe("git.service", () => {
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

  describe("runGit", () => {
    it("should execute git command and return stdout", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await runGit(["--version"]);
      expect(result).toContain("git version");
    });

    it("should handle non-zero exit codes with okExitCodes", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      // git grep with no matches exits with code 1
      const result = await runGit(
        ["grep", "-n", "NONEXISTENT_PATTERN_XYZ123"],
        { okExitCodes: [0, 1] },
      );
      expect(result).toBe("");
    });

    it("should throw ToolError for git command failures", async () => {
      await expect(
        runGit(["invalid-command-xyz"]),
      ).rejects.toThrow(ToolError);
    });
  });

  describe("gitStatus", () => {
    it("should return git status output", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitStatus();
      expect(typeof result).toBe("string");
      // Should start with branch info
      if (result.trim()) {
        expect(result).toMatch(/^##/);
      }
    });

    it("should filter out blocked files", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitStatus();
      // .env files should not appear in status
      expect(result).not.toContain(".env");
    });
  });

  describe("gitDiff", () => {
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

    it("should handle path parameter", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitDiff({ path: ".", staged: false });
      expect(typeof result).toBe("string");
    });
  });

  describe("gitLog", () => {
    it("should return commit history", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitLog({ maxCount: 5 });
      expect(typeof result).toBe("string");
    });

    it("should respect maxCount parameter", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitLog({ maxCount: 1 });
      const lines = result.trim().split("\n").filter(Boolean);
      expect(lines.length).toBeLessThanOrEqual(1);
    });

    it("should handle path parameter", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const result = await gitLog({ maxCount: 10, path: "." });
      expect(typeof result).toBe("string");
    });
  });
});
