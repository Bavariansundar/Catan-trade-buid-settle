import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  readonly sub: string;
  readonly displayName: string;
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  ttlSeconds: number,
): string {
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
}

/** Throws (via jsonwebtoken) if the token is malformed, expired, or signed with a different secret. */
export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new Error("Malformed access token payload");
  }
  return { sub: decoded.sub, displayName: String(decoded["displayName"] ?? "") };
}

/** A fresh opaque refresh token — the raw value is only ever sent to the client, never stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
