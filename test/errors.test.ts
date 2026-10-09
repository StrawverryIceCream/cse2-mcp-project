import { describe, it, expect } from "vitest";
import {
  ToolError,
  SandboxError,
  NotFoundError,
  VersionConflictError,
  NotUniqueMatchError,
  IsDirectoryError,
  BlockedPathError,
  SizeCapError,
  toToolError,
} from "../src/errors.js";

describe("errors", () => {
  describe("ToolError", () => {
    it("should create error with code and message", () => {
      const error = new ToolError("NOT_FOUND", "File not found");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe("File not found");
      expect(error.name).toBe("ToolError");
    });
  });

  describe("VersionConflictError", () => {
    it("should create error with current version", () => {
      const error = new VersionConflictError("abc123");
      expect(error.currentVersion).toBe("abc123");
      expect(error.message).toContain("abc123");
      expect(error.name).toBe("VersionConflictError");
    });

    it("should accept custom message", () => {
      const error = new VersionConflictError("abc123", "Custom message");
      expect(error.message).toBe("Custom message");
    });
  });

  describe("NotUniqueMatchError", () => {
    it("should create error for zero matches", () => {
      const error = new NotUniqueMatchError(0);
      expect(error.matchCount).toBe(0);
      expect(error.message).toContain("not found");
      expect(error.name).toBe("NotUniqueMatchError");
    });

    it("should create error for multiple matches", () => {
      const error = new NotUniqueMatchError(3);
      expect(error.matchCount).toBe(3);
      expect(error.message).toContain("3 times");
      expect(error.name).toBe("NotUniqueMatchError");
    });

    it("should accept custom message", () => {
      const error = new NotUniqueMatchError(2, "Custom message");
      expect(error.message).toBe("Custom message");
    });
  });

  describe("BlockedPathError", () => {
    it("should create error with path", () => {
      const error = new BlockedPathError(".env");
      expect(error.message).toContain(".env");
      expect(error.name).toBe("BlockedPathError");
    });
  });

  describe("toToolError", () => {
    it("should map VersionConflictError", () => {
      const error = new VersionConflictError("abc123");
      const result = toToolError(error);
      expect(result.code).toBe("version_conflict");
      expect(result.message).toContain("abc123");
    });

    it("should map NotUniqueMatchError", () => {
      const error = new NotUniqueMatchError(2);
      const result = toToolError(error);
      expect(result.code).toBe("not_unique_match");
      expect(result.message).toContain("2 times");
    });

    it("should map NotFoundError", () => {
      const error = new NotFoundError("File not found");
      const result = toToolError(error);
      expect(result.code).toBe("not_found");
      expect(result.message).toBe("File not found");
    });

    it("should map IsDirectoryError", () => {
      const error = new IsDirectoryError("Is a directory");
      const result = toToolError(error);
      expect(result.code).toBe("is_directory");
      expect(result.message).toBe("Is a directory");
    });

    it("should map BlockedPathError", () => {
      const error = new BlockedPathError(".env");
      const result = toToolError(error);
      expect(result.code).toBe("blocked_path");
    });

    it("should map SandboxError", () => {
      const error = new SandboxError("Sandbox violation");
      const result = toToolError(error);
      expect(result.code).toBe("sandbox_violation");
      expect(result.message).toBe("Sandbox violation");
    });

    it("should map SizeCapError", () => {
      const error = new SizeCapError("File too large");
      const result = toToolError(error);
      expect(result.code).toBe("size_cap_exceeded");
      expect(result.message).toBe("File too large");
    });

    it("should map generic Error", () => {
      const error = new Error("Generic error");
      const result = toToolError(error);
      expect(result.code).toBe("internal_error");
      expect(result.message).toBe("Generic error");
    });

    it("should handle non-Error objects", () => {
      const result = toToolError("string error");
      expect(result.code).toBe("internal_error");
      expect(result.message).toBe("string error");
    });
  });
});
