"use client";

// ─── MeshGuild Badge Pixel Art System ──────────────────────────────────────────
// All pixel grids are 9×9. Values: 0 = transparent, 1 = primary, 2 = accent/highlight.

export type CommendationBadgeKey =
  | "RELIABILITY"
  | "MENTORSHIP"
  | "LEADERSHIP"
  | "FIELDCRAFT"
  | "SIGNAL_BOOST";

export type SpecialBadgeKey = "FOUNDER" | "PIONEER";

export type BadgeKey = CommendationBadgeKey | SpecialBadgeKey;

export interface BadgeDef {
  key: BadgeKey;
  label: string;
  description: string;
  color: string;    // primary pixel fill
  accent: string;   // accent/highlight pixel fill
  shadow: string;   // glow drop-shadow color
  pixels: number[][];
  special?: boolean;
}

export const BADGE_REGISTRY: Record<string, BadgeDef> = {
  // ── RELIABILITY ── Broadcast tower: antenna arms + widening base
  RELIABILITY: {
    key: "RELIABILITY",
    label: "Reliability",
    description: "Keeps the signal alive through all conditions",
    color: "#00ff88",
    accent: "#00cc6a",
    shadow: "rgba(0,255,136,0.65)",
    pixels: [
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 1, 0, 0, 1, 0, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
    ],
  },

  // ── MENTORSHIP ── Signal converging onto a figure: knowledge flowing in
  MENTORSHIP: {
    key: "MENTORSHIP",
    label: "Mentorship",
    description: "Guides fellow operators and raises the craft",
    color: "#f0b429",
    accent: "#d49920",
    shadow: "rgba(240,180,41,0.65)",
    pixels: [
      [0, 1, 0, 1, 0, 1, 0, 1, 0],
      [0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0],
    ],
  },

  // ── LEADERSHIP ── Crown: three points, solid band, base
  LEADERSHIP: {
    key: "LEADERSHIP",
    label: "Leadership",
    description: "Commands the field with clarity and decisiveness",
    color: "#d4a746",
    accent: "#b8911f",
    shadow: "rgba(212,167,70,0.65)",
    pixels: [
      [0, 1, 0, 0, 0, 0, 0, 1, 0],
      [0, 1, 0, 1, 0, 1, 0, 1, 0],
      [0, 1, 1, 1, 0, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 1, 0, 0, 0, 0, 0, 1, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },

  // ── FIELDCRAFT ── Compass cross: clean N/S/E/W cardinal directions
  FIELDCRAFT: {
    key: "FIELDCRAFT",
    label: "Fieldcraft",
    description: "Instinctive deployment and field positioning",
    color: "#4fc3f7",
    accent: "#0288d1",
    shadow: "rgba(79,195,247,0.65)",
    pixels: [
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
    ],
  },

  // ── SIGNAL_BOOST ── Triple upward chevrons (^^^): cascading amplification
  SIGNAL_BOOST: {
    key: "SIGNAL_BOOST",
    label: "Signal Boost",
    description: "Elevates guild morale and operational spirit",
    color: "#bb86fc",
    accent: "#9b59f0",
    shadow: "rgba(187,134,252,0.65)",
    pixels: [
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0, 1, 0],
    ],
  },

  // ── PIONEER ── shield: first defenders, early builders
  PIONEER: {
    key: "PIONEER",
    label: "Pioneer",
    description: "Among the first to establish the Mesh Guild",
    color: "#ff7043",
    accent: "#bf360c",
    shadow: "rgba(255,112,67,0.65)",
    special: true,
    pixels: [
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 1, 1, 0, 1, 0, 1, 1, 0],
      [0, 1, 1, 0, 2, 0, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },

  // ── FOUNDER ── 8-pointed star: singular, luminous, legendary
  FOUNDER: {
    key: "FOUNDER",
    label: "Founder",
    description: "Original architect of the Mesh Guild",
    color: "#ffd700",
    accent: "#ffffff",
    shadow: "rgba(255,215,0,0.85)",
    special: true,
    pixels: [
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 2, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0],
    ],
  },
};

// ── Special badge options (for admin award UI) ────────────────────────────────
// Add new seasonal badge keys here as needed — they'll render with a fallback icon
// until custom pixel art is added to BADGE_REGISTRY.
export const SPECIAL_BADGE_KEYS: SpecialBadgeKey[] = ["FOUNDER", "PIONEER"];
export const SPECIAL_BADGE_OPTIONS = SPECIAL_BADGE_KEYS.map((k) => ({
  key: k,
  label: BADGE_REGISTRY[k].label,
  description: BADGE_REGISTRY[k].description,
}));

// ── Fallback for unknown / seasonal badge keys ─────────────────────────────────
const FALLBACK_PIXELS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 2, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const PIXEL_SIZES = { sm: 3, md: 5, lg: 8 } as const;

interface BadgeArtProps {
  badgeKey: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function BadgeArt({
  badgeKey,
  size = "md",
  showLabel = false,
  className = "",
}: BadgeArtProps) {
  const def: BadgeDef = BADGE_REGISTRY[badgeKey] ?? {
    key: badgeKey as BadgeKey,
    label: badgeKey.replaceAll("_", " "),
    description: "Special recognition badge",
    color: "#a0a0a0",
    accent: "#ffffff",
    shadow: "rgba(160,160,160,0.5)",
    special: true,
    pixels: FALLBACK_PIXELS,
  };

  const px = PIXEL_SIZES[size];
  const dim = 9 * px;
  const glowSize = size === "lg" ? 8 : size === "md" ? 5 : 3;

  return (
    <div
      className={`flex flex-col items-center gap-1 ${className}`}
      title={`${def.label} — ${def.description}`}
    >
      <div
        style={{
          width: dim,
          height: dim,
          filter: `drop-shadow(0 0 ${glowSize}px ${def.shadow})`,
          flexShrink: 0,
        }}
      >
        <svg
          width={dim}
          height={dim}
          viewBox={`0 0 ${dim} ${dim}`}
          xmlns="http://www.w3.org/2000/svg"
          shapeRendering="crispEdges"
        >
          {def.pixels.flatMap((row, rowIdx) =>
            row.flatMap((cell, colIdx) =>
              cell === 0
                ? []
                : [
                    <rect
                      key={`${rowIdx}-${colIdx}`}
                      x={colIdx * px}
                      y={rowIdx * px}
                      width={px}
                      height={px}
                      fill={cell === 2 ? def.accent : def.color}
                    />,
                  ]
            )
          )}
        </svg>
      </div>
      {showLabel && (
        <span
          style={{
            color: def.color,
            fontSize: size === "lg" ? 10 : size === "md" ? 8 : 7,
          }}
          className="font-mono font-bold uppercase tracking-widest leading-none"
        >
          {def.label}
        </span>
      )}
    </div>
  );
}
