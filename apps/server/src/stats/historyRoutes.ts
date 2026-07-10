import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../auth/authMiddleware.js";
import { HistoryError, type HistoryService } from "./historyService.js";

const listQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ENDED", "ABANDONED"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function historyErrorStatus(code: HistoryError["code"]): number {
  switch (code) {
    case "GAME_NOT_FOUND":
      return 404;
    case "NOT_A_PARTICIPANT":
      return 403;
  }
}

export function createHistoryRouter(historyService: HistoryService, config: AppConfig): Router {
  const router = Router();
  const auth = requireAuth(config);

  /**
   * @openapi
   * /history:
   *   get:
   *     summary: Paginated match history for the authenticated user, newest first
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - in: query
   *         name: status
   *         schema: { type: string, enum: [ACTIVE, ENDED, ABANDONED] }
   *       - in: query
   *         name: cursor
   *         schema: { type: string }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, minimum: 1, maximum: 50 }
   *     responses:
   *       200: { description: A page of games this user participated in }
   */
  router.get("/", auth, async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_QUERY", details: parsed.error.flatten() });
      return;
    }
    const page = await historyService.listForUser(req.userId!, {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      limit: parsed.data.limit ?? 20,
    });
    res.json(page);
  });

  /**
   * @openapi
   * /history/{gameId}:
   *   get:
   *     summary: Full detail for one game — stats, participants, and the raw action log for client-side replay
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Game detail }
   *       403: { description: You weren't a participant in this game }
   *       404: { description: No such game }
   */
  router.get("/:gameId", auth, async (req, res) => {
    try {
      const detail = await historyService.getDetail(req.userId!, String(req.params["gameId"]));
      res.json(detail);
    } catch (error) {
      if (error instanceof HistoryError) {
        res.status(historyErrorStatus(error.code)).json({ error: error.code });
        return;
      }
      throw error;
    }
  });

  return router;
}
