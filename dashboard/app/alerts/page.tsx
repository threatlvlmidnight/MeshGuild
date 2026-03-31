"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Alert } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

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
    const client = getSupabase();
    await client
      .from("alerts")
      .update({ acknowledged: true })
      .eq("id", alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  async function dismissAll() {
    const client = getSupabase();
    const ids = alerts.filter((a) => !a.acknowledged).map((a) => a.id);
    if (ids.length === 0) return;
    await client
      .from("alerts")
      .update({ acknowledged: true })
      .in("id", ids);
    setAlerts((prev) =>
      showAcknowledged
        ? prev.map((a) => (ids.includes(a.id) ? { ...a, acknowledged: true } : a))
        : []
    );
  }

  const alertTypeColor: Record<string, string> = {
    NODE_OFFLINE: "text-red-400",
    WEAK_SIGNAL: "text-yellow-400",
    LOW_BATTERY: "text-orange-400",
  };

  const activeCount = alerts.filter((a) => !a.acknowledged).length;

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

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Alerts</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={showAcknowledged}
                onChange={(e) => setShowAcknowledged(e.target.checked)}
                className="rounded bg-gray-700 border-gray-600"
              />
              Show dismissed
            </label>
            {activeCount > 0 && (
              <button
                onClick={dismissAll}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded transition-colors"
              >
                Dismiss all ({activeCount})
              </button>
            )}
          </div>
        </div>

        {/* Alert list */}
        {loading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : alerts.length === 0 ? (
          <div className="text-gray-400 text-sm">No alerts</div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`bg-gray-800 border rounded-lg p-4 flex items-start justify-between gap-4 ${
                  alert.acknowledged
                    ? "border-gray-700 opacity-50"
                    : "border-gray-600"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`font-mono text-xs font-semibold ${
                        alertTypeColor[alert.alert_type] ?? "text-gray-400"
                      }`}
                    >
                      {alert.alert_type}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {formatDistanceToNow(new Date(alert.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <div className="text-gray-200 text-sm">{alert.message}</div>
                  <Link
                    href={`/node/${encodeURIComponent(alert.node_id)}`}
                    className="text-blue-400 text-xs hover:text-blue-300 mt-1 inline-block"
                  >
                    {alert.node_id}
                  </Link>
                </div>
                {!alert.acknowledged && (
                  <button
                    onClick={() => dismiss(alert.id)}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors shrink-0"
                  >
                    Dismiss
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
