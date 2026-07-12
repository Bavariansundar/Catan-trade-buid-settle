/**
 * Original crest mark — a hex "flower" of the game's five resource badges
 * (wood, brick, sheep, wheat, ore) tessellated edge-to-edge around a central
 * settlement emblem, echoing an actual board fragment rather than a generic
 * sports crest. Deliberately built from the same hex-badge vocabulary as
 * ResourceIcon.tsx (see CLAUDE.md's IP constraints) — no reproduction of any
 * trademarked mark. Pure SVG, so it's crisp at any size from a 16px favicon
 * to a hero banner.
 */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="BayCheArsBar crest">
      <defs>
        <linearGradient id="hh-logo-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0c968" />
          <stop offset="100%" stopColor="#d9ab3f" />
        </linearGradient>
        <filter id="hh-logo-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>

      <polygon
        points="50,2 91.57,26 91.57,74 50,98 8.43,74 8.43,26"
        fill="none"
        stroke="url(#hh-logo-gold)"
        strokeWidth={1}
        opacity={0.35}
      />
      <polygon
        points="50,2 91.57,26 91.57,74 50,98 8.43,74 8.43,26"
        fill="url(#hh-logo-gold)"
        opacity={0.08}
        filter="url(#hh-logo-glow)"
      />

      {/* brick */}
      <g>
        <polygon
          points="66.11,8.9 77.54,15.5 77.54,28.7 66.11,35.3 54.68,28.7 54.68,15.5"
          fill="#a84f2c"
          stroke="url(#hh-logo-gold)"
          strokeWidth={1}
        />
        <g stroke="#f4ecd8" strokeWidth={1.1} opacity={0.9}>
          <rect x={59.6} y={19.6} width={5.4} height={3.4} fill="none" />
          <rect x={65.6} y={19.6} width={5.4} height={3.4} fill="none" />
          <rect x={62.6} y={24.4} width={5.4} height={3.4} fill="none" />
        </g>
      </g>

      {/* sheep */}
      <g>
        <polygon
          points="82.22,36.8 93.65,43.4 93.65,56.6 82.22,63.2 70.79,56.6 70.79,43.4"
          fill="#8fbf5e"
          stroke="url(#hh-logo-gold)"
          strokeWidth={1}
        />
        <g fill="#f4ecd8" opacity={0.9}>
          <circle cx={78.5} cy={51.5} r={3.6} />
          <circle cx={83.5} cy={49} r={4.2} />
          <circle cx={88} cy={52} r={3.4} />
          <circle cx={83.5} cy={54.5} r={3.6} />
        </g>
      </g>

      {/* wheat */}
      <g>
        <polygon
          points="66.11,64.7 77.54,71.3 77.54,84.5 66.11,91.1 54.68,84.5 54.68,71.3"
          fill="#d6a233"
          stroke="url(#hh-logo-gold)"
          strokeWidth={1}
        />
        <g fill="none" stroke="#f4ecd8" strokeWidth={1.3} strokeLinecap="round" opacity={0.9}>
          <line x1={66.11} y1={70} x2={66.11} y2={86} />
          <line x1={66.11} y1={74} x2={62.5} y2={71.5} />
          <line x1={66.11} y1={74} x2={69.7} y2={71.5} />
          <line x1={66.11} y1={79} x2={62.5} y2={76.5} />
          <line x1={66.11} y1={79} x2={69.7} y2={76.5} />
          <line x1={66.11} y1={84} x2={62.5} y2={81.5} />
          <line x1={66.11} y1={84} x2={69.7} y2={81.5} />
        </g>
      </g>

      {/* ore */}
      <g>
        <polygon
          points="33.89,64.7 45.32,71.3 45.32,84.5 33.89,91.1 22.46,84.5 22.46,71.3"
          fill="#756a5e"
          stroke="url(#hh-logo-gold)"
          strokeWidth={1}
        />
        <polygon
          points="33.89,71.9 39.89,77.9 33.89,83.9 27.89,77.9"
          fill="none"
          stroke="#f4ecd8"
          strokeWidth={1.2}
          strokeLinejoin="round"
          opacity={0.9}
        />
        <line x1={33.89} y1={71.9} x2={33.89} y2={83.9} stroke="#f4ecd8" strokeWidth={1} opacity={0.7} />
      </g>

      {/* wood */}
      <g>
        <polygon
          points="33.89,8.9 45.32,15.5 45.32,28.7 33.89,35.3 22.46,28.7 22.46,15.5"
          fill="#3f6b3a"
          stroke="url(#hh-logo-gold)"
          strokeWidth={1}
        />
        <g fill="none" stroke="#f4ecd8" strokeWidth={1.2} opacity={0.9}>
          <circle cx={33.89} cy={22.1} r={6.2} />
          <circle cx={33.89} cy={22.1} r={3} />
        </g>
      </g>

      {/* victory star */}
      <g>
        <polygon
          points="17.78,36.8 29.21,43.4 29.21,56.6 17.78,63.2 6.35,56.6 6.35,43.4"
          fill="#d3b878"
          stroke="url(#hh-logo-gold)"
          strokeWidth={1}
        />
        <polygon
          points="17.78,43.6 19.37,47.82 23.87,48.02 20.35,50.83 21.54,55.18 17.78,52.7 14.02,55.18 15.21,50.83 11.69,48.02 16.19,47.82"
          fill="#3a2a16"
        />
      </g>

      {/* central settlement emblem */}
      <polygon
        points="50,26 70.78,38 70.78,62 50,74 29.22,62 29.22,38"
        fill="#221910"
        stroke="url(#hh-logo-gold)"
        strokeWidth={2}
      />
      <path d="M36,54 L50,34 L64,54 Z" fill="url(#hh-logo-gold)" />
      <rect x={40} y={54} width={20} height={14} fill="url(#hh-logo-gold)" />
      <rect x={46} y={60} width={8} height={8} fill="#221910" />
    </svg>
  );
}
