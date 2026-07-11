import { z } from "zod";
import { MAX_SEATS } from "../lobby/lobbyService.js";

/**
 * Socket.IO payloads never pass through Express's body-parsing/validation
 * pipeline, so nothing rejects a malformed event before it reaches a handler
 * — unlike REST routes, which already validate with zod (see lobbyRoutes.ts,
 * authRoutes.ts). These schemas close that gap.
 *
 * `game:action`'s `action` is validated only at the envelope level (a plain
 * object with a non-empty string `type`) rather than re-declaring every one
 * of the engine's ~30 `Action` variants — the engine's own `applyAction`
 * already validates content deeply and safely (returning a `RuleError`, never
 * throwing, even for an unrecognized `type` — see apply.ts's `UNKNOWN_ACTION`
 * fallback). Duplicating that validation here would just be a second copy to
 * keep in sync with packages/engine's types.
 */

const gameIdSchema = z.string().min(1);
const lobbyIdSchema = z.string().min(1);

export const gameWatchSchema = z.object({
  gameId: gameIdSchema,
  // -1 is a legitimate sentinel (apps/web's MultiplayerGameScreen starts its
  // ref there), meaning "no replay, just send current state" — matches
  // gameRuntime.ts's own replayEventsSince contract (`sinceSeq < -1` is what
  // it rejects, not `< 0`). min(-1), not nonnegative().
  lastSeenSeq: z.number().int().min(-1).optional(),
});

export const gameActionSchema = z.object({
  gameId: gameIdSchema,
  action: z.looseObject({ type: z.string().min(1) }),
});

export const lobbyWatchSchema = z.object({ lobbyId: lobbyIdSchema });

export const lobbyLeaveSchema = z.object({ lobbyId: lobbyIdSchema });

export const lobbySetReadySchema = z.object({
  lobbyId: lobbyIdSchema,
  isReady: z.boolean(),
});

export const lobbyAddBotSchema = z.object({
  lobbyId: lobbyIdSchema,
  seatIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_SEATS - 1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
});

export const lobbyRemoveSeatSchema = z.object({
  lobbyId: lobbyIdSchema,
  seatIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_SEATS - 1),
});

export const lobbyUpdateSettingsSchema = z.object({
  lobbyId: lobbyIdSchema,
  targetVictoryPoints: z.number().int().min(10).max(14).optional(),
  enabledModuleIds: z.array(z.string()).optional(),
  turnTimerSeconds: z.number().int().positive().optional(),
});

export const lobbyChatSchema = z.object({
  lobbyId: lobbyIdSchema,
  message: z.string().min(1).max(500),
});

export const lobbyStartSchema = z.object({ lobbyId: lobbyIdSchema });
