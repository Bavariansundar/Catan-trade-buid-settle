import { useMemo } from "react";
import type { Edge, GameView, TerrainType, Vertex } from "@hexhaven/engine";
import { hexEquals } from "@hexhaven/engine";
import { allEdgesOnBoard, allVerticesOnBoard } from "./boardVertices.js";
import {
  edgeEndpoints,
  hexPolygonPoints,
  hexToPixel,
  vertexToPixel,
  HEX_SIZE,
} from "./projection.js";

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
  onVertexClick,
  onEdgeClick,
  onHexClick,
  robberSelectable,
}: HexBoardProps) {
  const vertices = useMemo(() => allVerticesOnBoard(view.board), [view.board]);
  const edges = useMemo(() => allEdgesOnBoard(view.board), [view.board]);

  const bounds = useMemo(() => {
    const points = view.board.tiles.map((t) => hexToPixel(t.hex));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const pad = HEX_SIZE * 1.6;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [view.board.tiles]);

  return (
    <svg
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      role="img"
      aria-label="Game board"
      style={{ width: "100%", height: "100%", touchAction: "manipulation" }}
    >
      <rect
        x={bounds.minX}
        y={bounds.minY}
        width={bounds.width}
        height={bounds.height}
        fill="var(--hh-resource-sea)"
      />

      {view.board.tiles.map((tile) => {
        const isRobber = hexEquals(tile.hex, view.robber);
        const center = hexToPixel(tile.hex);
        const selectable = robberSelectable && !isRobber;
        return (
          <g
            key={`hex-${tile.hex.q},${tile.hex.r}`}
            onClick={selectable ? () => onHexClick?.(tile.hex) : undefined}
            style={selectable ? { cursor: "pointer" } : undefined}
          >
            <polygon
              points={hexPolygonPoints(tile.hex)}
              fill={TERRAIN_COLOR[tile.terrain]}
              stroke="var(--hh-bg)"
              strokeWidth={2}
              opacity={selectable ? 0.85 : 1}
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
              <g>
                <circle cx={center.x} cy={center.y} r={HEX_SIZE * 0.32} fill="#f4ecd8" />
                <text
                  x={center.x}
                  y={center.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={HEX_SIZE * 0.34}
                  fontWeight={700}
                  fill={tile.number === 6 || tile.number === 8 ? "#c0392b" : "#2a2a2a"}
                >
                  {tile.number}
                </text>
              </g>
            )}
            {tile.terrain === "desert" && (
              <text
                x={center.x}
                y={center.y + HEX_SIZE * 0.55}
                textAnchor="middle"
                fontSize={HEX_SIZE * 0.2}
                fill="#5a4a2a"
              >
                {TERRAIN_LABEL.desert}
              </text>
            )}
            {isRobber && (
              <g transform={`translate(${center.x}, ${center.y})`}>
                <ellipse
                  cx={0}
                  cy={HEX_SIZE * 0.22}
                  rx={HEX_SIZE * 0.22}
                  ry={HEX_SIZE * 0.08}
                  fill="#000"
                  opacity={0.3}
                />
                <rect
                  x={-HEX_SIZE * 0.12}
                  y={-HEX_SIZE * 0.28}
                  width={HEX_SIZE * 0.24}
                  height={HEX_SIZE * 0.5}
                  rx={HEX_SIZE * 0.1}
                  fill="#2b2b2b"
                />
                <circle cx={0} cy={-HEX_SIZE * 0.3} r={HEX_SIZE * 0.14} fill="#2b2b2b" />
              </g>
            )}
          </g>
        );
      })}

      {view.board.harbors.map((harbor) => {
        const mid = hexToPixel(harbor.edge.hexes[0]);
        return (
          <text
            key={`harbor-${harbor.edge.id}`}
            x={mid.x}
            y={mid.y}
            textAnchor="middle"
            fontSize={HEX_SIZE * 0.16}
            fill="var(--hh-text-dim)"
            opacity={0.85}
          >
            {harbor.type === "generic" ? "3:1" : `2:1 ${harbor.type}`}
          </text>
        );
      })}

      {edges.map((edge) => {
        const roadOwner = view.roads.get(edge.id);
        const isLegal = legalEdgeIds?.has(edge.id) ?? false;
        const [a, b] = edgeEndpoints(edge);
        return (
          <g key={`edge-${edge.id}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={roadOwner ? playerColors[roadOwner] : "transparent"}
              strokeWidth={HEX_SIZE * 0.18}
              strokeLinecap="round"
            />
            {isLegal && !roadOwner && (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--hh-accent)"
                strokeWidth={HEX_SIZE * 0.1}
                strokeLinecap="round"
                opacity={0.55}
                onClick={() => onEdgeClick?.(edge)}
                style={{ cursor: "pointer" }}
              />
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
          return building.type === "city" ? (
            <g key={`v-${vertex.id}`}>
              <rect
                x={p.x - HEX_SIZE * 0.22}
                y={p.y - HEX_SIZE * 0.18}
                width={HEX_SIZE * 0.44}
                height={HEX_SIZE * 0.36}
                fill={color}
                stroke="#000"
                strokeOpacity={0.3}
                rx={2}
              />
              <polygon
                points={`${p.x - HEX_SIZE * 0.22},${p.y - HEX_SIZE * 0.18} ${p.x},${p.y - HEX_SIZE * 0.38} ${p.x + HEX_SIZE * 0.22},${p.y - HEX_SIZE * 0.18}`}
                fill={color}
              />
            </g>
          ) : (
            <g key={`v-${vertex.id}`}>
              <polygon
                points={`${p.x},${p.y - HEX_SIZE * 0.26} ${p.x + HEX_SIZE * 0.18},${p.y - HEX_SIZE * 0.08} ${p.x + HEX_SIZE * 0.18},${p.y + HEX_SIZE * 0.16} ${p.x - HEX_SIZE * 0.18},${p.y + HEX_SIZE * 0.16} ${p.x - HEX_SIZE * 0.18},${p.y - HEX_SIZE * 0.08}`}
                fill={color}
                stroke="#000"
                strokeOpacity={0.3}
              />
            </g>
          );
        }
        return isLegal ? (
          <circle
            key={`v-${vertex.id}`}
            cx={p.x}
            cy={p.y}
            r={HEX_SIZE * 0.13}
            fill="var(--hh-accent)"
            opacity={0.7}
            onClick={() => onVertexClick?.(vertex)}
            style={{ cursor: "pointer" }}
          />
        ) : null;
      })}
    </svg>
  );
}
