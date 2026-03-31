"use client";

import { getLevelInfo } from "@/lib/supabase";

const LEVEL_COLORS: Record<number, string> = {
  1: "bg-gray-700 text-gray-300",
  2: "bg-green-900 text-green-300",
  3: "bg-blue-900 text-blue-300",
  4: "bg-purple-900 text-purple-300",
  5: "bg-yellow-900 text-yellow-300",
  6: "bg-red-900 text-red-300",
};

export function LevelBadge({ xp, size = "sm" }: { xp: number; size?: "sm" | "md" | "lg" }) {
  const info = getLevelInfo(xp);
  const colorClass = LEVEL_COLORS[info.level] || LEVEL_COLORS[1];

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span className={`font-medium rounded-full ${colorClass} ${sizeClasses[size]}`}>
      Lv{info.level} {info.title}
    </span>
  );
}

export function XpProgressBar({ xp }: { xp: number }) {
  const info = getLevelInfo(xp);

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
        <span>{info.xp.toLocaleString()} XP</span>
        {info.nextXp !== null && (
          <span>{info.nextXp.toLocaleString()} XP</span>
        )}
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all"
          style={{ width: `${Math.min(info.progress, 100)}%` }}
        />
      </div>
      {info.nextXp !== null && (
        <div className="text-xs text-gray-500 mt-1">
          {(info.nextXp - info.xp).toLocaleString()} XP to {getLevelInfo(info.nextXp).title}
        </div>
      )}
    </div>
  );
}
