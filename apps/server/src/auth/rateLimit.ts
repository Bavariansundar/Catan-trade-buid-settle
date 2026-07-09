import rateLimit from "express-rate-limit";
import type { AppConfig } from "../config.js";

export function createAuthRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" },
  });
}

export function createRefreshRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.refreshRateLimit.windowMs,
    limit: config.refreshRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" },
  });
}
