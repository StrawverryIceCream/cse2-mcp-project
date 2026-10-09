import { createHash, randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { env } from "../config.js";
import { ToolError } from "../errors.js";
import { isBlockedRelative, resolveSafe } from "../sandbox.js";

const MAX_LIST_ENTRIES = 500;

/** Short content hash used as an optimistic-lock version. */
export function versionOf(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

async function statOrThrow(abs: string, shown: string): Promise<Stats> {
  try {
    return await fsp.stat(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ToolError("NOT_FOUND", `"${shown}" does not exist.`);
    }
    throw err;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface Listing {
  lines: string[];
  total: number;
  truncated: boolean;
}

export async function listDirectory(rel: string): Promise<Listing> {
  const abs = await resolveSafe(rel);
  const stat = await statOrThrow(abs, rel);
  if (!stat.isDirectory()) {
    throw new ToolError(
      "NOT_A_DIRECTORY",
      `"${rel}" is a file, not a directory.`,
    );
  }

  const entries = (await fsp.readdir(abs, { withFileTypes: true }))
    .filter((e) => !isBlockedRelative(e.name))
    .sort(
      (a, b) =>
        Number(b.isDirectory()) - Number(a.isDirectory()) ||
        a.name.localeCompare(b.name),
    );

  const shown = entries.slice(0, MAX_LIST_ENTRIES);
  const lines = await Promise.all(
    shown.map(async (e) => {
      if (e.isDirectory()) return `${e.name}/`;
      if (e.isSymbolicLink()) return `${e.name} (symlink)`;
      const { size } = await fsp
        .stat(path.join(abs, e.name))
        .catch(() => ({ size: 0 }));
      return `${e.name} (${formatSize(size)})`;
    }),
  );
  return {
    lines,
    total: entries.length,
    truncated: entries.length > shown.length,
  };
}

export interface FileContent {
  content: string;
  version: string;
  bytes: number;
}

export async function readTextFile(rel: string): Promise<FileContent> {
  const abs = await resolveSafe(rel);
  const stat = await statOrThrow(abs, rel);
  if (!stat.isFile()) {
    throw new ToolError(
      "NOT_A_FILE",
      `"${rel}" is a directory. Use list_files instead.`,
    );
  }
  if (stat.size > env.MAX_FILE_BYTES) {
    throw new ToolError(
      "TOO_LARGE",
      `"${rel}" is ${stat.size} bytes; the limit is ${env.MAX_FILE_BYTES}. Use search_code to find the part you need.`,
    );
  }
  const buffer = await fsp.readFile(abs);
  if (buffer.includes(0)) {
    throw new ToolError(
      "BINARY_FILE",
      `"${rel}" looks like a binary file; only text files can be read.`,
    );
  }
  return {
    content: buffer.toString("utf-8"),
    version: versionOf(buffer),
    bytes: buffer.length,
  };
}

// ---------------------------------------------------------------------------
// write_file / str_replace / delete_file
// ---------------------------------------------------------------------------

/** Write to a temp file in the same directory, then rename — atomic on same filesystem. */
async function atomicWrite(abs: string, content: string): Promise<void> {
  const dir = path.dirname(abs);
  const tmp = path.join(
    dir,
    `.${path.basename(abs)}.${randomBytes(6).toString("hex")}.tmp`,
  );
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(tmp, content, "utf-8");
  await fsp.rename(tmp, abs);
}

function assertWithinSizeCap(bytes: number, rel: string): void {
  if (bytes > env.MAX_FILE_BYTES) {
    throw new ToolError(
      "TOO_LARGE",
      `Writing "${rel}" would be ${bytes} bytes; the limit is ${env.MAX_FILE_BYTES}.`,
    );
  }
}

/** null means the file doesn't exist yet — distinct from "version doesn't match". */
async function currentVersionOrNull(abs: string): Promise<string | null> {
  try {
    const buffer = await fsp.readFile(abs);
    return versionOf(buffer);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export interface WriteResult {
  version: string;
  bytes: number;
}

export async function writeTextFile(
  rel: string,
  content: string,
  ifVersion?: string,
): Promise<WriteResult> {
  const bytes = Buffer.byteLength(content, "utf-8");
  assertWithinSizeCap(bytes, rel);

  const abs = await resolveSafe(rel);

  if (ifVersion !== undefined) {
    const current = await currentVersionOrNull(abs);
    if (current !== ifVersion) {
      throw new ToolError(
        "STALE_VERSION",
        `"${rel}" is at version ${current ?? "(new file)"}, not ${ifVersion}.`,
      );
    }
  }

  await atomicWrite(abs, content);
  return { version: versionOf(content), bytes };
}

export interface StrReplaceResult {
  version: string;
  bytes: number;
}

export async function strReplace(
  rel: string,
  oldStr: string,
  newStr: string,
  ifVersion?: string,
): Promise<StrReplaceResult> {
  // Reuses readTextFile's own NOT_FOUND / NOT_A_FILE / TOO_LARGE / BINARY_FILE
  // checks rather than re-deriving them.
  const { content, version } = await readTextFile(rel);

  if (ifVersion !== undefined && version !== ifVersion) {
    throw new ToolError(
      "STALE_VERSION",
      `"${rel}" is at version ${version}, not ${ifVersion}.`,
    );
  }

  const occurrences = content.split(oldStr).length - 1;
  if (occurrences !== 1) {
    throw new ToolError(
      "AMBIGUOUS_MATCH",
      occurrences === 0
        ? `old_str was not found in "${rel}".`
        : `old_str occurs ${occurrences} times in "${rel}"; it must occur exactly once.`,
    );
  }

  const updated = content.replace(oldStr, newStr);
  const bytes = Buffer.byteLength(updated, "utf-8");
  assertWithinSizeCap(bytes, rel);

  const abs = await resolveSafe(rel);
  await atomicWrite(abs, updated);
  return { version: versionOf(updated), bytes };
}

export async function deleteFile(rel: string): Promise<void> {
  const abs = await resolveSafe(rel);
  const stat = await statOrThrow(abs, rel);
  if (!stat.isFile()) {
    throw new ToolError(
      "NOT_A_FILE",
      `"${rel}" is a directory; delete_file only removes files.`,
    );
  }
  await fsp.unlink(abs);
}