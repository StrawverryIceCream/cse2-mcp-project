#!/usr/bin/env node
/**
 * Test runner script for MCP project.
 * This script can be called directly or via npm test.
 *
 * Usage:
 *   npm test              - Run all tests
 *   npm run test:watch    - Run tests in watch mode
 *   npm run test:coverage - Run tests with coverage
 *   npm run test:unit     - Run only unit tests
 *   npm run test:services - Run only service tests
 *   npm run test:tools    - Run only tool tests
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TestOptions {
  watch?: boolean;
  coverage?: boolean;
  pattern?: string;
  directory?: string;
}

function runTests(options: TestOptions = {}): void {
  const args: string[] = ["run"];

  if (options.watch) {
    args.splice(0, 1, "watch");
  }

  if (options.coverage) {
    args.push("--coverage");
  }

  if (options.pattern) {
    args.push("--testNamePattern", options.pattern);
  }

  if (options.directory) {
    args.push(options.directory);
  }

  console.log(`Running tests with options: ${JSON.stringify(options)}`);
  console.log(`Command: vitest ${args.join(" ")}`);

  const result = spawnSync("npx", ["vitest", ...args], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_OPTIONS: "--experimental-vm-modules",
    },
  });

  process.exit(result.status ?? 1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: TestOptions = {};

if (args.includes("--watch") || args.includes("-w")) {
  options.watch = true;
}

if (args.includes("--coverage") || args.includes("-c")) {
  options.coverage = true;
}

const patternIndex = args.findIndex((arg) => arg === "--pattern" || arg === "-p");
if (patternIndex !== -1 && args[patternIndex + 1]) {
  options.pattern = args[patternIndex + 1];
}

const dirIndex = args.findIndex((arg) => arg === "--dir" || arg === "-d");
if (dirIndex !== -1 && args[dirIndex + 1]) {
  options.directory = args[dirIndex + 1];
}

// Check if vitest is available
const vitestConfig = path.join(__dirname, "..", "vitest.config.ts");
if (!existsSync(vitestConfig)) {
  console.error("Error: vitest.config.ts not found");
  process.exit(1);
}

runTests(options);