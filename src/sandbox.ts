import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { env } from "./config.js";
import { ToolError } from "./errors.js";

fs.mkdirSync(env.WORKSPACE_ROOT, { recursive: true });
export const ROOT = fs.realpathSync(path.resolve(env.WORKSPACE_ROOT));

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  if (rel === "") return true; // the root itself
  return (
    rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel)
  );
}

/** Path relative to the workspace root, always with forward slashes. "" means the root. */
export function toRelative(absolute: string): string {
  return path.relative(ROOT, absolute).split(path.sep).join("/");
}

// realpath fails for paths that don't exist yet, so resolve the nearest existing ancestor.
async function realpathOfNearest(p: string): Promise<string> {
  const tail: string[] = [];
  let current = p;
  for (;;) {
    try {
      const real = await fsp.realpath(current);
      return path.join(real, ...tail.reverse());
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
      const parent = path.dirname(current);
      if (parent === current) throw err;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

const ENV_TEMPLATES = new Set([".env.example", ".env.sample", ".env.template"]);
const SECRET_NAME =
  /^(\.env(\..+)?|\.npmrc|id_(rsa|dsa|ecdsa|ed25519)|.+\.(pem|key|p12|pfx))$/;

/** True if any segment of a workspace-relative path is off limits (.git, .env files, keys). */
export function isBlockedRelative(rel: string): boolean {
  return rel
    .split(/[\\/]/)
    .filter(Boolean)
    .some((segment) => {
      // Windows ignores trailing dots and spaces, so ".git." is ".git".
      const s = segment.replace(/[. ]+$/, "").toLowerCase();
      if (s === ".git" || /^git~\d+$/.test(s)) return true;
      // NTFS alternate data streams ("file::$DATA") bypass name checks.
      if (process.platform === "win32" && s.includes(":")) return true;
      if (ENV_TEMPLATES.has(s)) return false;
      return SECRET_NAME.test(s);
    });
}

/**
 * Resolve a user-supplied path to an absolute path that is guaranteed to sit inside the
 * workspace. Rejects "..", outside absolute paths, symlinks leading out, and blocked names.
 * Note: the check and the later file operation are separate steps, so a symlink swapped in
 * between them is a known residual risk (documented in the README).
 */
export async function resolveSafe(input: string): Promise<string> {
  if (input.includes("\0")) {
    throw new ToolError("INVALID_INPUT", "Path contains a null byte.");
  }
  const abs = path.resolve(ROOT, input);
  if (!isInside(ROOT, abs)) {
    throw new ToolError(
      "OUTSIDE_WORKSPACE",
      `Path "${input}" is outside the workspace.`,
    );
  }
  const real = await realpathOfNearest(abs);
  if (!isInside(ROOT, real)) {
    throw new ToolError(
      "OUTSIDE_WORKSPACE",
      `Path "${input}" leads outside the workspace through a symlink.`,
    );
  }
  const shown = toRelative(abs);
  if (isBlockedRelative(shown) || isBlockedRelative(toRelative(real))) {
    throw new ToolError("BLOCKED_PATH", `Access to "${shown}" is not allowed.`);
  }
  return abs;
}
