export type ToolErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_A_FILE"
  | "NOT_A_DIRECTORY"
  | "OUTSIDE_WORKSPACE"
  | "BLOCKED_PATH"
  | "TOO_LARGE"
  | "BINARY_FILE"
  | "STALE_VERSION"
  | "AMBIGUOUS_MATCH"
  | "PROTECTED_FILE"
  | "GIT_FAILED";

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}
