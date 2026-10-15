import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** Compares two secrets in constant time. Hashing first hides the length of the real secret. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** Every key the client presented: the Bearer header and/or the ?key= URL param. */
function presentedKeys(req: Request): string[] {
  const keys: string[] = [];
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
  if (bearer !== undefined) keys.push(bearer);
  const query: unknown = req.query["key"];
  if (typeof query === "string") keys.push(query);
  return keys;
}

/** One secret, accepted from either the header or the URL, so every client uses the same key. */
export function createRequireAuth(secret: string) {
  return function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (presentedKeys(req).some((key) => safeEqual(key, secret))) return next();
    res.status(401).json({ error: "Unauthorized" });
  };
}
