"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Node, Alert } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import AuthNav from "@/components/auth-nav";
import { LevelBadge } from "@/components/level-badge";
import { Broadcast, Warning, WifiHigh, WifiSlash, Lightning, BookOpen } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";

// --- Color helpers ---

function rssiColor(rssi: number | null): string {
  if (rssi === null) return "text-terminal-muted";
  if (rssi > -100) return "text-terminal-green";
  if (rssi >= -110) return "text-terminal-amber";
  return "text-terminal-red";
}

function snrColor(snr: number | null): string {
  if (snr === null) return "text-terminal-muted";
  if (snr > -10) return "text-terminal-green";
  if (snr >= -15) return "text-terminal-amber";
  return "text-terminal-red";
}

function batteryColor(level: number | null): string {
  if (level === null) return "text-terminal-muted";
  if (level > 50) return "text-terminal-green";
  if (level >= 20) return "text-terminal-amber";
  return "text-terminal-red";
}

// --- Node card ---

function NodeCard({ node, index, xpPerHour }: { node: Node; index: number; xpPerHour: number }) {
  const lastSeen = node.last_seen
    ? formatDistanceToNow(new Date(node.last_seen), { addSuffix: true })
    : "never";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link href={`/node/${encodeURIComponent(node.id)}`} className="block group">
        <div className="panel p-4 flex flex-col gap-3 hover:border-terminal-green/30 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {node.is_online ? (
                <WifiHigh size={16} weight="bold" className="text-terminal-green" />
              ) : (
                <WifiSlash size={16} weight="bold" className="text-terminal-red" />
              )}
              <div>
                <div className="text-foreground font-mono font-semibold text-sm group-hover:text-terminal-green transition-colors">
                  {node.long_name ?? node.id}
                </div>
                {node.short_name && (
                  <div className="text-terminal-muted text-xs font-mono">{node.short_name}</div>
                )}
              </div>
            </div>
            <span
              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                node.is_online
                  ? "border-terminal-green/30 text-terminal-green bg-terminal-green/5"
                  : "border-terminal-red/30 text-terminal-red bg-terminal-red/5"
              }`}
            >
              {node.is_online ? "ONLINE" : "DARK"}
            </span>
          </div>

          <div className="text-terminal-muted text-xs font-mono">
            Last signal {lastSeen}
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs border-t border-terminal-border pt-3">
            <div>
              <div className="text-terminal-muted uppercase tracking-widest text-[10px] mb-0.5">RSSI</div>
              <div className={`font-mono font-bold ${rssiColor(node.rssi)}`}>
                {node.rssi !== null ? `${node.rssi}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-terminal-muted uppercase tracking-widest text-[10px] mb-0.5">SNR</div>
              <div className={`font-mono font-bold ${snrColor(node.snr)}`}>
                {node.snr !== null ? `${node.snr}` : "—"}
              </div>
            </div>
            {node.battery_level !== null ? (
              <div>
                <div className="text-terminal-muted uppercase tracking-widest text-[10px] mb-0.5">BAT</div>
                <div className={`font-mono font-bold ${batteryColor(node.battery_level)}`}>
                  {node.battery_level}%
                </div>
              </div>
            ) : (
              <div>
                <div className="text-terminal-muted uppercase tracking-widest text-[10px] mb-0.5">UP</div>
                <div className="font-mono font-bold text-terminal-muted">
                  {node.uptime_pct !== null ? `${node.uptime_pct}%` : "—"}
                </div>
              </div>
            )}
          </div>

          {/* Level badge */}
          <div className="flex items-center justify-between border-t border-terminal-border pt-2">
            <LevelBadge xp={node.xp_total ?? 0} />
            <div className="text-right">
              <span className="text-terminal-muted text-xs font-mono">
                {(node.xp_total ?? 0).toLocaleString()} RN
              </span>
              {xpPerHour > 0 && (
                <div className="text-terminal-green text-[10px] font-mono">+{xpPerHour}/hr</div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// --- Alerts banner ---

function AlertsBanner({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  return (
    <Link href="/alerts" className="block">
      <div className="border border-terminal-amber/30 bg-terminal-amber/5 rounded-lg p-4 mb-6 hover:border-terminal-amber/50 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-terminal-amber font-mono font-bold text-sm">
            <Warning size={16} weight="bold" />
            {alerts.length} ACTIVE ALERT{alerts.length > 1 ? "S" : ""}
          </div>
          <span className="text-terminal-amber/70 text-xs font-mono">VIEW ALL →</span>
        </div>
        <ul className="space-y-1">
          {alerts.slice(0, 3).map((alert) => (
            <li key={alert.id} className="text-terminal-amber/80 text-xs font-mono">
              <span className="text-terminal-amber">[{alert.alert_type}]</span>{" "}
              {alert.message}
            </li>
          ))}
          {alerts.length > 3 && (
            <li className="text-terminal-amber/60 text-xs font-mono">+{alerts.length - 3} more</li>
          )}
        </ul>
      </div>
    </Link>
  );
}

// --- Public Landing Page ---

function LandingPage({ stats }: { stats: { totalNodes: number; onlineNodes: number; totalOperators: number } }) {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Broadcast size={48} weight="bold" className="text-terminal-green mx-auto mb-4" />
            <h1 className="text-3xl sm:text-4xl font-bold font-mono text-terminal-green glow-green tracking-tight mb-3">
              THE SIGNAL
            </h1>
            <p className="text-terminal-muted text-sm font-mono mb-8 max-w-md mx-auto">
              A fraternal order of signal operators maintaining a decentralized mesh communication network.
              Hold the signal. Push back The Silence.
            </p>
          </motion.div>

          {/* Live Stats */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="grid grid-cols-3 gap-4 mb-8"
          >
            <div className="panel p-4">
              <div className="text-2xl font-bold font-mono text-terminal-green">{stats.totalNodes}</div>
              <div className="text-[10px] font-mono text-terminal-muted uppercase tracking-widest mt-1">NODES</div>
            </div>
            <div className="panel p-4">
              <div className="text-2xl font-bold font-mono text-terminal-green">{stats.onlineNodes}</div>
              <div className="text-[10px] font-mono text-terminal-muted uppercase tracking-widest mt-1">ONLINE</div>
            </div>
            <div className="panel p-4">
              <div className="text-2xl font-bold font-mono text-terminal-green">{stats.totalOperators}</div>
              <div className="text-[10px] font-mono text-terminal-muted uppercase tracking-widest mt-1">OPERATORS</div>
            </div>
          </motion.div>

          {/* Signal Strength */}
          {stats.totalNodes > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mb-8"
            >
              {(() => {
                const pct = Math.round((stats.onlineNodes / stats.totalNodes) * 100);
                return (
                  <div className="panel p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-terminal-muted uppercase tracking-widest">SIGNAL STRENGTH</span>
                      <span className="text-sm font-mono font-bold text-terminal-green">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-terminal-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-terminal-green rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Link
              href="/login"
              className="px-6 py-3 bg-terminal-green/10 border border-terminal-green/40 text-terminal-green font-mono font-bold text-sm rounded-lg hover:bg-terminal-green/20 transition-colors flex items-center justify-center gap-2"
            >
              <Lightning size={16} weight="bold" />
              REQUEST OPERATOR ACCESS
            </Link>
            <Link
              href="/field-manual"
              className="px-6 py-3 bg-terminal-panel border border-terminal-border text-terminal-muted font-mono font-bold text-sm rounded-lg hover:text-foreground hover:border-terminal-green/30 transition-colors flex items-center justify-center gap-2"
            >
              <BookOpen size={16} weight="bold" />
              THE FIELD MANUAL
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-terminal-border p-4 text-center">
        <p className="text-terminal-muted/50 text-[10px] font-mono uppercase tracking-widest">
          Maintain the mesh &middot; Hold the signal &middot; Push back The Silence
        </p>
      </div>
    </main>
  );
}

// --- Main page ---

export default function Home() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [operatorCount, setOperatorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [xpRates, setXpRates] = useState<Record<string, number>>({});

  useEffect(() => {
    const client = getSupabase();

    async function load() {
      // Check auth
      const { data: { user: authUser } } = await client.auth.getUser();
      setUser(authUser);

      // Always load nodes for stats (public via RLS)
      const { data: nodeData } = await client.from("nodes").select("*").order("long_name");
      setNodes(nodeData ?? []);

      // Operator count
      const { count } = await client.from("profiles").select("id", { count: "exact", head: true }).eq("approved", true);
      setOperatorCount(count ?? 0);

      // Alerts only for authenticated users
      if (authUser) {
        const { data: alertData } = await client
          .from("alerts")
          .select("*")
          .eq("acknowledged", false)
          .order("created_at", { ascending: false });
        setAlerts(alertData ?? []);

        // XP rates (last hour)
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: xpData } = await client
          .from("xp_events")
          .select("node_id, xp_awarded")
          .gte("created_at", hourAgo);
        const rates: Record<string, number> = {};
        for (const row of xpData ?? []) {
          rates[row.node_id] = (rates[row.node_id] || 0) + row.xp_awarded;
        }
        setXpRates(rates);
      }

      setLoading(false);
    }
    load();

    const nodeChannel = client
      .channel("nodes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nodes" },
        (payload) => {
          const node = payload.new as unknown as Node;
          if (payload.eventType === "INSERT") {
            setNodes((prev) =>
              [...prev, node].sort((a, b) =>
                (a.long_name ?? a.id).localeCompare(b.long_name ?? b.id)
              )
            );
          } else if (payload.eventType === "UPDATE") {
            setNodes((prev) =>
              prev.map((n) => (n.id === node.id ? node : n))
            );
          }
        }
      )
      .subscribe();

    const alertChannel = client
      .channel("alerts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        async () => {
          const { data } = await client
            .from("alerts")
            .select("*")
            .eq("acknowledged", false)
            .order("created_at", { ascending: false });
          setAlerts(data ?? []);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(nodeChannel);
      client.removeChannel(alertChannel);
    };
  }, []);

  const onlineCount = nodes.filter((n) => n.is_online).length;

  // Loading state
  if (user === undefined || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-terminal-muted text-sm font-mono animate-pulse-glow">
          Scanning frequencies...
        </div>
      </main>
    );
  }

  // Unauthenticated → landing page
  if (!user) {
    return (
      <LandingPage
        stats={{
          totalNodes: nodes.length,
          onlineNodes: onlineCount,
          totalOperators: operatorCount,
        }}
      />
    );
  }

  // Authenticated → full dashboard
  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-terminal-green glow-green tracking-tight">
              THE SIGNAL
            </h1>
            <p className="text-terminal-muted text-xs font-mono mt-1">
              <Broadcast size={12} weight="bold" className="inline mr-1" />
              MESH NETWORK OPERATIONS — {nodes.length} NODES TRACKED
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/leaderboard"
              className="text-xs font-mono text-terminal-dim hover:text-terminal-green transition-colors hidden sm:inline"
            >
              [ REGISTRY ]
            </Link>
            <AuthNav />
          </div>
        </div>

        {/* Guild Health Score */}
        {nodes.length > 0 && (() => {
          const score = Math.round((onlineCount / nodes.length) * 100);
          let rank: string;
          let colorClass: string;
          if (score >= 90) { rank = "BATTLE READY"; colorClass = "text-terminal-green border-terminal-green/30 bg-terminal-green/5"; }
          else if (score >= 70) { rank = "OPERATIONAL"; colorClass = "text-terminal-dim border-terminal-dim/30 bg-terminal-dim/5"; }
          else if (score >= 50) { rank = "DEGRADED"; colorClass = "text-terminal-amber border-terminal-amber/30 bg-terminal-amber/5"; }
          else { rank = "CRITICAL"; colorClass = "text-terminal-red border-terminal-red/30 bg-terminal-red/5"; }
          return (
            <div className={`border rounded-lg p-3 mb-6 flex items-center justify-between font-mono ${colorClass}`}>
              <div className="text-[10px] uppercase tracking-widest opacity-75">ORDER STATUS</div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">{score}%</span>
                <span className="text-xs font-bold tracking-wider">{rank}</span>
                <span className="text-xs opacity-60">{onlineCount}/{nodes.length}</span>
              </div>
            </div>
          );
        })()}

        <AlertsBanner alerts={alerts} />

        {loading ? (
          <div className="text-terminal-muted text-sm font-mono animate-pulse-glow">
            Scanning frequencies...
          </div>
        ) : nodes.length === 0 ? (
          <div className="text-terminal-muted text-sm font-mono">
            No signal detected — awaiting radio transmission.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node, i) => (
              <NodeCard key={node.id} node={node} index={i} xpPerHour={xpRates[node.id] || 0} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}