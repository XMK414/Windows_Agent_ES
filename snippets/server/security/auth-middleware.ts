import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Even a localhost-only server is reachable by any other local process or
 * a malicious page open in another browser tab. A random per-install token
 * plus a CSRF double-submit cookie closes both gaps without needing real
 * user accounts for a single-user local app.
 */
export function generateInstallToken(): string {
  return randomBytes(32).toString("hex");
}

export interface AuthConfig {
  installToken: string;
  csrfCookieName: string;
  csrfHeaderName: string;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function requireAuth(config: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/health") return next();

    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!bearer || !safeEqual(bearer, config.installToken)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const isStateChanging = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (isStateChanging) {
      const csrfCookie = req.cookies?.[config.csrfCookieName];
      const csrfHeader = req.headers[config.csrfHeaderName.toLowerCase()];
      if (!csrfCookie || typeof csrfHeader !== "string" || !safeEqual(csrfCookie, csrfHeader)) {
        return res.status(403).json({ error: "csrf check failed" });
      }
    }

    next();
  };
}

/** No wildcard CORS — the server only ever serves its own bundled UI origin. */
export function localOnlyCors(allowedOrigin: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
    next();
  };
}
