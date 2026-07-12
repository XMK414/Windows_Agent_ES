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

/**
 * Build the CORS allow-list of exact local origins the UI may be served from.
 * A single hardcoded origin was the cause of "Failed to fetch" when the app
 * was opened via `localhost` instead of `127.0.0.1` (or on the Vite preview
 * port): the browser blocks any origin that isn't echoed back. We still refuse
 * wildcards — every entry is an exact local origin, plus anything the operator
 * explicitly lists in WAES_WEB_ORIGIN / WAES_WEB_ORIGINS (comma-separated).
 */
export function buildCorsAllowList(env: Record<string, string | undefined> = process.env): Set<string> {
  const hosts = ["127.0.0.1", "localhost"];
  const ports = ["5173", "4173"]; // vite dev + vite preview
  const defaults = hosts.flatMap((h) => ports.map((p) => `http://${h}:${p}`));
  const extra = [env.WAES_WEB_ORIGIN, env.WAES_WEB_ORIGINS]
    .filter((v): v is string => Boolean(v))
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  return new Set([...defaults, ...extra]);
}

/**
 * No wildcard CORS — the server only ever serves its own bundled UI origins.
 * Credentials must be explicitly allowed (browsers reject `include`-mode
 * requests otherwise) and the preflight OPTIONS request must be answered
 * here, before it ever reaches requireAuth — a preflight carries no
 * Authorization header, so letting it fall through would 401 every
 * cross-origin call the browser makes. When credentials are allowed the
 * ACAO header must name a single concrete origin, so we echo the request's
 * Origin only when it is on the allow-list.
 */
export function localOnlyCors(allowed: Set<string> | string) {
  const allowList = typeof allowed === "string" ? buildCorsAllowList() : allowed;
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && allowList.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-waes-csrf");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  };
}
