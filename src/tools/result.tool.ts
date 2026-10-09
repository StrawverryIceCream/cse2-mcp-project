import { ToolError } from "../errors.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export const ok = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
});

export const fail = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[output truncated: ${text.length - maxChars} more characters]`;
}

/**
 * Runs a tool body. ToolErrors become readable tool errors the model can act on; anything
 * else is logged on the server and reported without internal details.
 */
export async function run(body: () => Promise<string>): Promise<ToolResult> {
  try {
    return ok(await body());
  } catch (err) {
    if (err instanceof ToolError) return fail(`${err.code}: ${err.message}`);
    console.error("Unexpected tool error:", err);
    return fail(
      "INTERNAL_ERROR: the tool failed unexpectedly. See the server logs.",
    );
  }
}
