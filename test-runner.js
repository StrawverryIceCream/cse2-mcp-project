#!/usr/bin/env node
/**
 * Test runner script for MCP project.
 *
 * This script can be called when running `npm test` to execute all test suites.
 * It provides a clean interface for running different test categories.
 *
 * Usage:
 *   npm test                    - Run all tests
 *   npm run test:watch          - Run tests in watch mode
 *   npm run test:coverage       - Run tests with coverage
 *   npm run test:unit           - Run only unit tests
 *   npm run test:services       - Run only service tests
 *   npm run test:tools          - Run only tool tests
 *   npm run test:files          - Run only file-related tests
 *   npm run test:git            - Run only git-related tests
 *   npm run test:search         - Run only search-related tests
 *   npm run test:sandbox        - Run only sandbox tests
 *   npm run test:errors         - Run only error tests
 */

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT_DIR = path.join(__dirname);

// Test suites configuration
const TEST_SUITES = {
  all: {
    args: ["run"],
    description: "All tests",
  },
  watch: {
    args: ["watch"],
    description: "All tests (watch mode)",
  },
  coverage: {
    args: ["run", "--coverage"],
    description: "All tests with coverage",
  },
  unit: {
    args: ["run", "--testNamePattern", "^(files|git|search|errors|sandbox|result)"],
    description: "Unit tests only",
  },
  services: {
    args: ["run", "test/services", "test/tools"],
    description: "Service and tool tests",
  },
  tools: {
    args: ["run", "test/tools"],
    description: "Tool integration tests",
  },
  files: {
    args: ["run", "--testNamePattern", "files"],
    description: "File-related tests",
  },
  git: {
    args: ["run", "--testNamePattern", "git"],
    description: "Git-related tests",
  },
  search: {
    args: ["run", "--testNamePattern", "search"],
    description: "Search-related tests",
  },
  sandbox: {
    args: ["run", "--testNamePattern", "sandbox"],
    description: "Sandbox tests",
  },
  errors: {
    args: ["run", "--testNamePattern", "errors"],
    description: "Error tests",
  },
};

function runTests(suite = "all") {
  const config = TEST_SUITES[suite];
  if (!config) {
    console.error(`Unknown test suite: ${suite}`);
    console.log(`Available suites: ${Object.keys(TEST_SUITES).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Running: ${config.description}`);
  console.log(`${"=".repeat(60)}\n`);

  const result = spawnSync(
    "npx",
    ["vitest", ...config.args],
    {
      stdio: "inherit",
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        NODE_OPTIONS: "--experimental-vm-modules",
      },
    },
  );

  return result.status ?? 1;
}

function main() {
  const args = process.argv.slice(2);

  // Determine suite from arguments
  let suite = "all";
  for (const [key] of Object.entries(TEST_SUITES)) {
    if (args.includes(`--${key}`)) {
      suite = key;
      break;
    }
  }

  // Check if vitest is available
  const vitestConfig = path.join(ROOT_DIR, "vitest.config.ts");
  if (!fs.existsSync(vitestConfig)) {
    console.error("Error: vitest.config.ts not found");
    process.exit(1);
  }

  // Run tests
  const exitCode = runTests(suite);
  process.exit(exitCode);
}

main();