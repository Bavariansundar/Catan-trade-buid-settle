import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { AuthService } from "./authService.js";
import { AuthError } from "./authService.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(40),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

function authErrorStatus(code: AuthError["code"]): number {
  switch (code) {
    case "EMAIL_TAKEN":
      return 409;
    case "INVALID_CREDENTIALS":
    case "INVALID_REFRESH_TOKEN":
      return 401;
  }
}

function toResponseBody(result: {
  user: { id: string; email: string; displayName: string };
  accessToken: string;
  refreshToken: string;
}) {
  return {
    user: { id: result.user.id, email: result.user.email, displayName: result.user.displayName },
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}

export interface AuthRateLimiters {
  readonly registerAndLogin: RequestHandler;
  readonly refresh: RequestHandler;
}

export function createAuthRouter(authService: AuthService, rateLimiters: AuthRateLimiters): Router {
  const router = Router();

  /**
   * @openapi
   * /auth/register:
   *   post:
   *     summary: Create a new account
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password, displayName]
   *             properties:
   *               email: { type: string, format: email }
   *               password: { type: string, minLength: 8 }
   *               displayName: { type: string }
   *     responses:
   *       200: { description: Account created, tokens issued }
   *       409: { description: Email already registered }
   */
  router.post("/register", rateLimiters.registerAndLogin, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await authService.register(
        parsed.data.email,
        parsed.data.password,
        parsed.data.displayName,
      );
      res.json(toResponseBody(result));
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(authErrorStatus(error.code)).json({ error: error.code });
        return;
      }
      throw error;
    }
  });

  /**
   * @openapi
   * /auth/login:
   *   post:
   *     summary: Log in with email + password
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email: { type: string, format: email }
   *               password: { type: string }
   *     responses:
   *       200: { description: Tokens issued }
   *       401: { description: Invalid email or password }
   */
  router.post("/login", rateLimiters.registerAndLogin, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await authService.login(parsed.data.email, parsed.data.password);
      res.json(toResponseBody(result));
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(authErrorStatus(error.code)).json({ error: error.code });
        return;
      }
      throw error;
    }
  });

  /**
   * @openapi
   * /auth/refresh:
   *   post:
   *     summary: Rotate a refresh token for a new access + refresh token pair
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refreshToken]
   *             properties:
   *               refreshToken: { type: string }
   *     responses:
   *       200: { description: New tokens issued }
   *       401: { description: Invalid, expired, or reused refresh token }
   */
  router.post("/refresh", rateLimiters.refresh, async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await authService.refresh(parsed.data.refreshToken);
      res.json(toResponseBody(result));
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(authErrorStatus(error.code)).json({ error: error.code });
        return;
      }
      throw error;
    }
  });

  /**
   * @openapi
   * /auth/logout:
   *   post:
   *     summary: Revoke a refresh token
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refreshToken]
   *             properties:
   *               refreshToken: { type: string }
   *     responses:
   *       204: { description: Logged out }
   */
  router.post("/logout", async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
      return;
    }
    await authService.logout(parsed.data.refreshToken);
    res.status(204).end();
  });

  return router;
}
