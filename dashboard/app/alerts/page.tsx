"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Alert } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Warning, CheckCircle, Eye, EyeSlash } from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const client = getSupabase();
    client.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setAuthChecked(true);
    });
  }, []);

  async function fetchAlerts() {
    const client = getSupabase();
    let query = client
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!showAcknowledged) {
      query = query.eq("acknowledged", false);
    }

    const { data } = await query.limit(100);
    setAlerts(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAlerts();

    const client = getSupabase();
    const channel = client
      .channel("alerts-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAcknowledged]);

  async function dismiss(alertId: number) {
    if (!user) return;
    const client = getSupabase();
    const { error } = await client
      .from("alerts")
      .update({ acknowledged: true })
      .eq("id", alertId);
    if (error) {
      console.error("Failed to dismiss alert:", error.message);
      return;
    }
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  async function dismissAll() {
    if (!user) return;
    const client = getSupabase();
    const ids = alerts.filter((a) => !a.acknowledged).map((a) => a.id);
    if (ids.length === 0) return;
    const { error } = await client
      .from("alerts")
      .update({ acknowledged: true })
      .in("id", ids);
    if (error) {
      console.error("Failed to dismiss alerts:", error.message);
      return;
    }
    setAlerts((prev) =>
      showAcknowledged
        ? prev.map((a) => (ids.includes(a.id) ? { ...a, acknowledged: true } : a))
        : []
    );
  }

  const alertTypeColor: Record<string, string> = {
    NODE_OFFLINE: "text-terminal-red",
    WEAK_SIGNAL: "text-terminal-amber",
    LOW_BATTERY: "text-terminal-gold",
  };

  const activeCount = alerts.filter((a) => !a.acknowledged).length;

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

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold font-mono text-terminal-amber flex items-center gap-2">
            <Warning size={20} weight="bold" />
            ALERTS
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAcknowledged(!showAcknowledged)}
              className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 rounded border transition-colors ${
                showAcknowledged
                  ? "border-terminal-green/30 text-terminal-green bg-terminal-green/10"
                  : "border-terminal-border text-terminal-muted hover:text-foreground"
              }`}
            >
              {showAcknowledged ? <Eye size={12} weight="bold" /> : <EyeSlash size={12} weight="bold" />}
              DISMISSED
            </button>
            {activeCount > 0 && user && (
              <button
                onClick={dismissAll}
                className="text-[10px] font-mono border border-terminal-border text-terminal-muted hover:text-foreground hover:border-terminal-green/30 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
              >
                <CheckCircle size={12} weight="bold" />
                DISMISS ALL ({activeCount})
              </button>
            )}
            {activeCount > 0 && authChecked && !user && (
              <Link
                href="/login"
                className="text-[10px] font-mono text-terminal-muted hover:text-terminal-green transition-colors"
              >
                Sign in to dismiss
              </Link>
            )}
          </div>
        </div>

        {/* Alert list */}
        {loading ? (
          <div className="text-terminal-muted text-sm font-mono animate-pulse-glow">Scanning for alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="text-terminal-muted text-sm font-mono">No alerts — all clear</div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`panel p-4 flex items-start justify-between gap-4 ${
                  alert.acknowledged ? "opacity-40" : ""
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                        alertTypeColor[alert.alert_type] ?? "text-terminal-muted"
                      }`}
                    >
                      {alert.alert_type}
                    </span>
                    <span className="text-terminal-muted text-[10px] font-mono">
                      {formatDistanceToNow(new Date(alert.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <div className="text-foreground text-sm font-mono">{alert.message}</div>
                  <Link
                    href={`/node/${encodeURIComponent(alert.node_id)}`}
                    className="text-terminal-green text-[10px] font-mono hover:text-terminal-green/80 mt-1 inline-block"
                  >
                    {alert.node_id}
                  </Link>
                </div>
                {!alert.acknowledged && user && (
                  <button
                    onClick={() => dismiss(alert.id)}
                    className="text-[10px] font-mono border border-terminal-border text-terminal-muted hover:text-foreground hover:border-terminal-green/30 px-2 py-1 rounded transition-colors shrink-0"
                  >
                    DISMISS
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
