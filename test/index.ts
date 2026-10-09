/**
 * Test entry point for the MCP project.
 *
 * This file serves as the main entry point for running tests.
 * It can be used with tsx or compiled to JavaScript.
 *
 * Usage:
 *   npx tsx test/index.ts              - Run all tests
 *   npx tsx test/index.ts --watch      - Run tests in watch mode
 *   npx tsx test/index.ts --coverage   - Run tests with coverage
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main(): void {
  const args = process.argv.slice(2);
  const testArgs = ["run", ...args];

  console.log("Running MCP project tests...");
  console.log(`Arguments: ${args.join(" ") || "(none)"}`);

  const result = spawnSync(
    "npx",
    ["vitest", ...testArgs],
    {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        NODE_OPTIONS: "--experimental-vm-modules",
      },
    },
  );

  process.exit(result.status ?? 1);
}

main();