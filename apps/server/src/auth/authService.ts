import type { AppConfig } from "../config.js";
import type { User } from "../domain/types.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import type { RefreshTokenRepository } from "./refreshTokenRepository.js";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "./tokens.js";
import type { UserRepository } from "./userRepository.js";

export type AuthErrorCode = "EMAIL_TAKEN" | "INVALID_CREDENTIALS" | "INVALID_REFRESH_TOKEN";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthResult {
  readonly user: User;
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Register/login/refresh/logout business logic — see
 * docs/architecture/server.md §2. Speaks only to the repository
 * interfaces, so it's exercised identically against the in-memory
 * doubles in tests and the Prisma-backed repositories in production.
 */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly config: AppConfig,
  ) {}

  async register(email: string, password: string, displayName: string): Promise<AuthResult> {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new AuthError("EMAIL_TAKEN", `${email} is already registered`);
    const passwordHash = await hashPassword(password, this.config.bcryptCostFactor);
    const user = await this.users.create({ email, passwordHash, displayName });
    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password");
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password");
    return this.issueTokens(user);
  }

  async refresh(rawRefreshToken: string): Promise<AuthResult> {
    const record = await this.refreshTokens.findByHash(hashRefreshToken(rawRefreshToken));
    if (!record) throw new AuthError("INVALID_REFRESH_TOKEN", "Unknown refresh token");

    if (record.revokedAt) {
      // A revoked token being presented again means it (or a descendant)
      // may have leaked — kill the rest of the chain, not just this token.
      await this.refreshTokens.revokeChainFrom(record.id);
      throw new AuthError("INVALID_REFRESH_TOKEN", "Refresh token reuse detected");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new AuthError("INVALID_REFRESH_TOKEN", "Refresh token expired");
    }
    const user = await this.users.findById(record.userId);
    if (!user) throw new AuthError("INVALID_REFRESH_TOKEN", "User no longer exists");

    const { raw, record: newRecord } = await this.createRefreshTokenRecord(user.id);
    await this.refreshTokens.markRotated(record.id, newRecord.id);
    return { user, accessToken: this.signAccess(user), refreshToken: raw };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const record = await this.refreshTokens.findByHash(hashRefreshToken(rawRefreshToken));
    if (record && !record.revokedAt) await this.refreshTokens.markRevoked(record.id);
  }

  private async issueTokens(user: User): Promise<AuthResult> {
    const { raw } = await this.createRefreshTokenRecord(user.id);
    return { user, accessToken: this.signAccess(user), refreshToken: raw };
  }

  private signAccess(user: User): string {
    return signAccessToken(
      { sub: user.id, displayName: user.displayName },
      this.config.jwtAccessSecret,
      this.config.accessTokenTtlSeconds,
    );
  }

  private async createRefreshTokenRecord(userId: string) {
    const raw = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);
    const record = await this.refreshTokens.create({
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt,
    });
    return { raw, record };
  }
}
