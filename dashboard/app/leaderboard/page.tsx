"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Node } from "@/lib/supabase";
import { LevelBadge } from "@/components/level-badge";
import AuthNav from "@/components/auth-nav";

function GuildHealthBadge({ nodes }: { nodes: Node[] }) {
  if (nodes.length === 0) return null;

  const onlineCount = nodes.filter((n) => n.is_online).length;
  const score = Math.round((onlineCount / nodes.length) * 100);

  let rank: string;
  let color: string;
  if (score >= 90) {
    rank = "Battle Ready";
    color = "text-green-400 border-green-700 bg-green-900/30";
  } else if (score >= 70) {
    rank = "Operational";
    color = "text-blue-400 border-blue-700 bg-blue-900/30";
  } else if (score >= 50) {
    rank = "Degraded";
    color = "text-yellow-400 border-yellow-700 bg-yellow-900/30";
  } else {
    rank = "Critical";
    color = "text-red-400 border-red-700 bg-red-900/30";
  }

  return (
    <div className={`border rounded-lg p-4 mb-6 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide opacity-75">Guild Health</div>
          <div className="text-2xl font-bold">{score}%</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{rank}</div>
          <div className="text-xs opacity-75">
            {onlineCount}/{nodes.length} nodes online
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"xp" | "level" | "packets" | "uptime">("xp");

  useEffect(() => {
    const client = getSupabase();

    async function load() {
      const { data } = await client
        .from("nodes")
        .select("*")
        .order("xp_total", { ascending: false });
      setNodes(data ?? []);
      setLoading(false);
    }
    load();

    const channel = client
      .channel("leaderboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nodes" },
        async () => {
          const { data } = await client
            .from("nodes")
            .select("*")
            .order("xp_total", { ascending: false });
          setNodes(data ?? []);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  const sorted = [...nodes].sort((a, b) => {
    if (sortBy === "xp") return (b.xp_total ?? 0) - (a.xp_total ?? 0);
    if (sortBy === "packets") return (b.packets_total ?? 0) - (a.packets_total ?? 0);
    if (sortBy === "uptime") return (b.uptime_pct ?? 0) - (a.uptime_pct ?? 0);
    return (b.level ?? 1) - (a.level ?? 1);
  });

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto text-gray-400 text-sm">Loading leaderboard...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/"
              className="text-gray-400 hover:text-gray-200 text-sm mb-2 inline-block"
            >
              &larr; Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Leaderboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              OKC Crew — Node Rankings
            </p>
          </div>
          <AuthNav />
        </div>

        <GuildHealthBadge nodes={nodes} />

        {/* Sort controls */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSortBy("xp")}
            className={`text-xs px-3 py-1.5 rounded ${
              sortBy === "xp"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            By XP
          </button>
          <button
            onClick={() => setSortBy("level")}
            className={`text-xs px-3 py-1.5 rounded ${
              sortBy === "level"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            By Level
          </button>
          <button
            onClick={() => setSortBy("packets")}
            className={`text-xs px-3 py-1.5 rounded ${
              sortBy === "packets"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            By Packets
          </button>
          <button
            onClick={() => setSortBy("uptime")}
            className={`text-xs px-3 py-1.5 rounded ${
              sortBy === "uptime"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            By Uptime
          </button>
        </div>

        {/* Leaderboard table */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                <th className="text-left p-3 w-12">#</th>
                <th className="text-left p-3">Node</th>
                <th className="text-left p-3">Level</th>
                <th className="text-right p-3">XP</th>
                <th className="text-right p-3 hidden sm:table-cell">Packets</th>
                <th className="text-right p-3 hidden sm:table-cell">Uptime</th>
                <th className="text-center p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((node, i) => (
                  <tr
                    key={node.id}
                    className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="p-3 text-gray-500 font-mono text-sm">
                      {i + 1}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/node/${encodeURIComponent(node.id)}`}
                        className="hover:text-blue-400 transition-colors"
                      >
                        <div className="text-white text-sm font-semibold">
                          {node.long_name ?? node.id}
                        </div>
                        {node.short_name && (
                          <div className="text-gray-500 text-xs">
                            {node.short_name}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="p-3">
                      <LevelBadge xp={node.xp_total ?? 0} />
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-gray-300">
                      {(node.xp_total ?? 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-gray-300 hidden sm:table-cell">
                      {(node.packets_total ?? 0).toLocaleString()}
                    </td>
                    <td className={`p-3 text-right font-mono text-sm hidden sm:table-cell ${
                      node.uptime_pct !== null
                        ? node.uptime_pct >= 90 ? "text-green-400"
                        : node.uptime_pct >= 70 ? "text-yellow-400"
                        : "text-red-400"
                        : "text-gray-500"
                    }`}>
                      {node.uptime_pct !== null ? `${node.uptime_pct}%` : "—"}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          node.is_online
                            ? "bg-green-900 text-green-300"
                            : "bg-red-900 text-red-300"
                        }`}
                      >
                        {node.is_online ? "Online" : "Offline"}
                      </span>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
