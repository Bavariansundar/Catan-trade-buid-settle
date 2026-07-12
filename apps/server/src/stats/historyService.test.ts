import { RuleBasedBot, resolveActingPlayerId } from "@baychearsbar/bots";
import { applyAction, createGame, isRuleError, BASE_MODULE, type Action } from "@baychearsbar/engine";
import { InMemoryGameRepository } from "../game/gameRepository.js";
import { HistoryError, HistoryService } from "./historyService.js";

const MODULES = [BASE_MODULE];
const PLAYER_IDS = ["alice", "bob", "carol"];

/** Sensitive event fields — see packages/engine's redactEventsFor for why exactly these four. */
const SECRET_FIELDS = ["resources", "resource", "card"] as const;

/**
 * Plays a full 3-player bot game and records it into an `InMemoryGameRepository`
 * exactly as `GameRuntimeService`/`MatchRecorder` would, so `HistoryService`
 * is exercised the same way it is in production — see docs/technical-debt.md
 * item #1 (the history endpoint hidden-info leak this guards against).
 */
async function seedFinishedGame(): Promise<{ repo: InMemoryGameRepository; gameId: string }> {
  const repo = new InMemoryGameRepository();
  const game = await repo.create({
    lobbyId: "lobby-1",
    seed: "history-service-leak-test",
    configJson: {
      moduleIds: [],
      targetVictoryPoints: 10,
      seatPlayerIds: PLAYER_IDS,
      turnTimerSeconds: 120,
      botSeats: {},
    },
  });
  await repo.addParticipants(
    game.id,
    PLAYER_IDS.map((userId, seatIndex) => ({ userId, seatIndex })),
  );

  let state = createGame(MODULES, {
    playerIds: PLAYER_IDS,
    seed: game.seed,
    targetVictoryPoints: 10,
  });
  const bot = new RuleBasedBot();
  for (let i = 0; i < 3000 && state.phase.name !== "ended"; i++) {
    const playerId = resolveActingPlayerId(state);
    const action: Action = bot.chooseAction(state, playerId, MODULES);
    const result = applyAction(MODULES, state, action);
    if (isRuleError(result)) throw new Error(`Unexpected rejection: ${result.code}`);
    state = result.state;
    await repo.appendAction(game.id, playerId, action);
  }
  if (state.phase.name !== "ended") throw new Error("Game did not finish within move budget");
  await repo.markEnded(game.id, state.phase.winner);

  return { repo, gameId: game.id };
}

describe("HistoryService", () => {
  it("never returns the seed or a raw action log — only a pre-redacted replay", async () => {
    const { repo, gameId } = await seedFinishedGame();
    const historyService = new HistoryService(repo);

    const detail = await historyService.getDetail("alice", gameId);

    expect(detail.game).not.toHaveProperty("seed");
    expect(detail).not.toHaveProperty("actions");
    expect(detail.replay.length).toBeGreaterThan(1);
  });

  it("redacts every step's view so only the requesting participant's own hand is visible", async () => {
    const { repo, gameId } = await seedFinishedGame();
    const historyService = new HistoryService(repo);

    const detail = await historyService.getDetail("alice", gameId);
    let checkedAtLeastOnePlayer = false;
    for (const step of detail.replay) {
      const view = step.view as { players: { id: string; hand: unknown; devCards: unknown }[] };
      for (const player of view.players) {
        checkedAtLeastOnePlayer = true;
        if (player.id === "alice") continue;
        expect(player.hand).toBeNull();
        expect(player.devCards).toBeNull();
      }
    }
    expect(checkedAtLeastOnePlayer).toBe(true);
  });

  it("redacts sensitive event fields (discard/steal/dev-card) for non-entitled viewers, per-participant", async () => {
    const { repo, gameId } = await seedFinishedGame();
    const historyService = new HistoryService(repo);

    const detail = await historyService.getDetail("alice", gameId);
    let checkedAtLeastOneSensitiveEvent = false;
    for (const step of detail.replay) {
      const events = step.events as { type: string; playerId?: string; thiefId?: string; victimId?: string }[];
      for (const event of events) {
        if (!["DISCARDED", "RESOURCE_STOLEN", "DEV_CARD_BOUGHT", "PROGRESS_CARD_DRAWN"].includes(event.type))
          continue;
        checkedAtLeastOneSensitiveEvent = true;
        const entitled =
          event.type === "RESOURCE_STOLEN"
            ? event.thiefId === "alice" || event.victimId === "alice"
            : event.playerId === "alice";
        if (entitled) continue;
        for (const field of SECRET_FIELDS) expect(event).not.toHaveProperty(field);
      }
    }
    expect(checkedAtLeastOneSensitiveEvent).toBe(true);
  });

  it("gives two different participants two different redactions of the same game", async () => {
    const { repo, gameId } = await seedFinishedGame();
    const historyService = new HistoryService(repo);

    const [aliceDetail, bobDetail] = await Promise.all([
      historyService.getDetail("alice", gameId),
      historyService.getDetail("bob", gameId),
    ]);

    const lastAliceView = aliceDetail.replay.at(-1)!.view as {
      players: { id: string; hand: unknown }[];
    };
    const lastBobView = bobDetail.replay.at(-1)!.view as { players: { id: string; hand: unknown }[] };

    const aliceOwnHand = lastAliceView.players.find((p) => p.id === "alice")!.hand;
    const bobHandAsSeenByAlice = lastAliceView.players.find((p) => p.id === "bob")!.hand;
    const bobOwnHand = lastBobView.players.find((p) => p.id === "bob")!.hand;

    expect(aliceOwnHand).not.toBeNull();
    expect(bobHandAsSeenByAlice).toBeNull();
    expect(bobOwnHand).not.toBeNull();
  });

  it("rejects a non-participant with NOT_A_PARTICIPANT", async () => {
    const { repo, gameId } = await seedFinishedGame();
    const historyService = new HistoryService(repo);

    await expect(historyService.getDetail("mallory", gameId)).rejects.toMatchObject(
      new HistoryError("NOT_A_PARTICIPANT"),
    );
  });

  it("rejects an unknown game id with GAME_NOT_FOUND", async () => {
    const repo = new InMemoryGameRepository();
    const historyService = new HistoryService(repo);

    await expect(historyService.getDetail("alice", "no-such-game")).rejects.toMatchObject(
      new HistoryError("GAME_NOT_FOUND"),
    );
  });

  it("listForUser also strips the seed from every item", async () => {
    const { repo, gameId } = await seedFinishedGame();
    const historyService = new HistoryService(repo);

    const page = await historyService.listForUser("alice", { limit: 20 });
    expect(page.items.some((g) => g.id === gameId)).toBe(true);
    for (const item of page.items) expect(item).not.toHaveProperty("seed");
  });
});
