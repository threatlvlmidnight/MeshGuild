"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase, Node, Achievement, Card, RARITY_COLORS, RARITY_BG, ACHIEVEMENT_LABELS } from "@/lib/supabase";
import { LevelBadge, XpProgressBar } from "@/components/level-badge";
import { formatDistanceToNow, format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TelemetryPoint {
  timestamp: string;
  rssi: number | null;
  snr: number | null;
  battery_level: number | null;
}

function SignalChart({
  data,
  dataKey,
  label,
  color,
  unit,
}: {
  data: TelemetryPoint[];
  dataKey: string;
  label: string;
  color: string;
  unit: string;
}) {
  const filtered = data.filter(
    (d) => d[dataKey as keyof TelemetryPoint] !== null
  );
  if (filtered.length === 0) {
    return (
      <div className="text-gray-500 text-sm">No {label.toLowerCase()} data</div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h3 className="text-gray-300 text-sm font-semibold mb-3">{label}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={filtered}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(t) => format(new Date(t), "HH:mm")}
            stroke="#6b7280"
            tick={{ fontSize: 11 }}
          />
          <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} unit={unit} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "6px",
            }}
            labelFormatter={(t) => format(new Date(t as string), "MMM d, HH:mm")}
            formatter={(value) => [`${value}${unit}`, label]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function NodeDetail() {
  const params = useParams();
  const router = useRouter();
  const nodeId = decodeURIComponent(params.id as string);

  const [node, setNode] = useState<Node | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const client = getSupabase();

    async function loadAuth() {
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        const { data: profile, error } = await client
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (error) {
          console.error("Profile fetch error:", error);
        }
        setIsAdmin(profile?.role === "admin");
      }
    }
    loadAuth();

    async function load() {
      const [{ data: nodeData }, { data: telemData }, { data: achData }, { data: cardData }] = await Promise.all([
        client.from("nodes").select("*").eq("id", nodeId).single(),
        client
          .from("telemetry")
          .select("timestamp, rssi, snr, battery_level")
          .eq("node_id", nodeId)
          .order("timestamp", { ascending: true })
          .limit(500),
        client
          .from("achievements")
          .select("*")
          .eq("node_id", nodeId)
          .order("earned_at", { ascending: false }),
        client
          .from("cards")
          .select("*")
          .eq("node_id", nodeId)
          .order("earned_at", { ascending: false }),
      ]);
      setNode(nodeData);
      setTelemetry(telemData ?? []);
      setAchievements(achData ?? []);
      setCards(cardData ?? []);
      setLoading(false);
    }
    load();

    // Realtime updates for this node
    const channel = client
      .channel(`node-${nodeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "nodes",
          filter: `id=eq.${nodeId}`,
        },
        (payload) => {
          setNode(payload.new as unknown as Node);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [nodeId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto text-gray-400 text-sm">Loading...</div>
      </main>
    );
  }

  if (!node) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-gray-400 text-sm">Node not found</div>
          <Link href="/" className="text-blue-400 text-sm mt-2 inline-block">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const lastSeen = node.last_seen
    ? formatDistanceToNow(new Date(node.last_seen), { addSuffix: true })
    : "never";

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <Link
          href="/"
          className="text-gray-400 hover:text-gray-200 text-sm mb-6 inline-block"
        >
          &larr; Back to dashboard
        </Link>

        {/* Node header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              {node.long_name ?? node.id}
            </h1>
            {node.short_name && (
              <span className="text-gray-400 text-sm">{node.short_name}</span>
            )}
          </div>
          <span
            className={`text-sm font-medium px-3 py-1 rounded-full ${
              node.is_online
                ? "bg-green-900 text-green-300"
                : "bg-red-900 text-red-300"
            }`}
          >
            {node.is_online ? "Online" : "Offline"}
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 text-xs uppercase">Last Seen</div>
            <div className="text-white text-sm font-mono mt-1">{lastSeen}</div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 text-xs uppercase">RSSI</div>
            <div className="text-white text-sm font-mono mt-1">
              {node.rssi !== null ? `${node.rssi} dBm` : "—"}
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 text-xs uppercase">SNR</div>
            <div className="text-white text-sm font-mono mt-1">
              {node.snr !== null ? `${node.snr} dB` : "—"}
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 text-xs uppercase">Battery</div>
            <div className="text-white text-sm font-mono mt-1">
              {node.battery_level !== null ? `${node.battery_level}%` : "—"}
            </div>
          </div>
        </div>

        {/* XP & Level */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Progression</h2>
            <LevelBadge xp={node.xp_total ?? 0} size="md" />
          </div>
          <XpProgressBar xp={node.xp_total ?? 0} />
        </div>

        {/* Achievements */}
        <h2 className="text-lg font-semibold mb-4">Achievements</h2>
        {achievements.length === 0 ? (
          <div className="text-gray-500 text-sm mb-8">No achievements earned yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {achievements.map((ach) => {
              const label = ACHIEVEMENT_LABELS[ach.achievement_key] || {
                name: ach.achievement_key,
                emoji: "🏆",
              };
              return (
                <div
                  key={ach.id}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center"
                >
                  <div className="text-2xl mb-1">{label.emoji}</div>
                  <div className="text-white text-sm font-semibold">
                    {label.name}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
                    {new Date(ach.earned_at).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Card Collection */}
        <h2 className="text-lg font-semibold mb-4">Card Collection</h2>
        {cards.length === 0 ? (
          <div className="text-gray-500 text-sm mb-8">No cards collected yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {cards.map((card) => (
              <div
                key={card.id}
                className={`border border-gray-700 rounded-lg p-3 ${
                  RARITY_BG[card.rarity] || "bg-gray-800"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    RARITY_COLORS[card.rarity] || "text-gray-300"
                  }`}
                >
                  {card.card_name}
                </div>
                <div className="text-gray-400 text-xs mt-1">{card.rarity}</div>
                <div className="text-gray-500 text-xs mt-1">
                  {card.trigger_event}
                </div>
                <div className="text-gray-600 text-xs mt-1">
                  {new Date(card.earned_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Signal history charts */}
        <h2 className="text-lg font-semibold mb-4">Signal History</h2>
        <div className="grid grid-cols-1 gap-4 mb-8">
          <SignalChart
            data={telemetry}
            dataKey="rssi"
            label="RSSI"
            color="#22d3ee"
            unit=" dBm"
          />
          <SignalChart
            data={telemetry}
            dataKey="snr"
            label="SNR"
            color="#a78bfa"
            unit=" dB"
          />
          <SignalChart
            data={telemetry}
            dataKey="battery_level"
            label="Battery"
            color="#4ade80"
            unit="%"
          />
        </div>

        {/* Admin actions */}
        <h2 className="text-lg font-semibold mb-4">Admin</h2>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-8">
          <div className="text-gray-300 text-sm mb-2">Remote Reboot</div>
          <p className="text-gray-500 text-xs mb-3">
            Sends a reboot command over LoRa mesh. Run from the host machine:
          </p>
          <code className="block bg-gray-900 text-green-400 text-xs p-3 rounded font-mono">
            python3 -m bots.reboot {node.id}
          </code>
        </div>

        {/* Stop Tracking — admin only */}
        {isAdmin && (
          <div className="bg-gray-800 border border-red-900 rounded-lg p-4 mb-8">
            <div className="text-gray-300 text-sm mb-2">Stop Tracking</div>
            <p className="text-gray-500 text-xs mb-3">
              Remove this node and all its telemetry and alerts from the dashboard.
              This cannot be undone.
            </p>
            {!confirmRemove ? (
              <button
                onClick={() => setConfirmRemove(true)}
                className="text-xs bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded transition-colors"
              >
                Stop Tracking This Node
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setRemoving(true);
                    const client = getSupabase();
                    await client.from("telemetry").delete().eq("node_id", nodeId);
                    await client.from("alerts").delete().eq("node_id", nodeId);
                    await client.from("xp_events").delete().eq("node_id", nodeId);
                    await client.from("achievements").delete().eq("node_id", nodeId);
                    await client.from("cards").delete().eq("node_id", nodeId);
                    await client.from("nodes").delete().eq("id", nodeId);
                    router.push("/");
                  }}
                  disabled={removing}
                  className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded transition-colors"
                >
                  {removing ? "Removing..." : "Confirm Remove"}
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Node ID for reference */}
        <div className="text-gray-600 text-xs font-mono">{node.id}</div>
      </div>
    </main>
  );
}
