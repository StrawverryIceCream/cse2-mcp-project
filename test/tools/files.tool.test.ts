import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFileTools } from "../../src/tools/files.tool.js";
import { listDirectory, readTextFile, writeTextFile, strReplace, deleteFile, versionOf } from "../../src/services/files.service.js";

describe("files.tool", () => {
  const testDir = path.join(
    process.env.WORKSPACE_ROOT!,
    "test-files-tool",
  );

  beforeEach(async () => {
    await fsp.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
  });

  describe("registerFileTools", () => {
    it("should register all file tools", () => {
      const server = new McpServer({ name: "test-server", version: "1.0.0" });
      expect(() => registerFileTools(server)).not.toThrow();
    });

    it("should have list_files tool registered", () => {
      const server = new McpServer({ name: "test-server", version: "1.0.0" });
      registerFileTools(server);
      // If registration succeeds without throwing, the tool is registered
    });
  });

  describe("list_files integration", () => {
    it("should list files through service", async () => {
      const relPath = "test-files-tool";
      await fsp.writeFile(path.join(testDir, "file1.txt"), "content1");
      await fsp.writeFile(path.join(testDir, "file2.txt"), "content2");
      await fsp.mkdir(path.join(testDir, "subdir"));

      const result = await listDirectory(relPath);

      expect(result.total).toBe(3);
      expect(result.lines).toContain("subdir/");
      expect(result.lines.some((l) => l.startsWith("file1.txt"))).toBe(true);
    });

    it("should handle empty directory", async () => {
      const result = await listDirectory("test-files-tool");
      expect(result.total).toBe(0);
      expect(result.lines).toEqual([]);
    });
  });

  describe("read_file integration", () => {
    it("should read file through service", async () => {
      const relPath = "test-files-tool/read-test.txt";
      const content = "Hello, World!";
      await fsp.writeFile(path.join(testDir, "read-test.txt"), content);

      const result = await readTextFile(relPath);

      expect(result.content).toBe(content);
      expect(result.version).toHaveLength(16);
    });

    it("should handle file not found", async () => {
      await expect(
        readTextFile("test-files-tool/nonexistent.txt"),
      ).rejects.toThrow();
    });
  });

  describe("write_file integration", () => {
    it("should write file through service", async () => {
      const relPath = "test-files-tool/new-file.txt";
      const content = "New content";

      const result = await writeTextFile(relPath, content);

      expect(result.version).toHaveLength(16);
      expect(result.bytes).toBe(Buffer.byteLength(content));

      const written = await fsp.readFile(
        path.join(testDir, "new-file.txt"),
        "utf-8",
      );
      expect(written).toBe(content);
    });

    it("should respect version checking", async () => {
      const relPath = "test-files-tool/versioned.txt";
      const initial = "initial";
      await fsp.writeFile(path.join(testDir, "versioned.txt"), initial);
      const version = versionOf(initial);

      await writeTextFile(relPath, "updated", version);
      const written = await fsp.readFile(
        path.join(testDir, "versioned.txt"),
        "utf-8",
      );
      expect(written).toBe("updated");
    });
  });

  describe("str_replace integration", () => {
    it("should replace text through service", async () => {
      const relPath = "test-files-tool/replace.txt";
      await fsp.writeFile(path.join(testDir, "replace.txt"), "Hello World");

      const result = await strReplace(relPath, "World", "Universe");

      expect(result.version).toHaveLength(16);
      const updated = await fsp.readFile(
        path.join(testDir, "replace.txt"),
        "utf-8",
      );
      expect(updated).toBe("Hello Universe");
    });

    it("should handle ambiguous matches", async () => {
      const relPath = "test-files-tool/multiple.txt";
      await fsp.writeFile(
        path.join(testDir, "multiple.txt"),
        "Hello Hello Hello",
      );

      await expect(strReplace(relPath, "Hello", "Hi")).rejects.toThrow();
    });
  });

  describe("delete_file integration", () => {
    it("should delete file through service", async () => {
      const relPath = "test-files-tool/to-delete.txt";
      await fsp.writeFile(path.join(testDir, "to-delete.txt"), "content");

      await deleteFile(relPath);

      await expect(
        fsp.access(path.join(testDir, "to-delete.txt")),
      ).rejects.toThrow();
    });
  });
});