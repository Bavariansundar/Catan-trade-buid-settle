import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../auth/authMiddleware.js";
import { LobbyError, LobbyService } from "./lobbyService.js";

const createLobbySchema = z.object({
  isPublic: z.boolean(),
  targetVictoryPoints: z.number().int().min(10).max(14),
  enabledModuleIds: z.array(z.string()),
  turnTimerSeconds: z.number().int().positive().optional(),
});

const joinByCodeSchema = z.object({ code: z.string().min(1) });

function lobbyErrorStatus(code: LobbyError["code"]): number {
  switch (code) {
    case "LOBBY_NOT_FOUND":
      return 404;
    case "NOT_HOST":
      return 403;
    case "LOBBY_FULL":
    case "SEAT_TAKEN":
    case "SEAT_EMPTY":
    case "NOT_READY":
    case "ALREADY_STARTED":
    case "INVALID_SEAT_INDEX":
      return 409;
  }
}

export function createLobbyRouter(lobbyService: LobbyService, config: AppConfig): Router {
  const router = Router();
  const auth = requireAuth(config);

  /**
   * @openapi
   * /lobbies:
   *   post:
   *     summary: Create a new lobby (you become its host, seated at seat 0)
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Lobby created }
   */
  router.post("/", auth, async (req, res) => {
    const parsed = createLobbySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
      return;
    }
    const lobby = await lobbyService.createLobby(req.userId!, {
      ...parsed.data,
      turnTimerSeconds: parsed.data.turnTimerSeconds ?? config.defaultTurnTimerSeconds,
    });
    res.json(lobby);
  });

  /**
   * @openapi
   * /lobbies:
   *   get:
   *     summary: List public lobbies still accepting players
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: List of public waiting lobbies }
   */
  router.get("/", auth, async (_req, res) => {
    res.json(await lobbyService.listPublicLobbies());
  });

  /**
   * @openapi
   * /lobbies/{id}/join:
   *   post:
   *     summary: Join a public lobby by id — private lobbies must use /join-by-code instead
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Joined }
   *       404: { description: No such public lobby (also returned for a private lobby's id, so a leaked/guessed id doesn't confirm it exists) }
   *       409: { description: Lobby full or already started }
   */
  router.post("/:id/join", auth, async (req, res) => {
    try {
      const lobby = await lobbyService.joinById(String(req.params["id"]), req.userId!);
      res.json(lobby);
    } catch (error) {
      if (error instanceof LobbyError) {
        res.status(lobbyErrorStatus(error.code)).json({ error: error.code });
        return;
      }
      throw error;
    }
  });

  /**
   * @openapi
   * /lobbies/join-by-code:
   *   post:
   *     summary: Join a private lobby by its invite code
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [code]
   *             properties:
   *               code: { type: string }
   *     responses:
   *       200: { description: Joined }
   *       404: { description: No lobby with that code }
   */
  router.post("/join-by-code", auth, async (req, res) => {
    const parsed = joinByCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
      return;
    }
    try {
      const lobby = await lobbyService.joinByCode(parsed.data.code, req.userId!);
      res.json(lobby);
    } catch (error) {
      if (error instanceof LobbyError) {
        res.status(lobbyErrorStatus(error.code)).json({ error: error.code });
        return;
      }
      throw error;
    }
  });

  return router;
}
