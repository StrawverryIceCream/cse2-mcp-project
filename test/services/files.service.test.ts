import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  listDirectory,
  readTextFile,
  writeTextFile,
  strReplace,
  deleteFile,
  versionOf,
} from "../../src/services/files.service.js";
import { ToolError } from "../../src/errors.js";

describe("files.service", () => {
  const testDir = path.join(
    process.env.WORKSPACE_ROOT!,
    "test-files-service",
  );

  beforeEach(async () => {
    await fsp.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
  });

  describe("versionOf", () => {
    it("should generate consistent version hash for same content", () => {
      const content = "test content";
      const v1 = versionOf(content);
      const v2 = versionOf(content);
      expect(v1).toBe(v2);
      expect(v1).toHaveLength(16);
    });

    it("should generate different versions for different content", () => {
      const v1 = versionOf("content A");
      const v2 = versionOf("content B");
      expect(v1).not.toBe(v2);
    });
  });

  describe("listDirectory", () => {
    it("should list files in a directory", async () => {
      const relPath = "test-files-service";
      await fsp.writeFile(path.join(testDir, "file1.txt"), "content1");
      await fsp.writeFile(path.join(testDir, "file2.txt"), "content2");
      await fsp.mkdir(path.join(testDir, "subdir"));

      const result = await listDirectory(relPath);

      expect(result.total).toBe(3);
      expect(result.truncated).toBe(false);
      expect(result.lines).toContain("subdir/");
      expect(result.lines.some((l) => l.startsWith("file1.txt"))).toBe(true);
      expect(result.lines.some((l) => l.startsWith("file2.txt"))).toBe(true);
    });

    it("should return empty listing for empty directory", async () => {
      const relPath = "test-files-service";
      const result = await listDirectory(relPath);

      expect(result.total).toBe(0);
      expect(result.truncated).toBe(false);
      expect(result.lines).toEqual([]);
    });

    it("should throw NOT_FOUND for non-existent directory", async () => {
      await expect(listDirectory("nonexistent")).rejects.toThrow(ToolError);
      await expect(listDirectory("nonexistent")).rejects.toThrow("does not exist");
    });

    it("should throw NOT_A_DIRECTORY for files", async () => {
      const relPath = "test-files-service/file.txt";
      await fsp.writeFile(path.join(testDir, "file.txt"), "content");

      await expect(listDirectory(relPath)).rejects.toThrow(ToolError);
      await expect(listDirectory(relPath)).rejects.toThrow("not a directory");
    });

    it("should filter out blocked files", async () => {
      const relPath = "test-files-service";
      await fsp.writeFile(path.join(testDir, "normal.txt"), "content");
      await fsp.writeFile(path.join(testDir, ".env"), "SECRET=value");

      const result = await listDirectory(relPath);

      expect(result.lines.some((l) => l.startsWith("normal.txt"))).toBe(true);
      expect(result.lines.some((l) => l.includes(".env"))).toBe(false);
    });
  });

  describe("readTextFile", () => {
    it("should read file content with version", async () => {
      const relPath = "test-files-service/read-test.txt";
      const content = "Hello, World!";
      await fsp.writeFile(path.join(testDir, "read-test.txt"), content);

      const result = await readTextFile(relPath);

      expect(result.content).toBe(content);
      expect(result.version).toBe(versionOf(content));
      expect(result.bytes).toBe(Buffer.byteLength(content));
    });

    it("should throw NOT_FOUND for non-existent file", async () => {
      await expect(
        readTextFile("test-files-service/nonexistent.txt"),
      ).rejects.toThrow(ToolError);
    });

    it("should throw NOT_A_FILE for directories", async () => {
      await expect(readTextFile("test-files-service")).rejects.toThrow(
        ToolError,
      );
      await expect(readTextFile("test-files-service")).rejects.toThrow(
        "Use list_files instead",
      );
    });

    it("should throw BINARY_FILE for binary content", async () => {
      const relPath = "test-files-service/binary.bin";
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      await fsp.writeFile(path.join(testDir, "binary.bin"), binaryContent);

      await expect(readTextFile(relPath)).rejects.toThrow(ToolError);
      await expect(readTextFile(relPath)).rejects.toThrow("binary file");
    });
  });

  describe("writeTextFile", () => {
    it("should create a new file", async () => {
      const relPath = "test-files-service/new-file.txt";
      const content = "New content";

      const result = await writeTextFile(relPath, content);

      expect(result.version).toBe(versionOf(content));
      expect(result.bytes).toBe(Buffer.byteLength(content));

      const written = await fsp.readFile(
        path.join(testDir, "new-file.txt"),
        "utf-8",
      );
      expect(written).toBe(content);
    });

    it("should overwrite existing file without ifVersion", async () => {
      const relPath = "test-files-service/overwrite.txt";
      await fsp.writeFile(path.join(testDir, "overwrite.txt"), "old content");

      const newContent = "new content";
      const result = await writeTextFile(relPath, newContent);

      expect(result.version).toBe(versionOf(newContent));
      const written = await fsp.readFile(
        path.join(testDir, "overwrite.txt"),
        "utf-8",
      );
      expect(written).toBe(newContent);
    });

    it("should respect ifVersion when provided", async () => {
      const relPath = "test-files-service/versioned.txt";
      const initialContent = "initial";
      await fsp.writeFile(path.join(testDir, "versioned.txt"), initialContent);
      const version = versionOf(initialContent);

      const newContent = "updated";
      await writeTextFile(relPath, newContent, version);

      const written = await fsp.readFile(
        path.join(testDir, "versioned.txt"),
        "utf-8",
      );
      expect(written).toBe(newContent);
    });

    it("should throw STALE_VERSION when version mismatch", async () => {
      const relPath = "test-files-service/stale.txt";
      await fsp.writeFile(path.join(testDir, "stale.txt"), "content");

      try {
        await writeTextFile(relPath, "new content", "wrong-version");
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ToolError);
        expect((err as ToolError).code).toBe("STALE_VERSION");
      }
    });

    it("should create nested directories", async () => {
      const relPath = "test-files-service/nested/deep/file.txt";
      const content = "nested content";

      await writeTextFile(relPath, content);

      const written = await fsp.readFile(
        path.join(testDir, "nested", "deep", "file.txt"),
        "utf-8",
      );
      expect(written).toBe(content);
    });
  });

  describe("strReplace", () => {
    it("should replace text in file", async () => {
      const relPath = "test-files-service/replace.txt";
      const initial = "Hello World";
      await fsp.writeFile(path.join(testDir, "replace.txt"), initial);

      const result = await strReplace(relPath, "World", "Universe");

      expect(result.version).toBe(versionOf("Hello Universe"));
      const updated = await fsp.readFile(
        path.join(testDir, "replace.txt"),
        "utf-8",
      );
      expect(updated).toBe("Hello Universe");
    });

    it("should respect ifVersion", async () => {
      const relPath = "test-files-service/versioned-replace.txt";
      const initial = "Hello World";
      await fsp.writeFile(path.join(testDir, "versioned-replace.txt"), initial);
      const version = versionOf(initial);

      await strReplace(relPath, "World", "Universe", version);

      const updated = await fsp.readFile(
        path.join(testDir, "versioned-replace.txt"),
        "utf-8",
      );
      expect(updated).toBe("Hello Universe");
    });

    it("should throw when old_str not found", async () => {
      const relPath = "test-files-service/not-found.txt";
      await fsp.writeFile(path.join(testDir, "not-found.txt"), "Hello World");

      await expect(
        strReplace(relPath, "NotExists", "Something"),
      ).rejects.toThrow(ToolError);
      await expect(
        strReplace(relPath, "NotExists", "Something"),
      ).rejects.toThrow("not found");
    });

    it("should throw when old_str appears multiple times", async () => {
      const relPath = "test-files-service/multiple.txt";
      await fsp.writeFile(
        path.join(testDir, "multiple.txt"),
        "Hello Hello Hello",
      );

      await expect(strReplace(relPath, "Hello", "Hi")).rejects.toThrow(
        ToolError,
      );
      await expect(strReplace(relPath, "Hello", "Hi")).rejects.toThrow(
        "occurs 3 times",
      );
    });

    it("should handle empty replacement", async () => {
      const relPath = "test-files-service/empty-replace.txt";
      await fsp.writeFile(path.join(testDir, "empty-replace.txt"), "Hello X World");

      await strReplace(relPath, " X", "");

      const updated = await fsp.readFile(
        path.join(testDir, "empty-replace.txt"),
        "utf-8",
      );
      expect(updated).toBe("Hello World");
    });
  });

  describe("deleteFile", () => {
    it("should delete existing file", async () => {
      const relPath = "test-files-service/to-delete.txt";
      await fsp.writeFile(path.join(testDir, "to-delete.txt"), "content");

      await deleteFile(relPath);

      await expect(
        fsp.access(path.join(testDir, "to-delete.txt")),
      ).rejects.toThrow();
    });

    it("should throw NOT_FOUND for non-existent file", async () => {
      await expect(
        deleteFile("test-files-service/nonexistent.txt"),
      ).rejects.toThrow(ToolError);
    });

    it("should throw NOT_A_FILE for directories", async () => {
      await expect(deleteFile("test-files-service")).rejects.toThrow(ToolError);
      await expect(deleteFile("test-files-service")).rejects.toThrow(
        "only removes files",
      );
    });
  });
});
