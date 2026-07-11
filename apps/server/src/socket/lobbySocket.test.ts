import type { LobbyRecord, LobbySeatRecord } from "../domain/types.js";
import { canWatch } from "./lobbySocket.js";

function seat(userId: string | null, seatIndex = 0): LobbySeatRecord {
  return {
    id: `seat-${String(seatIndex)}`,
    lobbyId: "lobby-1",
    seatIndex,
    userId,
    botDifficulty: null,
    isReady: false,
  };
}

function lobby(overrides: Partial<LobbyRecord>): LobbyRecord {
  return {
    id: "lobby-1",
    code: null,
    isPublic: true,
    hostUserId: "host-1",
    status: "WAITING",
    targetVictoryPoints: 10,
    enabledModuleIds: [],
    turnTimerSeconds: 120,
    createdAt: new Date(),
    seats: [seat("host-1")],
    ...overrides,
  };
}

describe("canWatch", () => {
  it("lets anyone watch a public lobby, seated or not", () => {
    expect(canWatch(lobby({ isPublic: true }), "a-stranger")).toBe(true);
  });

  it("lets a seated player watch a private lobby", () => {
    const l = lobby({ isPublic: false, seats: [seat("host-1"), seat("player-2", 1)] });
    expect(canWatch(l, "player-2")).toBe(true);
  });

  it("blocks a non-seated stranger from watching a private lobby, even knowing its id", () => {
    const l = lobby({ isPublic: false, seats: [seat("host-1")] });
    expect(canWatch(l, "a-stranger")).toBe(false);
  });
});
