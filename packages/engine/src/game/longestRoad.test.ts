import { describe, expect, it } from "vitest";
import {
  edgesOfHex,
  edgesOfVertex,
  verticesOfEdge,
  vertexAt,
  type Edge,
  type Vertex,
} from "../coordinates.js";
import { computeLongestRoad, recomputeLongestRoad } from "./longestRoad.js";
import { testGameState, TEST_HEX } from "./testFixtures.js";
import type { GameState } from "./types.js";

function otherEndpoint(edge: Edge, known: Vertex): Vertex {
  const [a, b] = verticesOfEdge(edge);
  return a.id === known.id ? b : a;
}

/**
 * Walks outward `length` edges from `start` as a genuine simple path: never
 * revisits a vertex (own or in the shared `avoid` set, if given), so it can
 * never loop back on itself — or cross a sibling chain built with the same
 * `avoid` set — and always yields exactly `length` distinct edges.
 */
function chain(
  start: Vertex,
  length: number,
  avoid: Set<string> = new Set(),
): { vertices: Vertex[]; edges: Edge[] } {
  const vertices = [start];
  const edges: Edge[] = [];
  avoid.add(start.id);
  let current = start;
  for (let i = 0; i < length; i++) {
    const next = edgesOfVertex(current).find((e) => !avoid.has(otherEndpoint(e, current).id));
    if (!next)
      throw new Error(`chain() ran out of room after ${String(i)} of ${String(length)} edges`);
    edges.push(next);
    current = otherEndpoint(next, current);
    avoid.add(current.id);
    vertices.push(current);
  }
  return { vertices, edges };
}

function roadsFor(playerId: string, edges: readonly Edge[]): Map<string, string> {
  return new Map(edges.map((e) => [e.id, playerId]));
}

describe("computeLongestRoad", () => {
  it("is 0 with no roads", () => {
    const state = testGameState();
    expect(computeLongestRoad(state, "p1")).toBe(0);
  });

  it("is the chain length for a simple unbranched road", () => {
    const start = vertexAt(TEST_HEX.center, 0);
    const { edges } = chain(start, 4);
    const state = testGameState({ roads: roadsFor("p1", edges) });
    expect(computeLongestRoad(state, "p1")).toBe(4);
  });

  it("counts a full closed loop (6 roads around one hex) as length 6", () => {
    const loopEdges = edgesOfHex(TEST_HEX.center);
    const state = testGameState({ roads: roadsFor("p1", loopEdges) });
    expect(computeLongestRoad(state, "p1")).toBe(6);
  });

  it("counts a fork as its two longest arms combined, not all three", () => {
    // Three arms of length 2, 3, 4 radiating from a shared hub vertex.
    const hub = vertexAt(TEST_HEX.center, 0);
    const hubEdges = edgesOfVertex(hub);
    const sharedVisited = new Set([hub.id]);
    const arm1 = chain(otherEndpoint(hubEdges[0], hub), 1, sharedVisited); // total arm length 2 (hub edge + 1 more)
    const arm2 = chain(otherEndpoint(hubEdges[1], hub), 2, sharedVisited); // total arm length 3
    const arm3 = chain(otherEndpoint(hubEdges[2], hub), 3, sharedVisited); // total arm length 4

    const allEdges = [
      hubEdges[0],
      ...arm1.edges,
      hubEdges[1],
      ...arm2.edges,
      hubEdges[2],
      ...arm3.edges,
    ];
    // The 3 arms must not cross paths with each other for this fixture to
    // mean what it says.
    expect(new Set(allEdges.map((e) => e.id)).size).toBe(allEdges.length);
    const state = testGameState({ roads: roadsFor("p1", allEdges) });
    // Best path uses the two longest arms (4 + 3 = 7) through the shared hub.
    expect(computeLongestRoad(state, "p1")).toBe(7);
  });

  it("is broken by an opponent's settlement splitting the network", () => {
    const start = vertexAt(TEST_HEX.center, 0);
    const { vertices, edges } = chain(start, 6);
    const state = testGameState({
      roads: roadsFor("p1", edges),
      buildings: new Map([[vertices[3]!.id, { playerId: "p2", type: "settlement" as const }]]),
    });
    // The path is severed at vertices[3]; longest usable run is 3 edges on
    // either side of the block (edges 0-2, or edges 3-5).
    expect(computeLongestRoad(state, "p1")).toBe(3);
  });

  it("is not broken by the player's own settlement in the middle", () => {
    const start = vertexAt(TEST_HEX.center, 0);
    const { vertices, edges } = chain(start, 6);
    const state = testGameState({
      roads: roadsFor("p1", edges),
      buildings: new Map([[vertices[3]!.id, { playerId: "p1", type: "settlement" as const }]]),
    });
    expect(computeLongestRoad(state, "p1")).toBe(6);
  });
});

// Widely separated anchors (100 hexes apart) so different players' chains
// — each walked independently with no knowledge of the others — can never
// physically cross paths and accidentally claim the same edge.
const PLAYER_ANCHOR_OFFSET: Record<string, number> = { p1: 0, p2: 100, p3: 200 };

describe("recomputeLongestRoad — award transfer and lapse", () => {
  function stateWithLengths(lengths: Record<string, number>, holder: string | null): GameState {
    const roads = new Map<string, string>();
    for (const [playerId, length] of Object.entries(lengths)) {
      if (length === 0) continue;
      const anchor = vertexAt({ q: PLAYER_ANCHOR_OFFSET[playerId]!, r: 0 }, 0);
      const { edges } = chain(anchor, length);
      for (const [id, owner] of roadsFor(playerId, edges)) {
        if (roads.has(id) && roads.get(id) !== owner) {
          throw new Error(
            `Test fixture bug: edge ${id} claimed by both ${roads.get(id)} and ${owner}`,
          );
        }
        roads.set(id, owner);
      }
    }
    return testGameState({ roads, longestRoadPlayerId: holder });
  }

  it("awards a vacant title to the unique player reaching 5+", () => {
    const state = stateWithLengths({ p1: 5 }, null);
    expect(recomputeLongestRoad(state)).toBe("p1");
  });

  it("leaves the title vacant if nobody reaches 5", () => {
    const state = stateWithLengths({ p1: 4 }, null);
    expect(recomputeLongestRoad(state)).toBeNull();
  });

  it("leaves the title vacant on a tie for the max qualifying length", () => {
    const state = stateWithLengths({ p1: 5, p2: 5 }, null);
    expect(recomputeLongestRoad(state)).toBeNull();
  });

  it("keeps the current holder when nobody strictly exceeds them", () => {
    const state = stateWithLengths({ p1: 6, p2: 6 }, "p1");
    expect(recomputeLongestRoad(state)).toBe("p1");
  });

  it("transfers to a unique challenger who strictly exceeds the holder", () => {
    const state = stateWithLengths({ p1: 6, p2: 8 }, "p1");
    expect(recomputeLongestRoad(state)).toBe("p2");
  });

  it("does not transfer on a tie between challengers even if both exceed the holder", () => {
    const state = stateWithLengths({ p1: 6, p2: 8 }, "p1");
    const withThirdTie: GameState = { ...state };
    // Give p2 and a synthetic tie: reuse p2's exact length for a third player.
    const roads = new Map(state.roads);
    const anchor = vertexAt({ q: PLAYER_ANCHOR_OFFSET.p3!, r: 0 }, 0);
    const { edges } = chain(anchor, 8);
    for (const edge of edges) roads.set(edge.id, "p3");
    const tiedState: GameState = {
      ...withThirdTie,
      roads,
      players: [...state.players, { ...state.players[0]!, id: "p3" }],
    };
    expect(recomputeLongestRoad(tiedState)).toBe("p1");
  });

  it("lapses when the holder's road drops below 5, leaving it vacant if nobody else qualifies", () => {
    const state = stateWithLengths({ p1: 4 }, "p1");
    expect(recomputeLongestRoad(state)).toBeNull();
  });

  it("lapses from the holder directly to a unique qualifying challenger", () => {
    const state = stateWithLengths({ p1: 4, p2: 5 }, "p1");
    expect(recomputeLongestRoad(state)).toBe("p2");
  });
});
