import { useMemo } from "react";
import type { Edge, GameView, Hex, TerrainType, Vertex } from "@baychearsbar/engine";
import { hexEquals } from "@baychearsbar/engine";
import { allEdgesOnBoard, allVerticesOnBoard } from "./boardVertices.js";
import {
  edgeEndpoints,
  edgeMidpoint,
  hexPolygonPoints,
  hexToPixel,
  vertexToPixel,
  HEX_SIZE,
} from "./projection.js";
import { usePanZoom } from "./usePanZoom.js";

/** Wraps a click handler so the tap that ends a pan gesture is ignored. */
function guarded<T>(
  wasDrag: () => boolean,
  fn: ((arg: T) => void) | undefined,
): ((arg: T) => void) | undefined {
  if (!fn) return undefined;
  return (arg: T) => {
    if (!wasDrag()) fn(arg);
  };
}

const TERRAIN_COLOR: Record<TerrainType, string> = {
  wood: "var(--hh-resource-wood)",
  brick: "var(--hh-resource-brick)",
  sheep: "var(--hh-resource-sheep)",
  wheat: "var(--hh-resource-wheat)",
  ore: "var(--hh-resource-ore)",
  desert: "var(--hh-resource-desert)",
};

const TERRAIN_LABEL: Record<TerrainType, string> = {
  wood: "Wood",
  brick: "Brick",
  sheep: "Sheep",
  wheat: "Wheat",
  ore: "Ore",
  desert: "Desert",
};

/** Dot count under a number token — matches the physical game's probability pips (6/8 get the most dots). */
const NUMBER_PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

/** Deterministic per-hex PRNG (mulberry32) — same board always decorates identically, no re-render flicker. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexSeed(hex: Hex): number {
  return ((hex.q * 374761393) ^ (hex.r * 668265263)) >>> 0;
}

/** Scattered decorative glyphs per terrain — gives each tile texture/character instead of a flat color fill. */
function TerrainDecorations({ hex, terrain }: { hex: Hex; terrain: TerrainType }) {
  const center = hexToPixel(hex);
  const rng = seededRng(hexSeed(hex));
  const spots = Array.from({ length: terrain === "desert" ? 5 : 6 }, () => {
    const angle = rng() * Math.PI * 2;
    const radius = (0.32 + rng() * 0.38) * HEX_SIZE;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });

  switch (terrain) {
    case "wood":
      return (
        <g opacity={0.85}>
          {spots.map((p, i) => (
            <g key={i} transform={`translate(${p.x}, ${p.y}) scale(${0.7 + rng() * 0.4})`}>
              <polygon points="0,-9 6,4 -6,4" fill="#254a26" />
              <polygon points="0,-4 5,6 -5,6" fill="#2e5c2e" />
              <rect x={-1.3} y={6} width={2.6} height={4} fill="#4a3520" />
            </g>
          ))}
        </g>
      );
    case "ore":
      return (
        <g opacity={0.9}>
          {spots.slice(0, 4).map((p, i) => (
            <g key={i} transform={`translate(${p.x}, ${p.y}) scale(${0.8 + rng() * 0.5})`}>
              <polygon points="-9,5 -2,-8 6,-2 9,5" fill="#5c574d" />
              <polygon points="-2,-8 6,-2 2,3 -4,1" fill="#8a8477" />
            </g>
          ))}
        </g>
      );
    case "wheat":
      return (
        <g opacity={0.8}>
          {spots.map((p, i) => (
            <g key={i} transform={`translate(${p.x}, ${p.y}) rotate(${-10 + rng() * 20})`}>
              <line x1={0} y1={8} x2={0} y2={-8} stroke="#a3791f" strokeWidth={1.4} />
              <ellipse cx={0} cy={-8} rx={2.4} ry={4} fill="#e9c455" />
            </g>
          ))}
        </g>
      );
    case "sheep":
      return (
        <g opacity={0.9}>
          {spots.map((p, i) => (
            <g key={i} transform={`translate(${p.x}, ${p.y}) scale(${0.75 + rng() * 0.35})`}>
              <ellipse cx={0} cy={0} rx={6} ry={4.5} fill="#f4f1e2" stroke="#c9c4a8" strokeWidth={0.6} />
              <circle cx={-6.5} cy={-1} r={2.2} fill="#4a4535" />
            </g>
          ))}
        </g>
      );
    case "brick":
      return (
        <g opacity={0.85}>
          {spots.slice(0, 4).map((p, i) => (
            <rect
              key={i}
              x={p.x - 7}
              y={p.y - 4}
              width={14}
              height={8}
              rx={2}
              fill="#7a3a1f"
              transform={`rotate(${rng() * 30 - 15} ${p.x} ${p.y})`}
            />
          ))}
        </g>
      );
    case "desert":
      return (
        <g opacity={0.5}>
          {spots.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.6 + rng() * 1.4} fill="#a98a4f" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

export interface HexBoardProps {
  readonly view: GameView;
  readonly playerColors: Record<string, string>;
  readonly legalVertexIds?: ReadonlySet<string>;
  readonly legalEdgeIds?: ReadonlySet<string>;
  readonly onVertexClick?: (vertex: Vertex) => void;
  readonly onEdgeClick?: (edge: Edge) => void;
  readonly onHexClick?: (hex: { q: number; r: number }) => void;
  /** When set, hexes eligible to receive the robber are highlighted (robber-move mode). */
  readonly robberSelectable?: boolean;
}

export function HexBoard({
  view,
  playerColors,
  legalVertexIds,
  legalEdgeIds,
  onVertexClick: rawOnVertexClick,
  onEdgeClick: rawOnEdgeClick,
  onHexClick: rawOnHexClick,
  robberSelectable,
}: HexBoardProps) {
  const vertices = useMemo(() => allVerticesOnBoard(view.board), [view.board]);
  const edges = useMemo(() => allEdgesOnBoard(view.board), [view.board]);
  const landHexIds = useMemo(
    () => new Set(view.board.tiles.map((t) => `${t.hex.q},${t.hex.r}`)),
    [view.board.tiles],
  );

  const bounds = useMemo(() => {
    const points = view.board.tiles.map((t) => hexToPixel(t.hex));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const pad = HEX_SIZE * 1.9;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [view.board.tiles]);

  const { svgRef, viewBox, onPointerDown, reset, wasDrag } = usePanZoom(bounds);

  // Fatter invisible hit areas around the small legal-move markers on touch
  // devices (finger-sized targets); mouse users keep tighter, more precise ones.
  const coarsePointer = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches,
    [],
  );
  const vertexHitR = HEX_SIZE * (coarsePointer ? 0.34 : 0.2);
  const edgeHitW = HEX_SIZE * (coarsePointer ? 0.5 : 0.3);

  // Suppress the click that ends a pan gesture so dragging across a legal
  // vertex/edge/hex never accidentally builds or moves the robber.
  const onVertexClick = guarded(wasDrag, rawOnVertexClick);
  const onEdgeClick = guarded(wasDrag, rawOnEdgeClick);
  const onHexClick = guarded(wasDrag, rawOnHexClick);

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      role="img"
      aria-label="Game board"
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <defs>
        <radialGradient id="hh-table-water" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#6cc3ea" />
          <stop offset="55%" stopColor="#2f83ab" />
          <stop offset="100%" stopColor="#123449" />
        </radialGradient>
        <radialGradient id="hh-tile-light" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.14} />
          <stop offset="60%" stopColor="#ffffff" stopOpacity={0} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.14} />
        </radialGradient>
        <filter id="hh-island-shadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#000000" floodOpacity={0.45} />
        </filter>
        <filter id="hh-piece-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" floodColor="#000000" floodOpacity={0.5} />
        </filter>
      </defs>

      <rect
        x={bounds.minX}
        y={bounds.minY}
        width={bounds.width}
        height={bounds.height}
        fill="url(#hh-table-water)"
      />

      <g filter="url(#hh-island-shadow)">
        {view.board.tiles.map((tile) => {
          const isRobber = hexEquals(tile.hex, view.robber);
          const center = hexToPixel(tile.hex);
          const selectable = robberSelectable && !isRobber;
          const pips = tile.number !== null ? (NUMBER_PIPS[tile.number] ?? 0) : 0;
          const isHot = tile.number === 6 || tile.number === 8;
          return (
            <g
              key={`hex-${tile.hex.q},${tile.hex.r}`}
              onClick={selectable ? () => onHexClick?.(tile.hex) : undefined}
              style={
                selectable
                  ? { cursor: "pointer", transition: "opacity 0.15s var(--hh-ease)" }
                  : undefined
              }
            >
              <polygon
                points={hexPolygonPoints(tile.hex)}
                fill={TERRAIN_COLOR[tile.terrain]}
                stroke="#c9b183"
                strokeWidth={2.5}
                strokeLinejoin="round"
                opacity={selectable ? 0.85 : 1}
              />
              <g clipPath={`url(#hh-clip-${tile.hex.q}-${tile.hex.r})`}>
                <TerrainDecorations hex={tile.hex} terrain={tile.terrain} />
              </g>
              <clipPath id={`hh-clip-${tile.hex.q}-${tile.hex.r}`}>
                <polygon points={hexPolygonPoints(tile.hex)} />
              </clipPath>
              <polygon
                points={hexPolygonPoints(tile.hex)}
                fill="url(#hh-tile-light)"
                stroke="none"
                pointerEvents="none"
              />
              {selectable && (
                <polygon
                  points={hexPolygonPoints(tile.hex)}
                  fill="none"
                  stroke="var(--hh-accent)"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                />
              )}
              {tile.number !== null && (
                <g filter="url(#hh-piece-shadow)">
                  <circle
                    cx={center.x}
                    cy={center.y}
                    r={HEX_SIZE * 0.33}
                    fill="#f2e7cc"
                    stroke={isHot ? "#8a2c22" : "#8a7250"}
                    strokeWidth={1.5}
                  />
                  <text
                    x={center.x}
                    y={center.y - HEX_SIZE * 0.03}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="var(--hh-font-display)"
                    fontSize={HEX_SIZE * 0.32}
                    fontWeight={700}
                    fill={isHot ? "#8a2c22" : "#2a2015"}
                  >
                    {tile.number}
                  </text>
                  <g>
                    {Array.from({ length: pips }, (_, i) => {
                      const spread = (pips - 1) * (HEX_SIZE * 0.055);
                      const x = center.x - spread / 2 + i * HEX_SIZE * 0.055;
                      return (
                        <circle
                          key={i}
                          cx={x}
                          cy={center.y + HEX_SIZE * 0.19}
                          r={HEX_SIZE * 0.022}
                          fill={isHot ? "#8a2c22" : "#4a3e2a"}
                        />
                      );
                    })}
                  </g>
                </g>
              )}
              {tile.terrain === "desert" && (
                <text
                  x={center.x}
                  y={center.y + HEX_SIZE * 0.58}
                  textAnchor="middle"
                  fontFamily="var(--hh-font-display)"
                  fontSize={HEX_SIZE * 0.19}
                  fill="#4a3a20"
                  opacity={0.8}
                >
                  {TERRAIN_LABEL.desert}
                </text>
              )}
              {isRobber && (
                <g transform={`translate(${center.x}, ${center.y})`} filter="url(#hh-piece-shadow)">
                  <ellipse
                    cx={0}
                    cy={HEX_SIZE * 0.24}
                    rx={HEX_SIZE * 0.2}
                    ry={HEX_SIZE * 0.07}
                    fill="#000"
                    opacity={0.35}
                  />
                  <rect
                    x={-HEX_SIZE * 0.12}
                    y={-HEX_SIZE * 0.28}
                    width={HEX_SIZE * 0.24}
                    height={HEX_SIZE * 0.5}
                    rx={HEX_SIZE * 0.1}
                    fill="#241c14"
                    stroke="#3d3020"
                    strokeWidth={1}
                  />
                  <circle
                    cx={0}
                    cy={-HEX_SIZE * 0.3}
                    r={HEX_SIZE * 0.14}
                    fill="#241c14"
                    stroke="#3d3020"
                    strokeWidth={1}
                  />
                </g>
              )}
            </g>
          );
        })}
      </g>

      {view.board.harbors.map((harbor) => {
        const [hexA, hexB] = harbor.edge.hexes;
        const landHex = landHexIds.has(`${hexA.q},${hexA.r}`) ? hexA : hexB;
        const coast = edgeMidpoint(harbor.edge);
        const landCenter = hexToPixel(landHex);
        const dx = coast.x - landCenter.x;
        const dy = coast.y - landCenter.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const badge = { x: coast.x + ux * HEX_SIZE * 0.55, y: coast.y + uy * HEX_SIZE * 0.55 };
        return (
          <g key={`harbor-${harbor.edge.id}`}>
            <line
              x1={coast.x}
              y1={coast.y}
              x2={badge.x}
              y2={badge.y}
              stroke="#8a7250"
              strokeWidth={1.5}
              strokeDasharray="1 3"
              strokeLinecap="round"
            />
            <g filter="url(#hh-piece-shadow)">
              <circle
                cx={badge.x}
                cy={badge.y}
                r={HEX_SIZE * 0.2}
                fill="var(--hh-bg-panel-hi)"
                stroke="var(--hh-accent-dim)"
                strokeWidth={1.5}
              />
              <text
                x={badge.x}
                y={badge.y - HEX_SIZE * 0.04}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={HEX_SIZE * 0.13}
                fontWeight={700}
                fill="var(--hh-accent-hi)"
              >
                {harbor.type === "generic" ? "3:1" : "2:1"}
              </text>
              {harbor.type !== "generic" && (
                <text
                  x={badge.x}
                  y={badge.y + HEX_SIZE * 0.13}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={HEX_SIZE * 0.08}
                  fill="var(--hh-text-dim)"
                >
                  {harbor.type}
                </text>
              )}
            </g>
          </g>
        );
      })}

      {edges.map((edge) => {
        const roadOwner = view.roads.get(edge.id);
        const isLegal = legalEdgeIds?.has(edge.id) ?? false;
        const [a, b] = edgeEndpoints(edge);
        return (
          <g key={`edge-${edge.id}`}>
            {roadOwner && (
              <>
                {/* Dark halo underneath — keeps every player color (including blue) readable against
                    the water backdrop or similarly-toned terrain, regardless of where the road sits. */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#140d06"
                  strokeWidth={HEX_SIZE * 0.18 + 3.5}
                  strokeLinecap="round"
                  opacity={0.65}
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={playerColors[roadOwner]}
                  strokeWidth={HEX_SIZE * 0.18}
                  strokeLinecap="round"
                  filter="url(#hh-piece-shadow)"
                />
              </>
            )}
            {isLegal && !roadOwner && (
              <g onClick={() => onEdgeClick?.(edge)} style={{ cursor: "pointer" }}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--hh-accent)"
                  strokeWidth={HEX_SIZE * 0.1}
                  strokeLinecap="round"
                  opacity={0.55}
                  style={{ transition: "opacity 0.15s var(--hh-ease)" }}
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={edgeHitW}
                  strokeLinecap="round"
                />
              </g>
            )}
            {!roadOwner && !isLegal && (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={HEX_SIZE * 0.22}
              />
            )}
          </g>
        );
      })}

      {vertices.map((vertex) => {
        const building = view.buildings.get(vertex.id);
        const isLegal = legalVertexIds?.has(vertex.id) ?? false;
        const p = vertexToPixel(vertex);
        if (building) {
          const color = playerColors[building.playerId] ?? "#fff";
          // A settlement can be a legal city-upgrade target while still occupied —
          // give it a click handler and highlight ring, or "Build City" mode has
          // nothing on the board to click.
          const groupProps = isLegal
            ? { onClick: () => onVertexClick?.(vertex), style: { cursor: "pointer" } }
            : {};
          return building.type === "city" ? (
            <g
              key={`v-${vertex.id}`}
              {...groupProps}
              className="hh-board-piece"
              filter="url(#hh-piece-shadow)"
            >
              <rect
                x={p.x - HEX_SIZE * 0.22}
                y={p.y - HEX_SIZE * 0.18}
                width={HEX_SIZE * 0.44}
                height={HEX_SIZE * 0.36}
                fill={color}
                stroke="#000"
                strokeOpacity={0.35}
                rx={3}
              />
              <polygon
                points={`${p.x - HEX_SIZE * 0.22},${p.y - HEX_SIZE * 0.18} ${p.x},${p.y - HEX_SIZE * 0.38} ${p.x + HEX_SIZE * 0.22},${p.y - HEX_SIZE * 0.18}`}
                fill={color}
                stroke="#000"
                strokeOpacity={0.35}
              />
            </g>
          ) : (
            <g
              key={`v-${vertex.id}`}
              {...groupProps}
              className="hh-board-piece"
              filter="url(#hh-piece-shadow)"
            >
              {isLegal && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={HEX_SIZE * 0.24}
                  fill="var(--hh-accent)"
                  opacity={0.4}
                />
              )}
              <polygon
                points={`${p.x},${p.y - HEX_SIZE * 0.26} ${p.x + HEX_SIZE * 0.18},${p.y - HEX_SIZE * 0.08} ${p.x + HEX_SIZE * 0.18},${p.y + HEX_SIZE * 0.16} ${p.x - HEX_SIZE * 0.18},${p.y + HEX_SIZE * 0.16} ${p.x - HEX_SIZE * 0.18},${p.y - HEX_SIZE * 0.08}`}
                fill={color}
                stroke="#000"
                strokeOpacity={0.35}
              />
            </g>
          );
        }
        return isLegal ? (
          <g
            key={`v-${vertex.id}`}
            className="hh-board-piece"
            onClick={() => onVertexClick?.(vertex)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={HEX_SIZE * 0.13}
              fill="var(--hh-accent)"
              opacity={0.7}
              style={{ transition: "opacity 0.15s var(--hh-ease)" }}
            />
            <circle cx={p.x} cy={p.y} r={vertexHitR} fill="transparent" />
          </g>
        ) : null;
      })}
    </svg>
  );
}
