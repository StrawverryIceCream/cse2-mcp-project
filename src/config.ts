import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  WORKSPACE_ROOT: z.string().min(1, "WORKSPACE_ROOT is required"),
  AUTH_TOKEN: z.string().min(1, "AUTH_TOKEN is required"),
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