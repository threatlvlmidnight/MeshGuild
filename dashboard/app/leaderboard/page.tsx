"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Node, Profile } from "@/lib/supabase";
import { LevelBadge } from "@/components/level-badge";
import AuthNav from "@/components/auth-nav";
import { ArrowLeft, Broadcast, SortAscending, UsersThree } from "@phosphor-icons/react";

function GuildHealthBadge({ nodes }: { nodes: Node[] }) {
  if (nodes.length === 0) return null;

  const onlineCount = nodes.filter((n) => n.is_online).length;
  const score = Math.round((onlineCount / nodes.length) * 100);

  let rank: string;
  let colorClass: string;
  if (score >= 90) {
    rank = "BATTLE READY";
    colorClass = "text-terminal-green border-terminal-green/30 bg-terminal-green/5";
  } else if (score >= 70) {
    rank = "OPERATIONAL";
    colorClass = "text-terminal-dim border-terminal-dim/30 bg-terminal-dim/5";
  } else if (score >= 50) {
    rank = "DEGRADED";
    colorClass = "text-terminal-amber border-terminal-amber/30 bg-terminal-amber/5";
  } else {
    rank = "CRITICAL";
    colorClass = "text-terminal-red border-terminal-red/30 bg-terminal-red/5";
  }

  return (
    <div className={`border rounded-lg p-4 mb-6 font-mono ${colorClass}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest opacity-75">ORDER STATUS</div>
          <div className="text-2xl font-bold">{score}%</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold tracking-wider">{rank}</div>
          <div className="text-xs opacity-60">{onlineCount}/{nodes.length} nodes online</div>
        </div>
      </div>
    </div>
  );
}

interface OperatorSummary extends Profile {
  nodeCount: number;
  commendationCount: number;
}

const ROLE_BADGE: Record<string, string> = {
  member: "border-terminal-muted/40 text-terminal-muted bg-terminal-muted/10",
  elder: "border-terminal-gold/40 text-terminal-gold bg-terminal-gold/10",
  leader: "border-terminal-green/40 text-terminal-green bg-terminal-green/10",
};

export default function Registry() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [operators, setOperators] = useState<OperatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"xp" | "level" | "packets" | "uptime">("xp");

  useEffect(() => {
    const client = getSupabase();

    async function load() {
      const [nodesRes, profilesRes, ownershipRes, commendationsRes] = await Promise.all([
        client.from("nodes").select("*").order("xp_total", { ascending: false }),
        client.from("profiles").select("*").eq("approved", true).order("renown", { ascending: false }),
        client.from("node_ownership").select("player_id"),
        client.from("player_commendations").select("to_player_id"),
      ]);

      setNodes(nodesRes.data ?? []);

      const ownershipCounts: Record<string, number> = {};
      for (const row of ownershipRes.data ?? []) {
        ownershipCounts[row.player_id] = (ownershipCounts[row.player_id] || 0) + 1;
      }

      const commendationCounts: Record<string, number> = {};
      if (!commendationsRes.error) {
        for (const row of commendationsRes.data ?? []) {
          commendationCounts[row.to_player_id] = (commendationCounts[row.to_player_id] || 0) + 1;
        }
      }

      const operatorRows: OperatorSummary[] = (profilesRes.data ?? [])
        .map((profile) => ({
          ...profile,
          nodeCount: ownershipCounts[profile.id] || 0,
          commendationCount: commendationCounts[profile.id] || 0,
        }))
        .sort((a, b) => (b.renown ?? 0) - (a.renown ?? 0));

      setOperators(operatorRows);
      setLoading(false);
    }
    load();

    const channel = client
      .channel("leaderboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "nodes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "node_ownership" }, load)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  const sortedNodes = [...nodes].sort((a, b) => {
    if (sortBy === "xp") return (b.xp_total ?? 0) - (a.xp_total ?? 0);
    if (sortBy === "packets") return (b.packets_total ?? 0) - (a.packets_total ?? 0);
    if (sortBy === "uptime") return (b.uptime_pct ?? 0) - (a.uptime_pct ?? 0);
    return (b.level ?? 1) - (a.level ?? 1);
  });

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-5xl mx-auto text-terminal-muted text-sm font-mono animate-pulse-glow">
          Accessing the Registry...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-4">
          <div>
            <Link
              href="/"
              className="text-terminal-muted hover:text-terminal-green text-xs mb-2 inline-flex items-center gap-1 font-mono transition-colors"
            >
              <ArrowLeft size={12} weight="bold" />
              OPERATIONS
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-terminal-green glow-green flex items-center gap-2">
              <Broadcast size={20} weight="bold" />
              THE REGISTRY
            </h1>
            <p className="text-terminal-muted text-xs font-mono mt-1">
              Operator roster and node rankings across The Signal
            </p>
          </div>
          <AuthNav />
        </div>

        <GuildHealthBadge nodes={nodes} />

        <div className="panel overflow-hidden mb-6">
          <div className="flex items-center gap-2 border-b border-terminal-border px-3 py-2">
            <UsersThree size={16} weight="bold" className="text-terminal-gold" />
            <div>
              <div className="text-sm font-mono font-bold text-terminal-gold uppercase tracking-widest">
                Guild Roster
              </div>
              <div className="text-[10px] font-mono text-terminal-muted">
                Every approved operator can view who is in the guild
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-terminal-border text-terminal-muted text-[10px] uppercase tracking-widest font-mono">
                  <th className="text-left p-3">CALLSIGN</th>
                  <th className="text-left p-3">ROLE</th>
                  <th className="text-left p-3 hidden sm:table-cell">RANK</th>
                  <th className="text-right p-3">RENOWN</th>
                  <th className="text-right p-3 hidden sm:table-cell">INFLUENCE</th>
                  <th className="text-right p-3 hidden sm:table-cell">COMMENDS</th>
                  <th className="text-right p-3">NODES</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((operator) => (
                  <tr
                    key={operator.id}
                    className="border-b border-terminal-border/50 hover:bg-terminal-green/5 transition-colors"
                  >
                    <td className="p-3">
                      <Link
                        href={`/profile/${encodeURIComponent(operator.callsign)}`}
                        className="text-foreground text-sm font-mono font-bold hover:text-terminal-green transition-colors"
                      >
                        {operator.callsign}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                          ROLE_BADGE[operator.role] ?? ROLE_BADGE.member
                        }`}
                      >
                        {operator.role}
                      </span>
                    </td>
                    <td className="p-3 text-terminal-muted text-xs font-mono hidden sm:table-cell">
                      {operator.rank_title}
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-foreground">
                      {operator.renown.toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-terminal-muted hidden sm:table-cell">
                      {operator.influence.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-terminal-gold hidden sm:table-cell">
                      {operator.commendationCount}
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-terminal-muted">
                      {operator.nodeCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <SortAscending size={14} weight="bold" className="text-terminal-muted" />
          {(["xp", "level", "packets", "uptime"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 rounded border transition-colors ${
                sortBy === key
                  ? "border-terminal-green/40 text-terminal-green bg-terminal-green/10"
                  : "border-terminal-border text-terminal-muted hover:text-foreground hover:border-terminal-border"
              }`}
            >
              {key === "xp" ? "RENOWN" : key}
            </button>
          ))}
        </div>

        <div className="panel overflow-hidden">
          <div className="px-3 py-2 border-b border-terminal-border text-sm font-mono font-bold text-terminal-green uppercase tracking-widest">
            Node Rankings
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-terminal-border text-terminal-muted text-[10px] uppercase tracking-widest font-mono">
                  <th className="text-left p-3 w-12">#</th>
                  <th className="text-left p-3">NODE</th>
                  <th className="text-left p-3">LEVEL</th>
                  <th className="text-right p-3">RENOWN</th>
                  <th className="text-right p-3 hidden sm:table-cell">PACKETS</th>
                  <th className="text-right p-3 hidden sm:table-cell">UPTIME</th>
                  <th className="text-center p-3">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {sortedNodes.map((node, i) => (
                  <tr
                    key={node.id}
                    className="border-b border-terminal-border/50 hover:bg-terminal-green/5 transition-colors"
                  >
                    <td className="p-3 text-terminal-muted font-mono text-sm">{i + 1}</td>
                    <td className="p-3">
                      <Link
                        href={`/node/${encodeURIComponent(node.id)}`}
                        className="hover:text-terminal-green transition-colors"
                      >
                        <div className="text-foreground text-sm font-mono font-bold">
                          {node.long_name ?? node.id}
                        </div>
                        {node.short_name && (
                          <div className="text-terminal-muted text-xs font-mono">{node.short_name}</div>
                        )}
                      </Link>
                    </td>
                    <td className="p-3">
                      <LevelBadge xp={node.xp_total ?? 0} />
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-foreground">
                      {(node.xp_total ?? 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-terminal-muted hidden sm:table-cell">
                      {(node.packets_total ?? 0).toLocaleString()}
                    </td>
                    <td
                      className={`p-3 text-right font-mono text-sm hidden sm:table-cell ${
                        node.uptime_pct !== null
                          ? node.uptime_pct >= 90
                            ? "text-terminal-green"
                            : node.uptime_pct >= 70
                              ? "text-terminal-amber"
                              : "text-terminal-red"
                          : "text-terminal-muted"
                      }`}
                    >
                      {node.uptime_pct !== null ? `${node.uptime_pct}%` : "—"}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                          node.is_online
                            ? "border-terminal-green/30 text-terminal-green bg-terminal-green/5"
                            : "border-terminal-red/30 text-terminal-red bg-terminal-red/5"
                        }`}
                      >
                        {node.is_online ? "ON" : "DARK"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
