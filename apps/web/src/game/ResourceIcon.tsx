import type { ResourceType } from "@baychearsbar/engine";

/** Original line-art glyph set — a colored hex badge per resource, in the same gold/cream-on-terrain-color style as the rest of the crest work. */
const HEX_POINTS = "89.8,27 89.8,73 50,96 10.2,73 10.2,27 50,4";

const RESOURCE_FILL: Record<ResourceType, string> = {
  wood: "var(--hh-resource-wood)",
  brick: "var(--hh-resource-brick)",
  sheep: "var(--hh-resource-sheep)",
  wheat: "var(--hh-resource-wheat)",
  ore: "var(--hh-resource-ore)",
};

const LINE = "#f4ecd8";

function OreGlyph() {
  return (
    <g fill="none" stroke={LINE} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round">
      <polygon points="37,46 49,34 63,40 66,56 54,69 39,63 34,52" />
      <line x1={49} y1={34} x2={53} y2={56} />
      <line x1={37} y1={46} x2={54} y2={69} />
      <g strokeWidth={2.5}>
        <line x1={28} y1={28} x2={33} y2={33} />
        <line x1={50} y1={22} x2={50} y2={28} />
        <line x1={72} y1={28} x2={67} y2={33} />
      </g>
    </g>
  );
}

function SheepGlyph() {
  return (
    <g fill="none" stroke={LINE} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round">
      <path d="M30,55 C26,48 28,40 35,38 C36,32 44,29 50,33 C57,29 65,33 65,40 C71,41 72,50 66,54 C67,60 60,64 54,61 C50,66 40,66 36,61 C29,62 26,58 30,55 Z" />
      <path d="M63,44 C69,42 74,46 72,52 C75,56 71,61 66,59" />
      <circle cx={69} cy={48} r={1.6} fill={LINE} stroke="none" />
      <g strokeWidth={2}>
        <path d="M24,32 C26,29 29,29 31,31" />
        <path d="M32,24 C34,21 37,21 39,23" />
        <path d="M42,20 C44,17 47,17 49,19" />
      </g>
    </g>
  );
}

function BrickGlyph() {
  return (
    <g fill="none" stroke={LINE} strokeWidth={3} strokeLinejoin="round">
      <rect x={28} y={55} width={18} height={12} rx={1.5} />
      <rect x={50} y={55} width={18} height={12} rx={1.5} />
      <rect x={39} y={40} width={18} height={12} rx={1.5} />
      <g strokeWidth={2.5} strokeLinecap="round">
        <line x1={26} y1={28} x2={31} y2={33} />
        <line x1={48} y1={22} x2={48} y2={28} />
        <line x1={70} y1={28} x2={65} y2={33} />
      </g>
    </g>
  );
}

function WheatGlyph() {
  return (
    <g fill="none" stroke={LINE} strokeWidth={3} strokeLinecap="round">
      <line x1={50} y1={70} x2={50} y2={30} />
      {[38, 45, 52, 59].map((y, i) => (
        <g key={y}>
          <line x1={50} y1={y} x2={50 - (i + 2) * 2.2} y2={y - 5} />
          <line x1={50} y1={y} x2={50 + (i + 2) * 2.2} y2={y - 5} />
        </g>
      ))}
      <g strokeWidth={2.5}>
        <line x1={50} y1={22} x2={50} y2={28} />
        <line x1={45} y1={24} x2={49} y2={27} />
        <line x1={55} y1={24} x2={51} y2={27} />
      </g>
    </g>
  );
}

function WoodGlyph() {
  return (
    <g fill="none" stroke={LINE} strokeWidth={3}>
      <circle cx={50} cy={52} r={18} />
      <circle cx={50} cy={52} r={11} />
      <circle cx={50} cy={52} r={4.5} />
      <path d="M62,40 C68,38 71,44 68,50" strokeLinecap="round" />
      <path d="M30,60 C24,66 28,74 36,72" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
    </g>
  );
}

export function ResourceIcon({ type, size = 32 }: { type: ResourceType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={type}>
      <polygon
        points={HEX_POINTS}
        fill={RESOURCE_FILL[type]}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={2}
      />
      {type === "ore" && <OreGlyph />}
      {type === "sheep" && <SheepGlyph />}
      {type === "brick" && <BrickGlyph />}
      {type === "wheat" && <WheatGlyph />}
      {type === "wood" && <WoodGlyph />}
    </svg>
  );
}
