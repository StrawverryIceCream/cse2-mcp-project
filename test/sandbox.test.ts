import { describe, it, expect } from "vitest";
import path from "node:path";
import { isBlockedRelative, toRelative, resolveSafe } from "../src/sandbox.js";
import { ToolError } from "../src/errors.js";

describe("sandbox", () => {
  describe("isBlockedRelative", () => {
    it("should block .git directory", () => {
      expect(isBlockedRelative(".git")).toBe(true);
      expect(isBlockedRelative(".git/config")).toBe(true);
      expect(isBlockedRelative("path/.git/file")).toBe(true);
    });

    it("should block .env files", () => {
      expect(isBlockedRelative(".env")).toBe(true);
      expect(isBlockedRelative(".env.local")).toBe(true);
      expect(isBlockedRelative(".env.production")).toBe(true);
      expect(isBlockedRelative("path/.env")).toBe(true);
    });

    it("should allow .env templates", () => {
      expect(isBlockedRelative(".env.example")).toBe(false);
      expect(isBlockedRelative(".env.sample")).toBe(false);
      expect(isBlockedRelative(".env.template")).toBe(false);
    });

    it("should block SSH keys", () => {
      expect(isBlockedRelative("id_rsa")).toBe(true);
      expect(isBlockedRelative("id_ed25519")).toBe(true);
      expect(isBlockedRelative(".ssh/id_rsa")).toBe(true);
    });

    it("should block key files", () => {
      expect(isBlockedRelative("private.key")).toBe(true);
      expect(isBlockedRelative("cert.pem")).toBe(true);
      expect(isBlockedRelative("keystore.p12")).toBe(true);
      expect(isBlockedRelative("cert.pfx")).toBe(true);
    });

    it("should allow normal files", () => {
      expect(isBlockedRelative("README.md")).toBe(false);
      expect(isBlockedRelative("src/index.ts")).toBe(false);
      expect(isBlockedRelative("package.json")).toBe(false);
      expect(isBlockedRelative("config.js")).toBe(false);
    });

    it("should handle Windows paths", () => {
      expect(isBlockedRelative(".git\\config")).toBe(true);
      expect(isBlockedRelative("path\\.env")).toBe(true);
    });
  });

  describe("toRelative", () => {
    it("should convert absolute to relative path", () => {
      const ROOT = path.resolve(process.env.WORKSPACE_ROOT!);
      const absolute = path.join(ROOT, "src", "index.ts");
      const relative = toRelative(absolute);
      expect(relative).toBe("src/index.ts");
    });

    it("should return empty string for root", () => {
      const ROOT = path.resolve(process.env.WORKSPACE_ROOT!);
      const relative = toRelative(ROOT);
      expect(relative).toBe("");
    });

    it("should always use forward slashes", () => {
      const ROOT = path.resolve(process.env.WORKSPACE_ROOT!);
      const absolute = path.join(ROOT, "path", "to", "file.txt");
      const relative = toRelative(absolute);
      expect(relative).not.toContain("\\");
      expect(relative).toBe("path/to/file.txt");
    });
  });

  describe("resolveSafe", () => {
    it("should resolve path within workspace", async () => {
      const result = await resolveSafe("test-file.txt");
      expect(result).toContain(path.resolve(process.env.WORKSPACE_ROOT!));
    });

    it("should reject null bytes", async () => {
      await expect(resolveSafe("file\0name")).rejects.toThrow(ToolError);
      await expect(resolveSafe("file\0name")).rejects.toThrow("null byte");
    });

    it("should reject paths outside workspace", async () => {
      await expect(resolveSafe("../../../etc/passwd")).rejects.toThrow(
        ToolError,
      );
      await expect(resolveSafe("../../../etc/passwd")).rejects.toThrow(
        "outside the workspace",
      );
    });

    it("should reject blocked paths", async () => {
      await expect(resolveSafe(".git")).rejects.toThrow(ToolError);
      await expect(resolveSafe(".git")).rejects.toThrow("not allowed");

      await expect(resolveSafe(".env")).rejects.toThrow(ToolError);
      await expect(resolveSafe(".env")).rejects.toThrow("not allowed");
    });

    it("should allow nested paths within workspace", async () => {
      const result = await resolveSafe("path/to/nested/file.txt");
      expect(result).toContain(path.resolve(process.env.WORKSPACE_ROOT!));
    });

    it("should normalize paths", async () => {
      const result1 = await resolveSafe("./file.txt");
      const result2 = await resolveSafe("file.txt");
      expect(path.basename(result1)).toBe("file.txt");
      expect(path.basename(result2)).toBe("file.txt");
    });
  });
});