"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase, Node, Achievement, Card, Profile, NodeOwnership, RARITY_COLORS, ACHIEVEMENT_LABELS } from "@/lib/supabase";
import { LevelBadge, XpProgressBar } from "@/components/level-badge";
import { formatDistanceToNow, format } from "date-fns";
import { ArrowLeft, WifiHigh, WifiSlash, UserCircle, Trophy, Cards, ChartLine, Terminal, Trash } from "@phosphor-icons/react";
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
      <div className="text-terminal-muted text-sm font-mono">No {label.toLowerCase()} data</div>
    );
  }

  return (
    <div className="panel p-4">
      <h3 className="text-terminal-dim text-xs font-mono font-bold uppercase tracking-widest mb-3">{label}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={filtered}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(t) => format(new Date(t), "HH:mm")}
            stroke="#4a5568"
            tick={{ fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          />
          <YAxis stroke="#4a5568" tick={{ fontSize: 11, fontFamily: "var(--font-geist-mono)" }} unit={unit} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#181b22",
              border: "1px solid #2a2f3a",
              borderRadius: "6px",
              fontFamily: "var(--font-geist-mono)",
              fontSize: "12px",
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
  const [isOfficer, setIsOfficer] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownership, setOwnership] = useState<NodeOwnership | null>(null);
  const [ownerCallsign, setOwnerCallsign] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const client = getSupabase();

    async function loadAuth() {
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        const { data: prof } = await client
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(prof);
        setIsOfficer(prof?.role === "leader" || prof?.role === "elder");
      }
    }
    loadAuth();

    async function load() {
      const [{ data: nodeData }, { data: telemData }, { data: achData }, { data: cardData }, { data: ownerData }] = await Promise.all([
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
        client
          .from("node_ownership")
          .select("*")
          .eq("node_id", nodeId)
          .limit(1)
          .maybeSingle(),
      ]);
      setNode(nodeData);
      setTelemetry(telemData ?? []);
      setAchievements(achData ?? []);
      setCards(cardData ?? []);
      if (ownerData) {
        setOwnership(ownerData);
        // Fetch owner callsign
        const { data: ownerProfile } = await client
          .from("profiles")
          .select("callsign")
          .eq("id", ownerData.player_id)
          .single();
        setOwnerCallsign(ownerProfile?.callsign ?? null);
      }
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
      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto text-terminal-muted text-sm font-mono animate-pulse-glow">Accessing node data...</div>
      </main>
    );
  }

  if (!node) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-terminal-muted text-sm font-mono">Node not found — signal lost</div>
          <Link href="/" className="text-terminal-green text-sm mt-2 inline-block font-mono">
            ← Return to operations
          </Link>
        </div>
      </main>
    );
  }

  const lastSeen = node.last_seen
    ? formatDistanceToNow(new Date(node.last_seen), { addSuffix: true })
    : "never";

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <Link
          href="/"
          className="text-terminal-muted hover:text-terminal-green text-xs mb-6 inline-flex items-center gap-1 font-mono transition-colors"
        >
          <ArrowLeft size={12} weight="bold" />
          OPERATIONS
        </Link>

        {/* Node header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {node.is_online ? (
              <WifiHigh size={24} weight="bold" className="text-terminal-green" />
            ) : (
              <WifiSlash size={24} weight="bold" className="text-terminal-red" />
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-mono text-foreground">
                {node.long_name ?? node.id}
              </h1>
              {node.short_name && (
                <span className="text-terminal-muted text-xs font-mono">{node.short_name}</span>
              )}
            </div>
          </div>
          <span
            className={`text-xs font-mono font-bold uppercase tracking-wider px-3 py-1 rounded border ${
              node.is_online
                ? "border-terminal-green/30 text-terminal-green bg-terminal-green/5"
                : "border-terminal-red/30 text-terminal-red bg-terminal-red/5"
            }`}
          >
            {node.is_online ? "ONLINE" : "GOING DARK"}
          </span>
        </div>

        {/* Live stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Last Signal</div>
            <div className="text-foreground text-sm font-mono mt-1">{lastSeen}</div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">RSSI</div>
            <div className="text-foreground text-sm font-mono mt-1">
              {node.rssi !== null ? `${node.rssi} dBm` : "—"}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">SNR</div>
            <div className="text-foreground text-sm font-mono mt-1">
              {node.snr !== null ? `${node.snr} dB` : "—"}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Battery</div>
            <div className="text-foreground text-sm font-mono mt-1">
              {node.battery_level !== null ? `${node.battery_level}%` : "—"}
            </div>
          </div>
        </div>

        {/* Lifetime Stats */}
        <h2 className="text-sm font-mono font-bold text-terminal-green uppercase tracking-widest mb-3 flex items-center gap-2">
          <ChartLine size={14} weight="bold" />
          NODE STATISTICS
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Total Packets</div>
            <div className="text-foreground text-lg font-bold font-mono mt-1">
              {(node.packets_total ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Last 24h</div>
            <div className="text-foreground text-lg font-bold font-mono mt-1">
              {(node.packets_24h ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Last 7 Days</div>
            <div className="text-foreground text-lg font-bold font-mono mt-1">
              {(node.packets_7d ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Uptime</div>
            <div className={`text-lg font-bold font-mono mt-1 ${
              node.uptime_pct !== null
                ? node.uptime_pct >= 90 ? "text-terminal-green"
                : node.uptime_pct >= 70 ? "text-terminal-amber"
                : "text-terminal-red"
                : "text-terminal-muted"
            }`}>
              {node.uptime_pct !== null ? `${node.uptime_pct}%` : "—"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Avg RSSI</div>
            <div className="text-foreground text-sm font-mono mt-1">
              {node.avg_rssi !== null ? `${node.avg_rssi} dBm` : "—"}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Best RSSI</div>
            <div className="text-terminal-green text-sm font-mono mt-1">
              {node.best_rssi !== null ? `${node.best_rssi} dBm` : "—"}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Avg SNR</div>
            <div className="text-foreground text-sm font-mono mt-1">
              {node.avg_snr !== null ? `${node.avg_snr} dB` : "—"}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Best SNR</div>
            <div className="text-terminal-green text-sm font-mono mt-1">
              {node.best_snr !== null ? `${node.best_snr} dB` : "—"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Battery Low</div>
            <div className={`text-sm font-mono mt-1 ${
              node.battery_min !== null
                ? node.battery_min >= 50 ? "text-terminal-green"
                : node.battery_min >= 20 ? "text-terminal-amber"
                : "text-terminal-red"
                : "text-terminal-muted"
            }`}>
              {node.battery_min !== null ? `${node.battery_min}%` : "—"}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Dark Events</div>
            <div className="text-foreground text-sm font-mono mt-1">
              {node.offline_count ?? 0}
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Current Streak</div>
            <div className="text-foreground text-sm font-mono mt-1">
              {node.current_streak_days ?? 0}d
            </div>
          </div>
          <div className="panel p-3">
            <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Best Streak</div>
            <div className="text-terminal-gold text-sm font-mono mt-1">
              {node.longest_streak_days ?? 0}d
            </div>
          </div>
        </div>

        {/* First seen */}
        {node.created_at && (
          <div className="text-terminal-muted text-xs font-mono mb-8">
            First signal {formatDistanceToNow(new Date(node.created_at), { addSuffix: true })} — {format(new Date(node.created_at), "MMM d, yyyy")}
          </div>
        )}

        {/* Node Ownership */}
        <div className="panel p-4 mb-8">
          <h2 className="text-sm font-mono font-bold text-terminal-gold uppercase tracking-widest mb-3 flex items-center gap-2">
            <UserCircle size={14} weight="bold" />
            OPERATOR
          </h2>
          {ownership ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-terminal-gold font-mono text-sm glow-gold">{ownerCallsign ?? "Unknown"}</span>
                <span className="text-terminal-muted text-xs font-mono ml-3">
                  claimed {formatDistanceToNow(new Date(ownership.claimed_at), { addSuffix: true })}
                </span>
              </div>
              {profile && ownership.player_id === profile.id && (
                <button
                  onClick={async () => {
                    const client = getSupabase();
                    await client.from("node_ownership").delete().eq("id", ownership.id);
                    if (profile.primary_node_id === nodeId) {
                      await client.from("profiles").update({ primary_node_id: null }).eq("id", profile.id);
                    }
                    setOwnership(null);
                    setOwnerCallsign(null);
                  }}
                  className="text-xs text-terminal-red hover:text-terminal-red/80 transition-colors font-mono"
                >
                  [ RELEASE ]
                </button>
              )}
            </div>
          ) : profile ? (
            <button
              onClick={async () => {
                setClaiming(true);
                const client = getSupabase();
                const { data, error } = await client
                  .from("node_ownership")
                  .insert({ player_id: profile.id, node_id: nodeId })
                  .select()
                  .single();
                if (!error && data) {
                  setOwnership(data);
                  setOwnerCallsign(profile.callsign);
                  if (!profile.primary_node_id) {
                    await client.from("profiles").update({ primary_node_id: nodeId }).eq("id", profile.id);
                  }
                }
                setClaiming(false);
              }}
              disabled={claiming}
              className="text-sm font-mono border border-terminal-gold/30 bg-terminal-gold/10 text-terminal-gold hover:bg-terminal-gold/20 px-4 py-2 rounded transition-colors disabled:opacity-50"
            >
              {claiming ? "CLAIMING..." : "CLAIM THIS NODE"}
            </button>
          ) : (
            <div className="text-terminal-muted text-sm font-mono">Sign in to claim this node</div>
          )}
        </div>

        {/* XP & Level */}
        <div className="panel p-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono font-bold text-terminal-green uppercase tracking-widest">PROGRESSION</h2>
            <LevelBadge xp={node.xp_total ?? 0} size="md" />
          </div>
          <XpProgressBar xp={node.xp_total ?? 0} />
        </div>

        {/* Commendations (Achievements) */}
        <h2 className="text-sm font-mono font-bold text-terminal-green uppercase tracking-widest mb-3 flex items-center gap-2">
          <Trophy size={14} weight="bold" />
          COMMENDATIONS
        </h2>
        {achievements.length === 0 ? (
          <div className="text-terminal-muted text-sm font-mono mb-8">No commendations earned yet.</div>
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
                  className="panel p-3 text-center"
                >
                  <div className="text-2xl mb-1">{label.emoji}</div>
                  <div className="text-foreground text-xs font-mono font-bold">
                    {label.name}
                  </div>
                  <div className="text-terminal-muted text-[10px] font-mono mt-1">
                    {new Date(ach.earned_at).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Relics (Card Collection) */}
        <h2 className="text-sm font-mono font-bold text-terminal-green uppercase tracking-widest mb-3 flex items-center gap-2">
          <Cards size={14} weight="bold" />
          RELICS
        </h2>
        {cards.length === 0 ? (
          <div className="text-terminal-muted text-sm font-mono mb-8">No relics collected yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {cards.map((card) => (
              <div
                key={card.id}
                className="panel p-3 border-terminal-border"
              >
                <div
                  className={`text-sm font-mono font-bold ${
                    RARITY_COLORS[card.rarity] || "text-terminal-muted"
                  }`}
                >
                  {card.card_name}
                </div>
                <div className="text-terminal-gold text-[10px] font-mono uppercase mt-1">{card.rarity}</div>
                <div className="text-terminal-muted text-[10px] font-mono mt-1">
                  {card.trigger_event}
                </div>
                <div className="text-terminal-muted/50 text-[10px] font-mono mt-1">
                  {new Date(card.earned_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Signal history charts */}
        <h2 className="text-sm font-mono font-bold text-terminal-green uppercase tracking-widest mb-3 flex items-center gap-2">
          <ChartLine size={14} weight="bold" />
          SIGNAL HISTORY
        </h2>
        <div className="grid grid-cols-1 gap-4 mb-8">
          <SignalChart
            data={telemetry}
            dataKey="rssi"
            label="RSSI"
            color="#00ff88"
            unit=" dBm"
          />
          <SignalChart
            data={telemetry}
            dataKey="snr"
            label="SNR"
            color="#d4a746"
            unit=" dB"
          />
          <SignalChart
            data={telemetry}
            dataKey="battery_level"
            label="Battery"
            color="#f0b429"
            unit="%"
          />
        </div>

        {/* Admin actions */}
        <h2 className="text-sm font-mono font-bold text-terminal-muted uppercase tracking-widest mb-3 flex items-center gap-2">
          <Terminal size={14} weight="bold" />
          ADMIN
        </h2>
        <div className="panel p-4 mb-8">
          <div className="text-foreground text-sm font-mono mb-2">Remote Reboot</div>
          <p className="text-terminal-muted text-xs font-mono mb-3">
            Sends a reboot command over LoRa mesh. Run from the host machine:
          </p>
          <code className="block bg-terminal-bg text-terminal-green text-xs p-3 rounded font-mono border border-terminal-border">
            python3 -m bots.reboot {node.id}
          </code>
        </div>

        {/* Stop Tracking — officer only */}
        {isOfficer && (
          <div className="panel border-terminal-red/30 p-4 mb-8">
            <div className="text-foreground text-sm font-mono mb-2 flex items-center gap-2">
              <Trash size={14} weight="bold" className="text-terminal-red" />
              Stop Tracking
            </div>
            <p className="text-terminal-muted text-xs font-mono mb-3">
              Remove this node and all telemetry from the dashboard. This cannot be undone.
            </p>
            {!confirmRemove ? (
              <button
                onClick={() => setConfirmRemove(true)}
                className="text-xs font-mono border border-terminal-red/30 bg-terminal-red/10 text-terminal-red hover:bg-terminal-red/20 px-3 py-1.5 rounded transition-colors"
              >
                STOP TRACKING THIS NODE
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
                    await client.from("node_ownership").delete().eq("node_id", nodeId);
                    await client.from("nodes").delete().eq("id", nodeId);
                    router.push("/");
                  }}
                  disabled={removing}
                  className="text-xs font-mono bg-terminal-red/80 hover:bg-terminal-red text-white px-3 py-1.5 rounded transition-colors"
                >
                  {removing ? "REMOVING..." : "CONFIRM REMOVE"}
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-xs font-mono text-terminal-muted hover:text-foreground transition-colors"
                >
                  CANCEL
                </button>
              </div>
            )}
          </div>
        )}

        {/* Node ID for reference */}
        <div className="text-terminal-border text-[10px] font-mono">{node.id}</div>
      </div>
    </main>
  );
}
