import { Router } from "express";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../auth/authMiddleware.js";
import type { ProfileService } from "./profileService.js";

export function createProfileRouter(profileService: ProfileService, config: AppConfig): Router {
  const router = Router();
  const auth = requireAuth(config);

  /**
   * @openapi
   * /profile:
   *   get:
   *     summary: The authenticated user's career stats, ratings, and unlocked achievements
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Profile summary }
   */
  router.get("/", auth, async (req, res) => {
    const summary = await profileService.getProfile(req.userId!);
    res.json(summary);
  });

  return router;
}
