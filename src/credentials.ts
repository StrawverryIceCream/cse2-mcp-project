import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface Secrets {
  /** Sent by clients that can set headers, as "Authorization: Bearer <token>". */
  authToken: string;
  /**
   * Optional. Lets clients that can only set a URL (claude.ai custom connectors without
   * request headers) authenticate with "?key=<connectorKey>". Empty or undefined disables it.
   */
  connectorKey?: string | undefined;
}

/** Compares two secrets in constant time. Hashing first hides the length of the real secret. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header === undefined ? undefined : /^Bearer\s+(.+)$/i.exec(header)?.[1];
}

function urlKey(req: Request): string | undefined {
  const key: unknown = req.query["key"];
  return typeof key === "string" ? key : undefined;
}

export function createRequireAuth(secrets: Secrets) {
  const { authToken, connectorKey } = secrets;

  return function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const token = bearerToken(req);
    if (token !== undefined && safeEqual(token, authToken)) return next();

    const key = urlKey(req);
    if (connectorKey && key !== undefined && safeEqual(key, connectorKey)) return next();

    res.status(401).json({ error: "Unauthorized" });
  };
}