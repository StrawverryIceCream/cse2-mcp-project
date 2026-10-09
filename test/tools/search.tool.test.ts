import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { searchCode } from "../../src/services/search.service.js";

const execFileAsync = promisify(execFile);

describe("search.tool integration", () => {
  const testDir = path.join(process.env.WORKSPACE_ROOT!, "test-search-tool");
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

  beforeEach(async () => {
    await fsp.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
  });

  describe("searchCode integration", () => {
    it("should find literal patterns", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      await fsp.writeFile(
        path.join(testDir, "file1.txt"),
        "Hello World\nFoo Bar",
      );

      const result = await searchCode({
        pattern: "Hello",
        maxResults: 10,
        ignoreCase: false,
        regex: false,
      });

      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.lines.some((l) => l.includes("Hello"))).toBe(true);
    });

    it("should support regex patterns", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      await fsp.writeFile(
        path.join(testDir, "regex.txt"),
        "test123\ntest456",
      );

      const result = await searchCode({
        pattern: "test[0-9]+",
        maxResults: 10,
        ignoreCase: false,
        regex: true,
      });

      expect(result.lines.length).toBeGreaterThan(0);
    });

    it("should respect maxResults", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      const content = Array(20)
        .fill(0)
        .map((_, i) => `line ${i} with pattern`)
        .join("\n");
      await fsp.writeFile(path.join(testDir, "many.txt"), content);

      const result = await searchCode({
        pattern: "pattern",
        maxResults: 5,
        ignoreCase: false,
        regex: false,
      });

      expect(result.lines.length).toBeLessThanOrEqual(5);
    });

    it("should filter blocked files", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      await fsp.writeFile(path.join(testDir, "normal.txt"), "searchme");
      await fsp.writeFile(path.join(testDir, ".env"), "searchme");

      const result = await searchCode({
        pattern: "searchme",
        maxResults: 10,
        ignoreCase: false,
        regex: false,
      });

      expect(result.lines.some((l) => l.includes("normal.txt"))).toBe(true);
      expect(result.lines.some((l) => l.includes(".env"))).toBe(false);
    });

    it("should handle no matches", async () => {
      if (!isGitRepo) {
        console.log("Skipping test - not a git repository");
        return;
      }

      await fsp.writeFile(path.join(testDir, "nomatch.txt"), "content here");

      const result = await searchCode({
        pattern: "NONEXISTENT_PATTERN_XYZ123",
        maxResults: 10,
        ignoreCase: false,
        regex: false,
      });

      expect(result.lines).toEqual([]);
      expect(result.truncated).toBe(false);
    });
  });
});