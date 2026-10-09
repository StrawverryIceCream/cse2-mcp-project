import { describe, it, expect } from "vitest";
import { run } from "../../src/tools/result.tool.js";
import { ToolError } from "../../src/errors.js";

describe("result.tool", () => {
  describe("run", () => {
    it("should execute async function and return result", async () => {
      const result = await run(async () => "success");
      expect(result).toEqual({
        content: [{ type: "text", text: "success" }],
      });
    });

    it("should execute sync function and return result", async () => {
      const result = await run(() => "42");
      expect(result).toEqual({
        content: [{ type: "text", text: "42" }],
      });
    });

    it("should handle errors from function", async () => {
      const result = await run(async () => {
        throw new Error("test error");
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("INTERNAL_ERROR");
    });

    it("should handle ToolError", async () => {
      const result = await run(async () => {
        throw new ToolError("NOT_FOUND", "File not found");
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("NOT_FOUND: File not found");
    });

    it("should handle async errors", async () => {
      const result = await run(async () => {
        await Promise.reject(new Error("async error"));
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("INTERNAL_ERROR");
    });
  });
});