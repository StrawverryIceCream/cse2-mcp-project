import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { env } from "./config.js";

fs.mkdirSync(env.WORKSPACE_ROOT, { recursive: true });
const ROOT = fs.realpathSync(path.resolve(env.WORKSPACE_ROOT));

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  if (rel === "") return true; // the root itself
  return (
    rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel)
  );
}

// realpath fails for files that don't exist yet, so resolve the nearest existing ancestor.
async function realpathOfNearest(p: string): Promise<string> {
  const tail: string[] = [];
  let current = p;
  for (;;) {
    try {
      const real = await fsp.realpath(current);
      return path.join(real, ...tail.reverse());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const parent = path.dirname(current);
      if (parent === current) throw err;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

export async function resolveSafe(rel: string): Promise<string> {
  const abs = path.resolve(ROOT, rel);
  if (!isInside(ROOT, abs)) {
    throw new Error(`Path ${rel} escapes workspace boundary`);
  }
  const real = await realpathOfNearest(abs);
  if (!isInside(ROOT, real)) {
    throw new Error(`Path ${rel} escapes workspace via symlink`);
  }
  return abs;
}

export { ROOT };
