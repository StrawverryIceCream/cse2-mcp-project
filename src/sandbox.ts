import path from "path";
import fs from "fs";
import { env } from "./config.js";

const BLOCKED_PATTERNS = [/\.git\//, /\.env/, /node_modules\//];

export function resolveSafe(targetPath: string): string {
  // 1. Resolve against workspace root
  const resolved = path.resolve(env.WORKSPACE_ROOT, targetPath);

  // 2. Prevent directory traversal escapes
  if (!resolved.startsWith(env.WORKSPACE_ROOT)) {
    throw new Error(`Path ${targetPath} escapes workspace boundary.`);
  }

  // 3. Check blocked patterns
  const relativePath = path.relative(env.WORKSPACE_ROOT, resolved);
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(relativePath) || pattern.test(resolved)) {
      throw new Error(`Access to ${targetPath} is blocked by security rules.`);
    }
  }

  // 4. Realpath check (finding deepest existing ancestor for new files)
  let current = resolved;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break; // Reached system root
    current = parent;
  }

  // Ensure the deepest existing ancestor resolves to within the workspace
  const realAncestor = fs.realpathSync(current);
  if (!realAncestor.startsWith(fs.realpathSync(env.WORKSPACE_ROOT))) {
    throw new Error(
      `Symlink attack detected. Target resolves outside workspace: ${realAncestor}`,
    );
  }

  return resolved;
}
