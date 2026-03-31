"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Node, Alert } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import AuthNav from "@/components/auth-nav";
import { LevelBadge } from "@/components/level-badge";

// --- Color helpers ---

function rssiColor(rssi: number | null): string {
  if (rssi === null) return "text-gray-400";
  if (rssi > -100) return "text-green-400";
  if (rssi >= -110) return "text-yellow-400";
  return "text-red-400";
}

function snrColor(snr: number | null): string {
  if (snr === null) return "text-gray-400";
  if (snr > -10) return "text-green-400";
  if (snr >= -15) return "text-yellow-400";
  return "text-red-400";
}

function batteryColor(level: number | null): string {
  if (level === null) return "text-gray-400";
  if (level > 50) return "text-green-400";
  if (level >= 20) return "text-yellow-400";
  return "text-red-400";
}

// --- Node card ---

function NodeCard({ node }: { node: Node }) {
  const lastSeen = node.last_seen
    ? formatDistanceToNow(new Date(node.last_seen), { addSuffix: true })
    : "never";

  return (
    <Link href={`/node/${encodeURIComponent(node.id)}`} className="block">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col gap-3 hover:border-gray-500 transition-colors">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-semibold text-sm">
              {node.long_name ?? node.id}
            </div>
            {node.short_name && (
              <div className="text-gray-400 text-xs">{node.short_name}</div>
            )}
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              node.is_online
                ? "bg-green-900 text-green-300"
                : "bg-red-900 text-red-300"
            }`}
          >
            {node.is_online ? "Online" : "Offline"}
          </span>
        </div>

        <div className="text-gray-400 text-xs">Last seen {lastSeen}</div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-500 uppercase tracking-wide mb-0.5">RSSI</div>
            <div className={`font-mono font-semibold ${rssiColor(node.rssi)}`}>
              {node.rssi !== null ? `${node.rssi} dBm` : "—"}
            </div>
          </div>
          <div>
            <div className="text-gray-500 uppercase tracking-wide mb-0.5">SNR</div>
            <div className={`font-mono font-semibold ${snrColor(node.snr)}`}>
              {node.snr !== null ? `${node.snr} dB` : "—"}
            </div>
          </div>
          {node.battery_level !== null && (
            <div>
              <div className="text-gray-500 uppercase tracking-wide mb-0.5">BAT</div>
              <div className={`font-mono font-semibold ${batteryColor(node.battery_level)}`}>
                {node.battery_level}%
              </div>
            </div>
          )}
        </div>

        {/* Level badge */}
        <div className="flex items-center justify-between">
          <LevelBadge xp={node.xp_total ?? 0} />
          <span className="text-gray-500 text-xs font-mono">
            {(node.xp_total ?? 0).toLocaleString()} XP
          </span>
        </div>
      </div>
    </Link>
  );
}

// --- Alerts banner ---

function AlertsBanner({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  return (
    <Link href="/alerts" className="block">
      <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-4 mb-6 hover:border-yellow-500 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <div className="text-yellow-300 font-semibold text-sm">
            {alerts.length} Active Alert{alerts.length > 1 ? "s" : ""}
          </div>
          <span className="text-yellow-400 text-xs">View all &rarr;</span>
        </div>
        <ul className="space-y-1">
          {alerts.slice(0, 3).map((alert) => (
            <li key={alert.id} className="text-yellow-200 text-xs">
              <span className="font-mono text-yellow-400">[{alert.alert_type}]</span>{" "}
              {alert.message}
            </li>
          ))}
          {alerts.length > 3 && (
            <li className="text-yellow-400 text-xs">+{alerts.length - 3} more</li>
          )}
        </ul>
      </div>
    </Link>
  );
}

// --- Main page ---

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getSupabase();

    async function load() {
      const [{ data: nodeData }, { data: alertData }] = await Promise.all([
        client.from("nodes").select("*").order("long_name"),
        client
          .from("alerts")
          .select("*")
          .eq("acknowledged", false)
          .order("created_at", { ascending: false }),
      ]);
      setNodes(nodeData ?? []);
      setAlerts(alertData ?? []);
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

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">MeshGuild</h1>
            <p className="text-gray-400 text-sm mt-1">OKC Crew — Node Health</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/leaderboard"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Leaderboard
            </Link>
            <AuthNav />
          </div>
        </div>

        {/* Guild Health Score */}
        {nodes.length > 0 && (() => {
          const onlineCount = nodes.filter((n) => n.is_online).length;
          const score = Math.round((onlineCount / nodes.length) * 100);
          let rank: string;
          let color: string;
          if (score >= 90) { rank = "Battle Ready"; color = "text-green-400 border-green-700 bg-green-900/30"; }
          else if (score >= 70) { rank = "Operational"; color = "text-blue-400 border-blue-700 bg-blue-900/30"; }
          else if (score >= 50) { rank = "Degraded"; color = "text-yellow-400 border-yellow-700 bg-yellow-900/30"; }
          else { rank = "Critical"; color = "text-red-400 border-red-700 bg-red-900/30"; }
          return (
            <div className={`border rounded-lg p-3 mb-6 flex items-center justify-between ${color}`}>
              <div className="text-xs uppercase tracking-wide opacity-75">Guild Health</div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold">{score}%</span>
                <span className="text-sm font-semibold">{rank}</span>
              </div>
            </div>
          );
        })()}

        <AlertsBanner alerts={alerts} />

        {loading ? (
          <div className="text-gray-400 text-sm">Loading nodes...</div>
        ) : nodes.length === 0 ? (
          <div className="text-gray-400 text-sm">
            No nodes yet — waiting for radio data.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node) => (
              <NodeCard key={node.id} node={node} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}