import { beforeAll } from "vitest";
import dotenv from "dotenv";
import path from "node:path";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test environment variables
dotenv.config({ path: path.join(__dirname, "..", ".env.test") });

// Set default test environment variables if not set
if (!process.env.WORKSPACE_ROOT) {
  process.env.WORKSPACE_ROOT = path.join(__dirname, "fixtures", "workspace");
}
if (!process.env.AUTH_TOKEN) {
  process.env.AUTH_TOKEN = "test-auth-token";
}
if (!process.env.MAX_FILE_BYTES) {
  process.env.MAX_FILE_BYTES = "1048576";
}

beforeAll(async () => {
  // Ensure test workspace exists
  await fsp.mkdir(process.env.WORKSPACE_ROOT!, { recursive: true });
});
