import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express 4 does not forward rejected promises from async route handlers to the
 * error middleware, so an async route that throws leaves the request hanging —
 * which the browser reports as an opaque "Failed to fetch". Wrap async handlers
 * with this so their rejections become a normal 500 instead.
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
