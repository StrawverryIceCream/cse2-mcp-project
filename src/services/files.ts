import fs from "fs/promises";
import { createHash } from "crypto";
import { SizeLimitError, VersionConflictError } from "../errors.js";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB limit example

export async function listDirectoryFiles(safePath: string): Promise<string[]> {
  const entries = await fs.readdir(safePath, { withFileTypes: true });
  return entries.map((entry) =>
    entry.isDirectory() ? `${entry.name}/` : entry.name,
  );
}

export async function readFileContent(
  safePath: string,
): Promise<{ content: string; version: string }> {
  const stats = await fs.stat(safePath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new SizeLimitError(
      `File exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes.`,
    );
  }

  const content = await fs.readFile(safePath, "utf-8");
  const version = createHash("sha256").update(content).digest("hex");

  return { content, version };
}

export async function writeFileAtomic(
  safePath: string,
  content: string,
  expectedVersion?: string,
): Promise<string> {
  // If file exists and expectedVersion is supplied, enforce optimistic concurrency check
  try {
    const existingContent = await fs.readFile(safePath, "utf-8");
    if (expectedVersion) {
      const currentVersion = createHash("sha256")
        .update(existingContent)
        .digest("hex");
      if (currentVersion !== expectedVersion) {
        throw new VersionConflictError(
          "File has been modified elsewhere. Version mismatch.",
        );
      }
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err; // Ignore if file doesn't exist yet
  }

  const tempPath = `${safePath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, safePath);

  const newVersion = createHash("sha256").update(content).digest("hex");
  return newVersion;
}

export async function deleteFileSafe(safePath: string): Promise<void> {
  await fs.unlink(safePath);
}
