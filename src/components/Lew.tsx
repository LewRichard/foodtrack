// Lew, FoodTrack's AI nutritionist, drawn as a small friendly character: a round green body with a
// leaf on top. Poses let the guide point at things or celebrate. Pure SVG, so it stays sharp and
// follows the theme without image files.

export type LewPose = "wave" | "point" | "think" | "cheer";

export function Lew({ pose = "wave", size = 120, className = "" }: { pose?: LewPose; size?: number; className?: string }) {
  return (
    <svg className={`lew lew-${pose} ${className}`} width={size} height={size * 1.06} viewBox="0 0 160 170" aria-hidden="true">
      <defs>
        <linearGradient id="lew-body" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#7ee39c" />
          <stop offset="100%" stopColor="#2bb35a" />
        </linearGradient>
        <linearGradient id="lew-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4cd97b" />
          <stop offset="100%" stopColor="#1f8f45" />
        </linearGradient>
      </defs>

      <ellipse className="lew-shadow" cx="80" cy="160" rx="40" ry="6" />

      <g className="lew-figure">
        {/* leaf sprout */}
        <path d="M80 40 C80 30 79 24 76 18" className="lew-stem" />
        <path d="M77 22 C66 8 50 10 46 14 C52 26 66 30 77 22 Z" fill="url(#lew-leaf)" />
        <path d="M79 26 C88 12 104 12 108 17 C101 28 88 31 79 26 Z" fill="url(#lew-leaf)" opacity="0.85" />

        {/* arms (behind the body) */}
        <g className="lew-arm lew-arm-left">
          <path d={pose === "cheer" ? "M40 92 C26 80 22 64 24 54" : "M40 98 C28 106 24 116 26 124"} className="lew-limb" />
          <circle cx={pose === "cheer" ? 24 : 26} cy={pose === "cheer" ? 52 : 126} r="8" fill="#2bb35a" />
        </g>
        <g className="lew-arm lew-arm-right">
          <path d={ARM_RIGHT[pose].path} className="lew-limb" />
          <circle cx={ARM_RIGHT[pose].hand[0]} cy={ARM_RIGHT[pose].hand[1]} r="8" fill="#2bb35a" />
        </g>

        {/* body */}
        <path d="M80 38 C112 38 128 64 128 96 C128 130 106 148 80 148 C54 148 32 130 32 96 C32 64 48 38 80 38 Z" fill="url(#lew-body)" />
        <ellipse cx="66" cy="62" rx="16" ry="9" fill="#ffffff" opacity="0.28" transform="rotate(-20 66 62)" />

        {/* face */}
        <g className="lew-eyes">
          {pose === "cheer" ? (
            <>
              <path d="M57 91 Q64 81 71 91" className="lew-mouth" />
              <path d="M89 91 Q96 81 103 91" className="lew-mouth" />
            </>
          ) : (
            <>
              <ellipse cx="64" cy="88" rx="7" ry="9" fill="#171513" />
              <ellipse cx="96" cy="88" rx="7" ry="9" fill="#171513" />
              <circle cx={pose === "think" ? 67 : 66.5} cy={pose === "think" ? 83 : 84.5} r="2.4" fill="#fff" />
              <circle cx={pose === "think" ? 99 : 98.5} cy={pose === "think" ? 83 : 84.5} r="2.4" fill="#fff" />
            </>
          )}
        </g>
        <ellipse cx="51" cy="104" rx="8" ry="5" fill="#ff9fb4" opacity="0.8" />
        <ellipse cx="109" cy="104" rx="8" ry="5" fill="#ff9fb4" opacity="0.8" />
        {pose === "think" ? (
          <ellipse cx="82" cy="110" rx="4.5" ry="5" fill="#171513" />
        ) : pose === "cheer" ? (
          <path d="M68 104 C72 118 88 118 92 104 Z" fill="#171513" />
        ) : (
          <path d="M68 105 C74 116 86 116 92 105" className="lew-mouth" />
        )}
      </g>

      {pose === "think" && (
        <g className="lew-bubbles">
          <circle cx="132" cy="44" r="4" />
          <circle cx="142" cy="30" r="6" />
        </g>
      )}
      {pose === "cheer" && (
        <g className="lew-sparks">
          <path d="M18 26 l4 8 l8 4 l-8 4 l-4 8 l-4 -8 l-8 -4 l8 -4 Z" />
          <path d="M140 60 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 l6 -3 Z" />
        </g>
      )}
    </svg>
  );
}

const ARM_RIGHT: Record<LewPose, { path: string; hand: [number, number] }> = {
  wave: { path: "M120 92 C134 82 138 66 136 54", hand: [136, 52] },
  point: { path: "M122 98 C134 96 144 94 152 92", hand: [152, 92] },
  think: { path: "M120 98 C132 106 136 116 134 124", hand: [134, 126] },
  cheer: { path: "M120 92 C134 80 138 64 136 54", hand: [136, 52] },
};
