"use client";

import { getLevelInfo } from "@/lib/supabase";

const LEVEL_COLORS: Record<number, string> = {
  1: "border-terminal-muted/50 text-terminal-muted bg-terminal-muted/10",
  2: "border-terminal-green/40 text-terminal-green bg-terminal-green/10",
  3: "border-terminal-dim/40 text-terminal-dim bg-terminal-dim/10",
  4: "border-terminal-gold/40 text-terminal-gold bg-terminal-gold/10",
  5: "border-terminal-amber/40 text-terminal-amber bg-terminal-amber/10",
  6: "border-terminal-red/40 text-terminal-red bg-terminal-red/10",
};

export function LevelBadge({ xp, size = "sm" }: { xp: number; size?: "sm" | "md" | "lg" }) {
  const info = getLevelInfo(xp);
  const colorClass = LEVEL_COLORS[info.level] || LEVEL_COLORS[1];

  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-sm px-3 py-1.5",
  };

  return (
    <span className={`font-mono font-bold rounded border ${colorClass} ${sizeClasses[size]}`}>
      LV{info.level} {info.title}
    </span>
  );
}

export function XpProgressBar({ xp }: { xp: number }) {
  const info = getLevelInfo(xp);

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-terminal-muted font-mono mb-1">
        <span>{info.xp.toLocaleString()} RN</span>
        {info.nextXp !== null && (
          <span>{info.nextXp.toLocaleString()} RN</span>
        )}
      </div>
      <div className="w-full bg-terminal-border rounded-full h-2">
        <div
          className="bg-terminal-green h-2 rounded-full transition-all"
          style={{ width: `${Math.min(info.progress, 100)}%` }}
        />
      </div>
      {info.nextXp !== null && (
        <div className="text-xs text-terminal-muted font-mono mt-1">
          {(info.nextXp - info.xp).toLocaleString()} RN to {getLevelInfo(info.nextXp).title}
        </div>
      )}
    </div>
  );
}
