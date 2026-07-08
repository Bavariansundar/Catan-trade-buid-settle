import { hexesWithinRadius, type Hex } from "../coordinates.js";
import { createRng, shuffle, type Rng } from "../rng.js";
import type { Board, Harbor, HarborType, HexTile, TerrainType } from "../types.js";
import { boundaryEdgesByAngle } from "./boundary.js";
import { hasAdjacentRedNumbers } from "./validate.js";

/** Radius (in the sense of {@link hexesWithinRadius}) of the base 19-hex board. */
export const BASE_BOARD_RADIUS = 2;
export const BASE_BOARD_CENTER: Hex = { q: 0, r: 0 };

const TERRAIN_BAG: readonly TerrainType[] = [
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

const NUMBER_TOKEN_BAG: readonly number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** Fixed harbor layout (physical board frame — not shuffled, matching the real game). */
const HARBOR_TYPE_SEQUENCE: readonly HarborType[] = [
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

export interface GenerateBoardOptions {
  readonly seed: number | string;
}

function buildHarbors(hexes: readonly Hex[]): Harbor[] {
  const boundary = boundaryEdgesByAngle(hexes);
  const count = HARBOR_TYPE_SEQUENCE.length;
  const harbors: Harbor[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i * boundary.length) / count) % boundary.length;
    const edge = boundary[index];
    if (!edge) continue;
    harbors.push({ edge, type: HARBOR_TYPE_SEQUENCE[i]! });
  }
  return harbors;
}

function buildCandidateTiles(hexes: readonly Hex[], rng: Rng): HexTile[] {
  const terrains = shuffle(TERRAIN_BAG, rng);
  const numbers = shuffle(NUMBER_TOKEN_BAG, rng);
  let numberIndex = 0;

  return hexes.map((hex, i) => {
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
 * Generates the base 19-hex board: shuffled terrain + number tokens (desert
 * numberless), regenerating on adjacent red numbers (6/8), with the fixed
 * 9-harbor frame layout.
 */
export function generateBoard(options: GenerateBoardOptions): Board {
  const rng = createRng(options.seed);
  const hexes = hexesWithinRadius(BASE_BOARD_CENTER, BASE_BOARD_RADIUS);

  let tiles: HexTile[] = [];
  let attempts = 0;
  do {
    if (attempts >= MAX_GENERATION_ATTEMPTS) {
      throw new Error(
        `Failed to generate a valid board (no adjacent red numbers) after ${String(MAX_GENERATION_ATTEMPTS)} attempts`,
      );
    }
    tiles = buildCandidateTiles(hexes, rng);
    attempts++;
  } while (hasAdjacentRedNumbers(tiles));

  return {
    tiles,
    harbors: buildHarbors(hexes),
  };
}
