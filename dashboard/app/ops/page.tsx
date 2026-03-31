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
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";

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
      </div>
    </main>
  );
}
