import { hexesWithinRadius, type Hex } from "../coordinates.js";
import { createRng, shuffle, type Rng } from "../rng.js";
import type { Board, Harbor, HarborType, HexTile, TerrainType } from "../types.js";
import { boundaryEdgesByAngle } from "./boundary.js";
import { hasAdjacentRedNumbers } from "./validate.js";

/** Radius (in the sense of {@link hexesWithinRadius}) of the base 19-hex board. */
export const BASE_BOARD_RADIUS = 2;
export const BASE_BOARD_CENTER: Hex = { q: 0, r: 0 };

export const BASE_TERRAIN_BAG: readonly TerrainType[] = [
  "wood",
  "wood",
  "wood",
  "wood",
  "wheat",
  "wheat",
  "wheat",
  "wheat",
  "sheep",
  "sheep",
  "sheep",
  "sheep",
  "brick",
  "brick",
  "brick",
  "ore",
  "ore",
  "ore",
  "desert",
];

export const BASE_NUMBER_TOKEN_BAG: readonly number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** Fixed harbor layout (physical board frame — not shuffled, matching the real game). */
export const BASE_HARBOR_TYPE_SEQUENCE: readonly HarborType[] = [
  "generic",
  "ore",
  "generic",
  "wheat",
  "brick",
  "generic",
  "sheep",
  "generic",
  "wood",
];

const MAX_GENERATION_ATTEMPTS = 1000;

/**
 * Everything the generic shuffle-and-place algorithm needs: which hexes are
 * on the board, what terrain/number bags to shuffle onto them, and how many
 * harbors (of which types) to place around the coast. A module contributes
 * to this (see docs/architecture/modules.md) rather than the generator
 * itself knowing anything about board size.
 */
export interface BoardSpec {
  readonly hexes: readonly Hex[];
  /** Length must equal `hexes.length`. */
  readonly terrainBag: readonly TerrainType[];
  /** Length must equal the number of non-desert entries in `terrainBag`. */
  readonly numberBag: readonly number[];
  readonly harborTypes: readonly HarborType[];
}

export const BASE_BOARD_SPEC: BoardSpec = {
  hexes: hexesWithinRadius(BASE_BOARD_CENTER, BASE_BOARD_RADIUS),
  terrainBag: BASE_TERRAIN_BAG,
  numberBag: BASE_NUMBER_TOKEN_BAG,
  harborTypes: BASE_HARBOR_TYPE_SEQUENCE,
};

export interface GenerateBoardOptions {
  readonly seed: number | string;
}

function buildHarbors(hexes: readonly Hex[], harborTypes: readonly HarborType[]): Harbor[] {
  const boundary = boundaryEdgesByAngle(hexes);
  const count = harborTypes.length;
  const harbors: Harbor[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i * boundary.length) / count) % boundary.length;
    const edge = boundary[index];
    if (!edge) continue;
    harbors.push({ edge, type: harborTypes[i]! });
  }
  return harbors;
}

function buildCandidateTiles(spec: BoardSpec, rng: Rng): HexTile[] {
  const terrains = shuffle(spec.terrainBag, rng);
  const numbers = shuffle(spec.numberBag, rng);
  let numberIndex = 0;

  return spec.hexes.map((hex, i) => {
    const terrain = terrains[i]!;
    if (terrain === "desert") {
      return { hex, terrain, number: null };
    }
    const number = numbers[numberIndex]!;
    numberIndex++;
    return { hex, terrain, number };
  });
}

/**
 * Generates a board from `spec`: shuffled terrain + number tokens (desert
 * numberless), regenerating on adjacent red numbers (6/8), with the fixed
 * harbor frame layout `spec.harborTypes` describes. `BASE_BOARD_SPEC` is the
 * 19-hex base board; modules extend the spec (see
 * docs/architecture/modules.md) rather than this function knowing about
 * board size.
 */
export function generateBoard(spec: BoardSpec, options: GenerateBoardOptions): Board {
  const rng = createRng(options.seed);

  let tiles: HexTile[] = [];
  let attempts = 0;
  do {
    if (attempts >= MAX_GENERATION_ATTEMPTS) {
      throw new Error(
        `Failed to generate a valid board (no adjacent red numbers) after ${String(MAX_GENERATION_ATTEMPTS)} attempts`,
      );
    }
    tiles = buildCandidateTiles(spec, rng);
    attempts++;
  } while (hasAdjacentRedNumbers(tiles));

  return {
    tiles,
    harbors: buildHarbors(spec.hexes, spec.harborTypes),
  };
}
