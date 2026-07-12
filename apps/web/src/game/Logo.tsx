/**
 * Original crest mark — a hexagonal championship medallion (the badge shape
 * itself is the game's own hex tile) framing a trophy cup, laurel wreaths,
 * and a single star, with subtle radiating lines behind. Deliberately NOT a
 * reproduction of any trademarked club/competition badge (see CLAUDE.md's IP
 * constraints) — classic "sports crest" vocabulary (trophies, laurels,
 * stars) is generic across the sport, not owned by any one competition.
 * Pure SVG, so it's crisp at any size from a 16px favicon to a hero banner.
 */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="BayCheArsBar crest">
      <defs>
        <linearGradient id="hh-logo-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0c968" />
          <stop offset="100%" stopColor="#d9ab3f" />
        </linearGradient>
      </defs>

      <polygon
        points="89.8,27 89.8,73 50,96 10.2,73 10.2,27 50,4"
        fill="#221910"
        stroke="url(#hh-logo-gold)"
        strokeWidth={3.5}
      />
      <polygon
        points="84.64,30 84.64,70 50,90 15.36,70 15.36,30 50,10"
        fill="none"
        stroke="url(#hh-logo-gold)"
        strokeWidth={1}
        opacity={0.5}
      />

      <g stroke="url(#hh-logo-gold)" strokeWidth={1} opacity={0.14}>
        <line x1={50} y1={50} x2={88} y2={50} />
        <line x1={50} y1={50} x2={76.87} y2={76.87} />
        <line x1={50} y1={50} x2={50} y2={88} />
        <line x1={50} y1={50} x2={23.13} y2={76.87} />
        <line x1={50} y1={50} x2={12} y2={50} />
        <line x1={50} y1={50} x2={23.13} y2={23.13} />
        <line x1={50} y1={50} x2={50} y2={12} />
        <line x1={50} y1={50} x2={76.87} y2={23.13} />
      </g>

      <g fill="url(#hh-logo-gold)">
        <ellipse cx={27} cy={72} rx={3.6} ry={1.7} transform="rotate(-15 27 72)" />
        <ellipse cx={24.5} cy={63} rx={3.6} ry={1.7} transform="rotate(-35 24.5 63)" />
        <ellipse cx={24.5} cy={53} rx={3.6} ry={1.7} transform="rotate(-55 24.5 53)" />
        <ellipse cx={27} cy={44} rx={3.6} ry={1.7} transform="rotate(-75 27 44)" />
        <ellipse cx={73} cy={72} rx={3.6} ry={1.7} transform="rotate(15 73 72)" />
        <ellipse cx={75.5} cy={63} rx={3.6} ry={1.7} transform="rotate(35 75.5 63)" />
        <ellipse cx={75.5} cy={53} rx={3.6} ry={1.7} transform="rotate(55 75.5 53)" />
        <ellipse cx={73} cy={44} rx={3.6} ry={1.7} transform="rotate(75 73 44)" />
      </g>
      <path d="M28,76 Q20,60 27,42" fill="none" stroke="url(#hh-logo-gold)" strokeWidth={1.2} opacity={0.7} />
      <path d="M72,76 Q80,60 73,42" fill="none" stroke="url(#hh-logo-gold)" strokeWidth={1.2} opacity={0.7} />

      <path
        d="M36,36 L64,36 C64,50 58,60 50,60 C42,60 36,50 36,36 Z"
        fill="url(#hh-logo-gold)"
      />
      <ellipse cx={32} cy={45} rx={5} ry={8} fill="none" stroke="url(#hh-logo-gold)" strokeWidth={2.5} />
      <ellipse cx={68} cy={45} rx={5} ry={8} fill="none" stroke="url(#hh-logo-gold)" strokeWidth={2.5} />
      <rect x={47} y={60} width={6} height={10} fill="url(#hh-logo-gold)" />
      <path d="M42,70 L58,70 L64,78 L36,78 Z" fill="url(#hh-logo-gold)" />

      <polygon
        points="50,19 51.12,22.46 54.76,22.46 51.81,24.59 52.94,28.05 50,25.9 47.06,28.05 48.19,24.59 45.25,22.46 48.88,22.46"
        fill="url(#hh-logo-gold)"
      />
    </svg>
  );
}
