import {
  BUILD_COSTS,
  RESOURCE_TYPES,
  canAfford,
  edgesOfVertex,
  hexEquals,
  neighborVertices,
  verticesOfEdge,
  verticesOfHex,
  type GameView,
  type PlayerId,
  type ResourceType,
} from "@hexhaven/engine";
import { allEdgesOnBoard, allVerticesOnBoard } from "../board/boardVertices.js";
import type { LegalActionsSummary } from "../worker/protocol.js";

/**
 * Approximates the *same* candidate lists `packages/bots`' `legalActions.ts`
 * computes from a full `GameState` — but derived purely from a redacted
 * `GameView` plus the viewer's own public hand, since a multiplayer client
 * never holds the full state (see docs/architecture/server.md — clients
 * never compute outcomes, only candidates for highlighting; the server is
 * still the sole authority and rejects anything illegal).
 */
export function approxLegalActions(view: GameView, viewerId: PlayerId): LegalActionsSummary {
  const me = view.players.find((p) => p.id === viewerId);
  const isMyTurn = view.players[view.currentPlayerIndex]?.id === viewerId;
  const hand = me?.hand;
  const inSetup = view.phase.name === "setup";
  const inMain = view.phase.name === "main" || view.phase.name === "specialBuild";

  const vertices = allVerticesOnBoard(view.board);
  const edges = allEdgesOnBoard(view.board);

  const hasNoAdjacentBuilding = (vertexId: string): boolean => {
    if (view.buildings.has(vertexId)) return false;
    const vertex = vertices.find((v) => v.id === vertexId)!;
    return neighborVertices(vertex).every((n) => !view.buildings.has(n.id));
  };

  const touchesOwnRoad = (vertexId: string): boolean => {
    const vertex = vertices.find((v) => v.id === vertexId)!;
    return edgesOfVertex(vertex).some((e) => view.roads.get(e.id) === viewerId);
  };

  const settlementVertexIds: string[] = [];
  const cityVertexIds: string[] = [];
  if (me && (me.pieces.settlements > 0 || me.pieces.cities > 0)) {
    for (const vertex of vertices) {
      const building = view.buildings.get(vertex.id);
      if (!building) {
        if (
          me.pieces.settlements > 0 &&
          hasNoAdjacentBuilding(vertex.id) &&
          (inSetup
            ? isSetupTurnFor(view, viewerId) && !view.phase.awaitingRoad
            : inMain &&
              isMyTurn &&
              touchesOwnRoad(vertex.id) &&
              hand &&
              canAfford(hand, BUILD_COSTS.settlement))
        ) {
          settlementVertexIds.push(vertex.id);
        }
      } else if (
        building.type === "settlement" &&
        building.playerId === viewerId &&
        me.pieces.cities > 0 &&
        inMain &&
        isMyTurn &&
        hand &&
        canAfford(hand, BUILD_COSTS.city)
      ) {
        cityVertexIds.push(vertex.id);
      }
    }
  }

  const roadEdgeIds: string[] = [];
  if (me && me.pieces.roads > 0) {
    for (const edge of edges) {
      if (view.roads.has(edge.id)) continue;
      const [a, b] = verticesOfEdge(edge);
      const touchesMine = [a, b].some(
        (v) => view.buildings.get(v.id)?.playerId === viewerId || touchesOwnRoad(v.id),
      );
      if (!touchesMine) continue;
      if (inSetup) {
        if (isSetupTurnFor(view, viewerId) && view.phase.awaitingRoad) roadEdgeIds.push(edge.id);
      } else if (inMain && isMyTurn && hand && canAfford(hand, BUILD_COSTS.road)) {
        roadEdgeIds.push(edge.id);
      }
    }
  }

  const robberCandidates: LegalActionsSummary["robberCandidates"] = [];
  if (view.phase.name === "robber" && isMyTurn) {
    for (const tile of view.board.tiles) {
      if (hexEquals(tile.hex, view.robber)) continue;
      const owners = new Set<PlayerId>();
      for (const vertex of verticesOfHex(tile.hex)) {
        const building = view.buildings.get(vertex.id);
        if (building && building.playerId !== viewerId) owners.add(building.playerId);
      }
      const eligible = [...owners].filter(
        (id) => (view.players.find((p) => p.id === id)?.handCount ?? 0) > 0,
      );
      if (eligible.length === 0) {
        robberCandidates.push({ hex: tile.hex, stealFromPlayerId: null });
      } else {
        for (const id of eligible) robberCandidates.push({ hex: tile.hex, stealFromPlayerId: id });
      }
    }
  }

  const maritimeTrades: LegalActionsSummary["maritimeTrades"] = [];
  if (inMain && isMyTurn && hand) {
    for (const give of RESOURCE_TYPES) {
      const ratio = bestRatioFor(view, viewerId, give);
      if (hand[give] < ratio) continue;
      for (const get of RESOURCE_TYPES) {
        if (get === give) continue;
        if (view.bank[get] > 0) maritimeTrades.push({ give, get });
      }
    }
  }

  const canBuyDevCard = Boolean(
    inMain && isMyTurn && hand && view.devDeckCount > 0 && canAfford(hand, BUILD_COSTS.devCard),
  );

  const playableDevCardTypes: LegalActionsSummary["playableDevCardTypes"] = [];
  if (inMain && isMyTurn && me?.devCards && !me.devCardPlayedThisTurn) {
    const seen = new Set<string>();
    for (const card of me.devCards) {
      if (card.type === "victory_point" || seen.has(card.type)) continue;
      if (card.boughtTurn < view.turnNumber) {
        seen.add(card.type);
        playableDevCardTypes.push(card.type);
      }
    }
  }

  return {
    settlementVertexIds,
    cityVertexIds,
    roadEdgeIds,
    robberCandidates,
    maritimeTrades,
    canBuyDevCard,
    playableDevCardTypes,
  };
}

function isSetupTurnFor(view: GameView, viewerId: PlayerId): boolean {
  return view.phase.name === "setup" && view.phase.order[view.phase.step] === viewerId;
}

function bestRatioFor(view: GameView, viewerId: PlayerId, resource: ResourceType): number {
  let best = 4;
  for (const harbor of view.board.harbors) {
    const [a, b] = verticesOfEdge(harbor.edge);
    const owns = [a, b].some((v) => view.buildings.get(v.id)?.playerId === viewerId);
    if (!owns) continue;
    if (harbor.type === "generic") best = Math.min(best, 3);
    if (harbor.type === resource) best = Math.min(best, 2);
  }
  return best;
}
