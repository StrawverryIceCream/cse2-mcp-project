export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: string = "TOOL_ERROR",
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export class SandboxError extends ToolError {
  constructor(message: string) {
    super(message, "SANDBOX_VIOLATION");
    this.name = "SandboxError";
  }
}

export class VersionConflictError extends ToolError {
  constructor(message: string) {
    super(message, "VERSION_CONFLICT");
    this.name = "VersionConflictError";
  }
}

export class SizeLimitError extends ToolError {
  constructor(message: string) {
    super(message, "SIZE_LIMIT_EXCEEDED");
    this.name = "SizeLimitError";
  }
}
