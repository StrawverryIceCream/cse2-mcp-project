import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "./config.js";

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length);
  const expectedToken = env.AUTH_TOKEN;

  // Prevent timing attacks
  const a = Buffer.from(token);
  const b = Buffer.from(expectedToken);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};
