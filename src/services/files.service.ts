import { createHash } from "node:crypto";
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
