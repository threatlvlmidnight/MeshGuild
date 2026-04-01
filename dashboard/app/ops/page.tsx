"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getSupabase, Profile } from "@/lib/supabase";
import {
  ArrowLeft,
  Wrench,
  ArrowClockwise,
  CircleNotch,
  CheckCircle,
  XCircle,
  Heartbeat,
  Clock,
  Terminal,
  FunnelSimple,
  ArrowDown,
  ArrowUp,
} from "@phosphor-icons/react";
import { formatDistanceToNow, format } from "date-fns";

interface OpsCommand {
  id: number;
  command: string;
  requested_by: string;
  status: string;
  result: string | null;
  created_at: string;
  executed_at: string | null;
}

interface CollectorHeartbeat {
  id: string;
  last_beat: string;
  status: string;
  started_at: string;
  pid: number | null;
}

interface CollectorLog {
  id: number;
  level: string;
  category: string;
  message: string;
  node_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface MessageVector {
  id: number;
  direction: string;
  from_node_id: string | null;
  to_node_id: string | null;
  channel_index: number;
  network_id: string;
  player_id: string | null;
  created_at: string;
}

const COMMANDS = [
  {
    id: "REBOOT_COLLECTOR",
    label: "Reboot Collector",
    description: "Restarts the MQTT collector process via the runner wrapper.",
    icon: ArrowClockwise,
  },
  {
    id: "RESTART_MOSQUITTO",
    label: "Restart Mosquitto",
    description: "Restarts the local MQTT broker (brew services restart).",
    icon: ArrowClockwise,
  },
];

export default function OpsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commands, setCommands] = useState<OpsCommand[]>([]);
  const [heartbeat, setHeartbeat] = useState<CollectorHeartbeat | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [confirmCmd, setConfirmCmd] = useState<string | null>(null);
  const [logs, setLogs] = useState<CollectorLog[]>([]);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logLevel, setLogLevel] = useState<string>("all");
  const [logSearch, setLogSearch] = useState<string>("");
  const [logLimit, setLogLimit] = useState(100);
  const [vectors, setVectors] = useState<MessageVector[]>([]);
  const [vectorDir, setVectorDir] = useState<string>("all");
  const [vectorNode, setVectorNode] = useState<string>("");

  const loadData = useCallback(async () => {
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!prof || (prof.role !== "leader" && prof.role !== "elder")) {
      setError("Access denied — elder or leader role required");
      setLoading(false);
      return;
    }

    setProfile(prof);

    // Load recent commands
    const { data: cmdData } = await supabase
      .from("ops_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setCommands(cmdData ?? []);

    // Load heartbeat
    const { data: hbData } = await supabase
      .from("collector_heartbeat")
      .select("*")
      .eq("id", "main")
      .single();
    setHeartbeat(hbData);

    // Load logs
    const { data: logData } = await supabase
      .from("collector_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setLogs(logData ?? []);

    // Load message vectors
    const { data: vecData } = await supabase
      .from("message_vectors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setVectors(vecData ?? []);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    // Refresh heartbeat every 15s
    const interval = setInterval(async () => {
      const supabase = getSupabase();
      const { data: hbData } = await supabase
        .from("collector_heartbeat")
        .select("*")
        .eq("id", "main")
        .single();
      setHeartbeat(hbData);

      // Refresh command statuses
      const { data: cmdData } = await supabase
        .from("ops_commands")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      setCommands(cmdData ?? []);

      // Refresh logs
      const { data: logData } = await supabase
        .from("collector_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setLogs(logData ?? []);

      // Refresh vectors
      const { data: vecData } = await supabase
        .from("message_vectors")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setVectors(vecData ?? []);
    }, 15000);

    return () => clearInterval(interval);
  }, [loadData]);

  async function sendCommand(command: string) {
    if (!profile) return;
    setSending(command);
    setConfirmCmd(null);

    const supabase = getSupabase();
    const { error: insertErr } = await supabase.from("ops_commands").insert({
      command,
      requested_by: profile.id,
    });

    if (insertErr) {
      setError(`Failed to send command: ${insertErr.message}`);
      setSending(null);
      return;
    }

    // Refresh commands list
    const { data: cmdData } = await supabase
      .from("ops_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setCommands(cmdData ?? []);
    setSending(null);
  }

  function collectorStatus(): { label: string; color: string; alive: boolean } {
    if (!heartbeat) return { label: "UNKNOWN", color: "text-terminal-muted", alive: false };

    const lastBeat = new Date(heartbeat.last_beat);
    const ageMs = Date.now() - lastBeat.getTime();
    const ageSec = ageMs / 1000;

    if (ageSec < 60) return { label: "ONLINE", color: "text-terminal-green", alive: true };
    if (ageSec < 300) return { label: "STALE", color: "text-terminal-amber", alive: true };
    return { label: "OFFLINE", color: "text-terminal-red", alive: false };
  }

  function statusIcon(status: string) {
    switch (status) {
      case "completed":
        return <CheckCircle size={14} weight="bold" className="text-terminal-green" />;
      case "failed":
        return <XCircle size={14} weight="bold" className="text-terminal-red" />;
      case "executing":
        return <CircleNotch size={14} weight="bold" className="text-terminal-amber animate-spin" />;
      default:
        return <Clock size={14} weight="bold" className="text-terminal-muted" />;
    }
  }

  function statusColor(status: string) {
    switch (status) {
      case "completed": return "text-terminal-green";
      case "failed": return "text-terminal-red";
      case "executing": return "text-terminal-amber";
      default: return "text-terminal-muted";
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto text-terminal-muted text-sm font-mono animate-pulse-glow">
          Accessing ops controls...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <div className="border border-terminal-red/30 bg-terminal-red/5 rounded-lg p-4 text-terminal-red text-sm font-mono mb-4">
            {error}
          </div>
          <Link
            href="/"
            className="text-terminal-green text-xs font-mono hover:text-terminal-green/80"
          >
            ← Return to operations
          </Link>
        </div>
      </main>
    );
  }

  const status = collectorStatus();

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-terminal-muted hover:text-terminal-green text-xs mb-6 inline-flex items-center gap-1 font-mono transition-colors"
        >
          <ArrowLeft size={12} weight="bold" />
          OPERATIONS
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold font-mono text-terminal-green glow-green mb-6 flex items-center gap-2">
          <Wrench size={20} weight="bold" />
          OPS CONTROL
        </h1>

        {/* Collector Status */}
        <div className="panel p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono font-bold text-terminal-muted uppercase tracking-widest flex items-center gap-2">
              <Heartbeat size={16} weight="bold" className={status.color} />
              COLLECTOR STATUS
            </h2>
            <span
              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                status.alive
                  ? status.label === "STALE"
                    ? "border-terminal-amber/30 text-terminal-amber bg-terminal-amber/5"
                    : "border-terminal-green/30 text-terminal-green bg-terminal-green/5"
                  : "border-terminal-red/30 text-terminal-red bg-terminal-red/5"
              }`}
            >
              {status.label}
            </span>
          </div>
          {heartbeat ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <div className="text-terminal-muted uppercase tracking-widest text-[10px] mb-0.5">
                  LAST HEARTBEAT
                </div>
                <div className={status.color}>
                  {formatDistanceToNow(new Date(heartbeat.last_beat), {
                    addSuffix: true,
                  })}
                </div>
              </div>
              <div>
                <div className="text-terminal-muted uppercase tracking-widest text-[10px] mb-0.5">
                  UPTIME
                </div>
                <div className="text-foreground">
                  {formatDistanceToNow(new Date(heartbeat.started_at))}
                </div>
              </div>
              <div>
                <div className="text-terminal-muted uppercase tracking-widest text-[10px] mb-0.5">
                  PID
                </div>
                <div className="text-foreground">{heartbeat.pid ?? "—"}</div>
              </div>
            </div>
          ) : (
            <div className="text-terminal-muted text-xs font-mono">
              No heartbeat data — collector may not have started yet.
            </div>
          )}
        </div>

        {/* Command Buttons */}
        <div className="mb-6">
          <h2 className="text-sm font-mono font-bold text-terminal-muted uppercase tracking-widest mb-3">
            CONTROLS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMMANDS.map((cmd) => {
              const Icon = cmd.icon;
              const isConfirming = confirmCmd === cmd.id;
              const isSending = sending === cmd.id;

              return (
                <div key={cmd.id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-mono font-bold text-foreground flex items-center gap-2">
                        <Icon
                          size={16}
                          weight="bold"
                          className={isSending ? "animate-spin text-terminal-amber" : "text-terminal-green"}
                        />
                        {cmd.label}
                      </div>
                      <div className="text-terminal-muted text-xs font-mono mt-1">
                        {cmd.description}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => sendCommand(cmd.id)}
                            disabled={isSending}
                            className="text-[10px] font-mono font-bold border border-terminal-red/50 bg-terminal-red/10 text-terminal-red hover:bg-terminal-red/20 px-2 py-1 rounded transition-colors"
                          >
                            CONFIRM
                          </button>
                          <button
                            onClick={() => setConfirmCmd(null)}
                            className="text-[10px] font-mono font-bold border border-terminal-border text-terminal-muted hover:text-foreground px-2 py-1 rounded transition-colors"
                          >
                            CANCEL
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmCmd(cmd.id)}
                          disabled={isSending}
                          className="text-[10px] font-mono font-bold border border-terminal-amber/40 bg-terminal-amber/10 text-terminal-amber hover:bg-terminal-amber/20 px-3 py-1 rounded transition-colors disabled:opacity-50"
                        >
                          {isSending ? "SENDING..." : "EXECUTE"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Command Log */}
        <div>
          <h2 className="text-sm font-mono font-bold text-terminal-muted uppercase tracking-widest mb-3">
            COMMAND LOG
          </h2>
          {commands.length === 0 ? (
            <div className="panel p-4 text-terminal-muted text-xs font-mono">
              No commands have been issued yet.
            </div>
          ) : (
            <div className="space-y-1">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="panel px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {statusIcon(cmd.status)}
                    <span className="text-xs font-mono font-bold text-foreground">
                      {cmd.command}
                    </span>
                    {cmd.result && (
                      <span className="text-xs font-mono text-terminal-muted truncate hidden sm:inline">
                        — {cmd.result}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-mono font-bold uppercase ${statusColor(cmd.status)}`}>
                      {cmd.status}
                    </span>
                    <span className="text-[10px] font-mono text-terminal-muted">
                      {formatDistanceToNow(new Date(cmd.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Collector Logs */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono font-bold text-terminal-muted uppercase tracking-widest flex items-center gap-2">
              <Terminal size={16} weight="bold" />
              COLLECTOR LOGS
            </h2>
            <span className="text-[10px] font-mono text-terminal-muted">
              auto-refresh 15s
            </span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <FunnelSimple size={14} weight="bold" className="text-terminal-muted" />
            {/* Level filter */}
            {(["all", "error", "warn", "info", "debug"] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLogLevel(lvl)}
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                  logLevel === lvl
                    ? lvl === "error"
                      ? "border-terminal-red/40 text-terminal-red bg-terminal-red/10"
                      : lvl === "warn"
                      ? "border-terminal-amber/40 text-terminal-amber bg-terminal-amber/10"
                      : "border-terminal-green/40 text-terminal-green bg-terminal-green/10"
                    : "border-terminal-border text-terminal-muted hover:text-foreground"
                }`}
              >
                {lvl}
              </button>
            ))}
            <span className="text-terminal-border">|</span>
            {/* Category filter */}
            {(["all", "mqtt", "packet", "alert", "xp", "outbound", "message", "ops", "system"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setLogFilter(cat)}
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                  logFilter === cat
                    ? "border-terminal-green/40 text-terminal-green bg-terminal-green/10"
                    : "border-terminal-border text-terminal-muted hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search logs... (node ID, message text)"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            className="w-full bg-black/30 border border-terminal-border rounded px-3 py-2 text-xs font-mono text-foreground placeholder:text-terminal-muted/50 mb-3 focus:outline-none focus:border-terminal-green/40"
          />

          {/* Log entries */}
          <div className="panel overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              {(() => {
                const searchLower = logSearch.toLowerCase();
                const filtered = logs
                  .filter((l) => logLevel === "all" || l.level === logLevel)
                  .filter((l) => logFilter === "all" || l.category === logFilter)
                  .filter(
                    (l) =>
                      !logSearch ||
                      l.message.toLowerCase().includes(searchLower) ||
                      (l.node_id && l.node_id.toLowerCase().includes(searchLower)) ||
                      l.category.toLowerCase().includes(searchLower)
                  )
                  .slice(0, logLimit);

                if (filtered.length === 0) {
                  return (
                    <div className="p-4 text-terminal-muted text-xs font-mono text-center">
                      No logs found{logFilter !== "all" || logLevel !== "all" || logSearch ? " matching filters" : ""}.
                    </div>
                  );
                }

                return (
                  <>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-terminal-border text-terminal-muted text-[10px] uppercase tracking-widest font-mono sticky top-0 bg-[#181b22]">
                          <th className="text-left p-2 w-[140px]">TIME</th>
                          <th className="text-left p-2 w-[50px]">LVL</th>
                          <th className="text-left p-2 w-[80px]">CAT</th>
                          <th className="text-left p-2">MESSAGE</th>
                          <th className="text-left p-2 w-[100px] hidden sm:table-cell">NODE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((log) => (
                          <tr
                            key={log.id}
                            className="border-b border-terminal-border/30 hover:bg-terminal-green/5 transition-colors group"
                          >
                            <td className="p-2 text-[11px] font-mono text-terminal-muted whitespace-nowrap">
                              {format(new Date(log.created_at), "HH:mm:ss")}
                              <span className="text-terminal-muted/50 ml-1 hidden sm:inline">
                                {format(new Date(log.created_at), "MMM d")}
                              </span>
                            </td>
                            <td className="p-2">
                              <span
                                className={`text-[10px] font-mono font-bold uppercase ${
                                  log.level === "error"
                                    ? "text-terminal-red"
                                    : log.level === "warn"
                                    ? "text-terminal-amber"
                                    : log.level === "debug"
                                    ? "text-terminal-muted"
                                    : "text-terminal-green"
                                }`}
                              >
                                {log.level}
                              </span>
                            </td>
                            <td className="p-2">
                              <span className="text-[10px] font-mono text-terminal-dim uppercase">
                                {log.category}
                              </span>
                            </td>
                            <td className="p-2 text-xs font-mono text-foreground">
                              <span className="break-all">{log.message}</span>
                              {log.metadata && (
                                <div className="text-[10px] text-terminal-muted mt-0.5 hidden group-hover:block">
                                  {typeof log.metadata === "string"
                                    ? log.metadata
                                    : JSON.stringify(log.metadata)}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-[11px] font-mono text-terminal-muted hidden sm:table-cell">
                              {log.node_id ? (
                                <a
                                  href={`/node/${encodeURIComponent(log.node_id)}`}
                                  className="hover:text-terminal-green transition-colors"
                                >
                                  {log.node_id}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filtered.length >= logLimit && (
                      <button
                        onClick={() => setLogLimit((prev) => prev + 100)}
                        className="w-full p-2 text-xs font-mono text-terminal-green hover:bg-terminal-green/5 transition-colors border-t border-terminal-border"
                      >
                        Load more...
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Message Traffic (Vectors) */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono font-bold text-terminal-muted uppercase tracking-widest flex items-center gap-2">
              <ArrowUp size={14} weight="bold" className="text-terminal-amber" />
              <ArrowDown size={14} weight="bold" className="text-terminal-green" />
              MESSAGE TRAFFIC
            </h2>
            <span className="text-[10px] font-mono text-terminal-muted">
              vectors only &mdash; no content logged
            </span>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <FunnelSimple size={14} weight="bold" className="text-terminal-muted" />
            {(["all", "inbound", "outbound"] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => setVectorDir(dir)}
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                  vectorDir === dir
                    ? dir === "inbound"
                      ? "border-terminal-green/40 text-terminal-green bg-terminal-green/10"
                      : dir === "outbound"
                      ? "border-terminal-amber/40 text-terminal-amber bg-terminal-amber/10"
                      : "border-terminal-green/40 text-terminal-green bg-terminal-green/10"
                    : "border-terminal-border text-terminal-muted hover:text-foreground"
                }`}
              >
                {dir}
              </button>
            ))}
            <input
              type="text"
              placeholder="Filter by node ID..."
              value={vectorNode}
              onChange={(e) => setVectorNode(e.target.value)}
              className="bg-black/30 border border-terminal-border rounded px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-terminal-muted/50 w-40 focus:outline-none focus:border-terminal-green/40"
            />
          </div>

          <div className="panel overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              {(() => {
                const nodeLower = vectorNode.toLowerCase();
                const filtered = vectors
                  .filter((v) => vectorDir === "all" || v.direction === vectorDir)
                  .filter(
                    (v) =>
                      !vectorNode ||
                      (v.from_node_id && v.from_node_id.toLowerCase().includes(nodeLower)) ||
                      (v.to_node_id && v.to_node_id.toLowerCase().includes(nodeLower))
                  );

                if (filtered.length === 0) {
                  return (
                    <div className="p-4 text-terminal-muted text-xs font-mono text-center">
                      No message traffic recorded yet.
                    </div>
                  );
                }

                // Compute summary stats
                const inCount = filtered.filter((v) => v.direction === "inbound").length;
                const outCount = filtered.filter((v) => v.direction === "outbound").length;
                const dmCount = filtered.filter((v) => v.to_node_id !== null).length;

                return (
                  <>
                    {/* Summary bar */}
                    <div className="flex items-center gap-4 px-3 py-2 border-b border-terminal-border bg-black/20 text-[10px] font-mono">
                      <span className="text-terminal-green">{inCount} IN</span>
                      <span className="text-terminal-amber">{outCount} OUT</span>
                      <span className="text-terminal-muted">{dmCount} DM</span>
                      <span className="text-terminal-muted">{filtered.length} total</span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-terminal-border text-terminal-muted text-[10px] uppercase tracking-widest font-mono sticky top-0 bg-[#181b22]">
                          <th className="text-left p-2 w-[130px]">TIME</th>
                          <th className="text-center p-2 w-[50px]">DIR</th>
                          <th className="text-left p-2">FROM</th>
                          <th className="text-left p-2">TO</th>
                          <th className="text-center p-2 w-[50px]">CH</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((v) => (
                          <tr
                            key={v.id}
                            className="border-b border-terminal-border/30 hover:bg-terminal-green/5 transition-colors"
                          >
                            <td className="p-2 text-[11px] font-mono text-terminal-muted whitespace-nowrap">
                              {format(new Date(v.created_at), "HH:mm:ss")}
                              <span className="text-terminal-muted/50 ml-1 hidden sm:inline">
                                {format(new Date(v.created_at), "MMM d")}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              {v.direction === "inbound" ? (
                                <ArrowDown size={14} weight="bold" className="text-terminal-green inline" />
                              ) : (
                                <ArrowUp size={14} weight="bold" className="text-terminal-amber inline" />
                              )}
                            </td>
                            <td className="p-2 text-xs font-mono">
                              {v.from_node_id ? (
                                <a
                                  href={`/node/${encodeURIComponent(v.from_node_id)}`}
                                  className="text-foreground hover:text-terminal-green transition-colors"
                                >
                                  {v.from_node_id}
                                </a>
                              ) : (
                                <span className="text-terminal-muted">--</span>
                              )}
                            </td>
                            <td className="p-2 text-xs font-mono">
                              {v.to_node_id ? (
                                <a
                                  href={`/node/${encodeURIComponent(v.to_node_id)}`}
                                  className="text-foreground hover:text-terminal-green transition-colors"
                                >
                                  {v.to_node_id}
                                </a>
                              ) : (
                                <span className="text-terminal-dim text-[10px]">BROADCAST</span>
                              )}
                            </td>
                            <td className="p-2 text-center text-xs font-mono text-terminal-muted">
                              {v.channel_index}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
