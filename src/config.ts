import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32, "must be at least 32 characters").optional(),
);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  WORKSPACE_ROOT: z.string().min(1, "WORKSPACE_ROOT is required"),
  AUTH_TOKEN: z.string().min(1, "AUTH_TOKEN is required"),
  CONNECTOR_KEY: optionalSecret,
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(1_048_576),
  ANTHROPIC_API_KEY: z.string().optional(),
  NGROK_AUTHTOKEN: z.string().optional(),
  NGROK_DOMAIN: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
