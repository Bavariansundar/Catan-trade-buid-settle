import { hexEquals, verticesOfHex } from "../coordinates.js";
import type { PlayerId, TerrainType } from "../types.js";
import { COMMODITY_TYPES, RESOURCE_TYPES, emptyCommodityHand, emptyHand } from "./resources.js";
import type { CommodityHand, CommodityType, GameState, ResourceHand } from "./types.js";

/** Cities & Knights-style only — see docs/rules/cities-knights-style.md §1. */
export const COMMODITY_FOR_TERRAIN: Partial<Record<TerrainType, CommodityType>> = {
  sheep: "cloth",
  ore: "coin",
  wood: "paper",
};

function allocate<K extends string>(
  demand: ReadonlyMap<PlayerId, Record<K, number>>,
  bank: Record<K, number>,
  types: readonly K[],
): Map<PlayerId, Partial<Record<K, number>>> {
  const production = new Map<PlayerId, Partial<Record<K, number>>>();
  for (const type of types) {
    const entitled = [...demand.entries()].filter(([, hand]) => hand[type] > 0);
    if (entitled.length === 0) continue;

    const totalDemand = entitled.reduce((sum, [, hand]) => sum + hand[type], 0);
    const bankAvailable = bank[type];

    if (totalDemand <= bankAvailable) {
      for (const [playerId, hand] of entitled) {
        const existing = production.get(playerId) ?? {};
        production.set(playerId, { ...existing, [type]: hand[type] });
      }
    } else if (entitled.length === 1) {
      const [onlyPlayerId] = entitled[0]!;
      const existing = production.get(onlyPlayerId) ?? {};
      production.set(onlyPlayerId, { ...existing, [type]: bankAvailable });
    }
    // else: bank shortage affecting multiple players — nobody gets this type this roll.
  }
  return production;
}

/**
 * Cities & Knights-style production: a city on a sheep/ore/wood hex produces
 * 1 resource + 1 commodity (instead of 2 resource) when that hex rolls.
 * Cities on brick/wheat hexes, and every settlement, are unaffected — see
 * docs/rules/cities-knights-style.md §1.
 */
export function computeProductionWithCommodities(
  state: GameState,
  roll: number,
): {
  resources: Map<PlayerId, Partial<ResourceHand>>;
  commodities: Map<PlayerId, Partial<CommodityHand>>;
} {
  const resourceDemand = new Map<PlayerId, ResourceHand>();
  const commodityDemand = new Map<PlayerId, CommodityHand>();

  for (const tile of state.board.tiles) {
    if (tile.number !== roll || tile.terrain === "desert") continue;
    if (hexEquals(tile.hex, state.robber)) continue;

    for (const vertex of verticesOfHex(tile.hex)) {
      const building = state.buildings.get(vertex.id);
      if (!building) continue;

      const commodity = COMMODITY_FOR_TERRAIN[tile.terrain];
      if (building.type === "city" && commodity) {
        const rHand = resourceDemand.get(building.playerId) ?? emptyHand();
        rHand[tile.terrain] += 1;
        resourceDemand.set(building.playerId, rHand);

        const cHand = commodityDemand.get(building.playerId) ?? emptyCommodityHand();
        cHand[commodity] += 1;
        commodityDemand.set(building.playerId, cHand);
      } else {
        const amount = building.type === "city" ? 2 : 1;
        const rHand = resourceDemand.get(building.playerId) ?? emptyHand();
        rHand[tile.terrain] += amount;
        resourceDemand.set(building.playerId, rHand);
      }
    }
  }

  return {
    resources: allocate(resourceDemand, state.bank, RESOURCE_TYPES),
    commodities: allocate(commodityDemand, state.commodityBank, COMMODITY_TYPES),
  };
}
