import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config.js";
import { verifyAccessToken } from "./tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's own convention for augmenting Request
  namespace Express {
    interface Request {
      userId?: string;
      displayName?: string;
    }
  }
}

/** Verifies the `Authorization: Bearer <accessToken>` header, rejecting with 401 if missing/invalid. */
export function requireAuth(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    try {
      const payload = verifyAccessToken(token, config.jwtAccessSecret);
      req.userId = payload.sub;
      req.displayName = payload.displayName;
      next();
    } catch {
      res.status(401).json({ error: "UNAUTHENTICATED" });
    }
  };
}
