"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { getSupabase, Node, Achievement, Card, Profile, NodeOwnership, NodeLocation, RARITY_COLORS, ACHIEVEMENT_LABELS } from "@/lib/supabase";
import { LevelBadge, XpProgressBar } from "@/components/level-badge";
import { formatDistanceToNow, format } from "date-fns";
import { ArrowLeft, WifiHigh, WifiSlash, UserCircle, Trophy, Cards, ChartLine, Terminal, Trash, MapPin } from "@phosphor-icons/react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
  const [xpRate, setXpRate] = useState<{ perHour: number; today: number; breakdown: Record<string, number> } | null>(null);
  const [nodeLocation, setNodeLocation] = useState<NodeLocation | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationMode, setLocationMode] = useState<"idle" | "manual">("idle");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [hasGridPresenceBadge, setHasGridPresenceBadge] = useState(false);
  const [peerStats, setPeerStats] = useState<{ day: string; peers: number }[]>([]);
  const [recentPeers, setRecentPeers] = useState<{ nodeId: string; lastSeen: string; rssi: number | null }[]>([]);

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
        // Check if player already has GRID_PRESENCE badge
        const { data: badge } = await client
          .from("player_badges")
          .select("id")
          .eq("player_id", user.id)
          .eq("badge_key", "GRID_PRESENCE")
          .maybeSingle();
        setHasGridPresenceBadge(!!badge);
      }
    }
    loadAuth();

    async function load() {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      const [{ data: nodeData }, { data: telemData }, { data: achData }, { data: cardData }, { data: ownerData }, { data: xpHourData }, { data: xpTodayData }, { data: locationData }, { data: peerRaw }, { data: peerRecentRaw }] = await Promise.all([
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
        client
          .from("xp_events")
          .select("event_type, xp_awarded")
          .eq("node_id", nodeId)
          .gte("created_at", hourAgo),
        client
          .from("xp_events")
          .select("event_type, xp_awarded")
          .eq("node_id", nodeId)
          .gte("created_at", todayStart),
        client
          .from("node_locations")
          .select("*")
          .eq("node_id", nodeId)
          .maybeSingle(),
        client
          .from("telemetry")
          .select("timestamp, node_id")
          .neq("node_id", nodeId)
          .gte("timestamp", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        client
          .from("telemetry")
          .select("node_id, timestamp, rssi")
          .neq("node_id", nodeId)
          .gte("timestamp", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("timestamp", { ascending: false }),
      ]);

      // Compute XP rate
      const hourEvents = xpHourData ?? [];
      const todayEvents = xpTodayData ?? [];
      const perHour = hourEvents.reduce((sum: number, e: { xp_awarded: number }) => sum + e.xp_awarded, 0);
      const today = todayEvents.reduce((sum: number, e: { xp_awarded: number }) => sum + e.xp_awarded, 0);
      const breakdown: Record<string, number> = {};
      for (const e of hourEvents) {
        breakdown[e.event_type] = (breakdown[e.event_type] || 0) + e.xp_awarded;
      }
      setXpRate({ perHour, today, breakdown });
      setNode(nodeData);
      setTelemetry(telemData ?? []);
      setAchievements(achData ?? []);
      setCards(cardData ?? []);
      // Compute daily unique peer counts from raw telemetry
      const peerByDay: Record<string, Set<string>> = {};
      for (const row of (peerRaw ?? []) as { timestamp: string; node_id: string }[]) {
        const day = row.timestamp.slice(0, 10);
        if (!peerByDay[day]) peerByDay[day] = new Set();
        peerByDay[day].add(row.node_id);
      }
      // Fill last 30 days so chart has no gaps
      const peerDays: { day: string; peers: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        peerDays.push({ day: key.slice(5), peers: peerByDay[key]?.size ?? 0 });
      }
      setPeerStats(peerDays);

      // Compute most-recent contact per peer node (last 7 days)
      const peerLatest: Record<string, { lastSeen: string; rssi: number | null }> = {};
      for (const row of (peerRecentRaw ?? []) as { node_id: string; timestamp: string; rssi: number | null }[]) {
        if (!peerLatest[row.node_id]) {
          peerLatest[row.node_id] = { lastSeen: row.timestamp, rssi: row.rssi };
        }
      }
      const sorted = Object.entries(peerLatest)
        .map(([nodeId, v]) => ({ nodeId, lastSeen: v.lastSeen, rssi: v.rssi }))
        .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
      setRecentPeers(sorted);

      setNodeLocation(locationData ?? null);
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

  function fuzzCoord() { return (Math.random() - 0.5) * 0.018; } // ~1km offset

  async function saveLocation(lat: number, lng: number): Promise<boolean> {
    if (!profile) return false;
    const client = getSupabase();

    // Check if a row already exists for this node
    const { data: existing } = await client
      .from("node_locations")
      .select("id")
      .eq("node_id", nodeId)
      .maybeSingle();

    let writeError: { message: string } | null = null;

    if (existing) {
      const { data: updated, error } = await client
        .from("node_locations")
        .update({ lat, lng, opt_in: true, set_by: profile.id })
        .eq("node_id", nodeId)
        .select();
      writeError = error;
      console.log("[SAVE PIN] update result", { updated, error });
      if (!error && (!updated || updated.length === 0)) {
        toast.error("Could not update pin — you may not own this node");
        return false;
      }
    } else {
      const { data: inserted, error } = await client
        .from("node_locations")
        .insert({ node_id: nodeId, lat, lng, opt_in: true, set_by: profile.id })
        .select();
      writeError = error;
      console.log("[SAVE PIN] insert result", { inserted, error });
      if (!error && (!inserted || inserted.length === 0)) {
        toast.error("Could not save pin — you may not own this node");
        return false;
      }
    }

    if (writeError) {
      toast.error("Failed to save pin: " + writeError.message);
      return false;
    }

    // Re-fetch to hydrate state (avoids RLS read-back issues with upsert)
    const { data: fresh, error: fetchError } = await client
      .from("node_locations")
      .select("*")
      .eq("node_id", nodeId)
      .maybeSingle();
    console.log("[SAVE PIN] re-fetch", { fresh, fetchError });

    if (fresh) setNodeLocation(fresh as NodeLocation);
    return true;
  }

  async function handleUseApproximateLocation() {
    if (!profile) return;
    if (!navigator.geolocation) {
      setLocationMode("manual");
      return;
    }
    setSavingLocation(true);
    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const ok = await saveLocation(
            pos.coords.latitude + fuzzCoord(),
            pos.coords.longitude + fuzzCoord()
          );
          if (ok) toast.success("Grid position set");
          setSavingLocation(false);
        },
        () => {
          // Geolocation denied/unavailable — fall back to manual entry
          setLocationMode("manual");
          setSavingLocation(false);
        },
        { timeout: 10000, enableHighAccuracy: false }
      );
    } catch {
      setLocationMode("manual");
      setSavingLocation(false);
    }
  }

  async function handleManualSave() {
    console.log("[SAVE PIN] clicked", { profile: !!profile, manualLat, manualLng, savingLocation });
    if (!profile || !manualLat || !manualLng) {
      console.log("[SAVE PIN] early return — missing profile/lat/lng");
      return;
    }
    const parsedLat = parseFloat(manualLat);
    const parsedLng = parseFloat(manualLng);
    console.log("[SAVE PIN] parsed", { parsedLat, parsedLng });
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      toast.error("Enter valid lat/lng coordinates");
      return;
    }
    setSavingLocation(true);
    const ok = await saveLocation(parsedLat + fuzzCoord(), parsedLng + fuzzCoord());
    if (ok) {
      setLocationMode("idle");
      toast.success("Pin saved — location on the guild map");
    }
    setSavingLocation(false);
  }

  async function handleOptOut() {
    if (!profile) return;
    setSavingLocation(true);
    const client = getSupabase();
    const { data } = await client
      .from("node_locations")
      .update({ opt_in: false })
      .eq("node_id", nodeId)
      .select()
      .single();
    if (data) setNodeLocation(data as NodeLocation);
    setSavingLocation(false);
  }

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

        {/* Radio Reach */}
        {peerStats.length > 0 && (
          <div className="panel p-4 mb-8">
            <h2 className="text-sm font-mono font-bold text-terminal-cyan uppercase tracking-widest mb-4 flex items-center gap-2">
              <WifiHigh size={14} weight="bold" />
              RADIO REACH
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Today</div>
                <div className="text-terminal-cyan text-2xl font-bold font-mono mt-1">
                  {peerStats[peerStats.length - 1]?.peers ?? 0}
                </div>
              </div>
              <div>
                <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">This Week</div>
                <div className="text-foreground text-2xl font-bold font-mono mt-1">
                  {Math.max(...peerStats.slice(-7).map((d) => d.peers))}
                </div>
              </div>
              <div>
                <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">30-Day Peak</div>
                <div className="text-terminal-gold text-2xl font-bold font-mono mt-1">
                  {Math.max(...peerStats.map((d) => d.peers))}
                </div>
              </div>
            </div>
            <p className="text-terminal-muted text-[10px] font-mono mb-3 uppercase tracking-widest">
              Unique nodes heard per day (last 30 days)
            </p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={peerStats} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={false}
                  interval={6}
                />
                <YAxis
                  tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ background: "#0d0f14", border: "1px solid #333", borderRadius: 4, fontFamily: "monospace", fontSize: 11 }}
                  labelStyle={{ color: "#00c8ff" }}
                  itemStyle={{ color: "#00c8ff" }}
                  formatter={(v) => [`${v} node${v !== 1 ? "s" : ""}`, "Heard"]}
                />
                <Bar dataKey="peers" radius={[2, 2, 0, 0]}>
                  {peerStats.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.peers === Math.max(...peerStats.map((d) => d.peers)) ? "#00c8ff" : "#1a4a5a"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Recent peer list */}
            {recentPeers.length > 0 && (
              <div className="mt-4 border-t border-terminal-border pt-3">
                <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono mb-2">Recently Heard (last 7 days)</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {recentPeers.map((p) => {
                    const age = Date.now() - new Date(p.lastSeen).getTime();
                    const isToday = age < 24 * 60 * 60 * 1000;
                    return (
                      <div key={p.nodeId} className="flex items-center justify-between text-xs font-mono">
                        <Link href={`/node/${p.nodeId}`} className={`hover:underline ${isToday ? "text-terminal-cyan" : "text-terminal-muted"}`}>{p.nodeId}</Link>
                        <div className="flex items-center gap-3">
                          {p.rssi !== null && (
                            <span className="text-terminal-muted">{p.rssi} dBm</span>
                          )}
                          <span className={isToday ? "text-terminal-green" : "text-terminal-muted"}>
                            {formatDistanceToNow(new Date(p.lastSeen), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {recentPeers.length === 0 && (
              <div className="mt-4 border-t border-terminal-border pt-3 text-terminal-muted text-xs font-mono">
                No peer contacts in the last 7 days. Check that the collector is running.
              </div>
            )}
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

        {/* Grid Position — owner only */}
        {profile && ownership && ownership.player_id === profile.id && (
          <div className="panel p-4 mb-8">
            <h2 className="text-sm font-mono font-bold text-terminal-cyan uppercase tracking-widest mb-3 flex items-center gap-2">
              <MapPin size={14} weight="bold" />
              GRID POSITION
            </h2>

            <p className="text-terminal-muted text-xs font-mono mb-4 leading-relaxed">
              Your approximate location is visible only to approved guild operators.
              We store a fuzzed position (~1km offset) — never your precise coordinates.
            </p>

            {!hasGridPresenceBadge && (!nodeLocation || !nodeLocation.opt_in) && (
              <div className="text-xs font-mono text-terminal-cyan border border-terminal-cyan/20 bg-terminal-cyan/5 rounded px-3 py-2 mb-4">
                Share your location to earn the <span className="font-bold">GRID_PRESENCE</span> commendation badge.
              </div>
            )}

            {nodeLocation && nodeLocation.opt_in ? (
              <div>
                <div className="text-xs font-mono text-terminal-green mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-terminal-green inline-block" />
                  Location on map (approximate)
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleUseApproximateLocation}
                    disabled={savingLocation}
                    className="text-xs font-mono border border-terminal-border text-terminal-muted hover:text-terminal-dim px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    {savingLocation ? "UPDATING..." : "UPDATE"}
                  </button>
                  <button
                    onClick={() => { setSavingLocation(false); setManualLat(""); setManualLng(""); setLocationMode(locationMode === "manual" ? "idle" : "manual"); }}
                    className="text-xs font-mono border border-terminal-border text-terminal-muted hover:text-terminal-dim px-3 py-1.5 rounded transition-colors"
                  >
                    MANUAL PIN
                  </button>
                  <button
                    onClick={handleOptOut}
                    disabled={savingLocation}
                    className="text-xs font-mono border border-terminal-red/20 text-terminal-red/70 hover:text-terminal-red px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    OPT OUT
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleUseApproximateLocation}
                  disabled={savingLocation}
                  className="w-full text-sm font-mono border border-terminal-cyan/30 bg-terminal-cyan/10 text-terminal-cyan hover:bg-terminal-cyan/20 px-4 py-2.5 rounded transition-colors disabled:opacity-50"
                >
                  {savingLocation && locationMode === "idle" ? "LOCATING..." : "USE MY APPROXIMATE LOCATION"}
                </button>
                <button
                  onClick={() => { setSavingLocation(false); setManualLat(""); setManualLng(""); setLocationMode(locationMode === "manual" ? "idle" : "manual"); }}
                  className="w-full text-xs font-mono border border-terminal-border text-terminal-muted hover:text-terminal-dim px-4 py-2 rounded transition-colors"
                >
                  PLACE PIN MANUALLY
                </button>
              </div>
            )}

            {locationMode === "manual" && (
              <div className="mt-3 border border-terminal-border rounded p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-terminal-muted text-[10px] font-mono uppercase tracking-widest block mb-1">Latitude</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                      placeholder="35.4676"
                      className="w-full bg-background border border-terminal-border text-foreground text-xs font-mono px-2 py-1.5 rounded focus:outline-none focus:border-terminal-cyan/50"
                    />
                  </div>
                  <div>
                    <label className="text-terminal-muted text-[10px] font-mono uppercase tracking-widest block mb-1">Longitude</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                      placeholder="-97.5164"
                      className="w-full bg-background border border-terminal-border text-foreground text-xs font-mono px-2 py-1.5 rounded focus:outline-none focus:border-terminal-cyan/50"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleManualSave}
                    disabled={savingLocation || !manualLat.trim() || !manualLng.trim()}
                    className="flex-1 text-xs font-mono border border-terminal-cyan/30 bg-terminal-cyan/10 text-terminal-cyan hover:bg-terminal-cyan/20 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    {savingLocation && locationMode === "manual" ? "SAVING..." : "SAVE PIN"}
                  </button>
                  <button
                    onClick={() => setLocationMode("idle")}
                    className="text-xs font-mono border border-terminal-border text-terminal-muted hover:text-terminal-dim px-3 py-1.5 rounded transition-colors"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* XP & Level */}
        <div className="panel p-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono font-bold text-terminal-green uppercase tracking-widest">PROGRESSION</h2>
            <LevelBadge xp={node.xp_total ?? 0} size="md" />
          </div>
          <XpProgressBar xp={node.xp_total ?? 0} />

          {/* XP Rate */}
          {xpRate && (
            <div className="mt-4 border-t border-terminal-border pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">RN / HOUR</div>
                  <div className={`text-lg font-bold font-mono mt-1 ${
                    xpRate.perHour > 0 ? "text-terminal-green" : "text-terminal-muted"
                  }`}>
                    +{xpRate.perHour.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">RN TODAY</div>
                  <div className="text-foreground text-lg font-bold font-mono mt-1">
                    +{xpRate.today.toLocaleString()}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">THIS HOUR</div>
                  <div className="text-xs font-mono mt-1 space-y-0.5">
                    {Object.keys(xpRate.breakdown).length === 0 ? (
                      <span className="text-terminal-muted">No activity</span>
                    ) : (
                      Object.entries(xpRate.breakdown).map(([type, xp]) => (
                        <div key={type} className="flex justify-between">
                          <span className="text-terminal-muted">{type.replace("_", " ")}</span>
                          <span className="text-terminal-green">+{xp}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
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
