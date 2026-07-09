/** Central place for env-derived config — see docs/architecture/server.md for the numeric defaults. */
export interface AppConfig {
  readonly port: number;
  readonly jwtAccessSecret: string;
  readonly jwtRefreshSecret: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly bcryptCostFactor: number;
  readonly authRateLimit: { readonly windowMs: number; readonly max: number };
  readonly refreshRateLimit: { readonly windowMs: number; readonly max: number };
  readonly defaultTurnTimerSeconds: number;
  readonly disconnectGraceSeconds: number;
  readonly redisUrl: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3001),
    jwtAccessSecret: env.JWT_ACCESS_SECRET ?? requireEnv("JWT_ACCESS_SECRET"),
    jwtRefreshSecret: env.JWT_REFRESH_SECRET ?? requireEnv("JWT_REFRESH_SECRET"),
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
    bcryptCostFactor: 12,
    authRateLimit: { windowMs: 15 * 60 * 1000, max: 10 },
    refreshRateLimit: { windowMs: 15 * 60 * 1000, max: 20 },
    defaultTurnTimerSeconds: 120,
    disconnectGraceSeconds: 30,
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
  };
}
