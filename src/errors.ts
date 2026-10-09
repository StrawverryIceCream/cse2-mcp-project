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
  | "GIT_FAILED"
  | "VERSION_CONFLICT"
  | "NO_UNIQUE_MATCH"
  | "SANDBOX" ;


export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}
 
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
 
export class VersionConflictError extends Error {
  constructor(public currentVersion: string, message?: string) {
    super(message ?? `Version mismatch — current version is ${currentVersion}.`);
    this.name = "VersionConflictError";
  }
}
 
export class NotUniqueMatchError extends Error {
  constructor(public matchCount: number, message?: string) {
    super(
      message ??
        (matchCount === 0
          ? "old_str was not found in the file."
          : `old_str occurs ${matchCount} times; it must occur exactly once.`)
    );
    this.name = "NotUniqueMatchError";
  }
}
 
export class IsDirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IsDirectoryError";
  }
}
 
export class BlockedPathError extends Error {
  constructor(relativePath: string) {
    super(`Path "${relativePath}" is blocked and cannot be accessed.`);
    this.name = "BlockedPathError";
  }
}
 
export class SizeCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SizeCapError";
  }
}
 
/** Maps a thrown error to a stable { code, message } shape for MCP tool results. */
export function toToolError(err: unknown): { code: string; message: string } {
  if (err instanceof VersionConflictError) {
    return { code: "version_conflict", message: err.message };
  }
  if (err instanceof NotUniqueMatchError) {
    return { code: "not_unique_match", message: err.message };
  }
  if (err instanceof NotFoundError) {
    return { code: "not_found", message: err.message };
  }
  if (err instanceof IsDirectoryError) {
    return { code: "is_directory", message: err.message };
  }
  if (err instanceof BlockedPathError) {
    return { code: "blocked_path", message: err.message };
  }
  if (err instanceof SandboxError) {
    return { code: "sandbox_violation", message: err.message };
  }
  if (err instanceof SizeCapError) {
    return { code: "size_cap_exceeded", message: err.message };
  }
  if (err instanceof Error) {
    return { code: "internal_error", message: err.message };
  }
  return { code: "internal_error", message: String(err) };
}