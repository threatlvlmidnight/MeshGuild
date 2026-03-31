"""Supabase writer: upsert nodes, insert telemetry, insert alerts, broadcast messages."""

from datetime import datetime, timedelta, timezone
from typing import Optional
import json
import urllib.request
from dateutil.parser import parse as parse_dt
from supabase import create_client, Client
from collector.config import Config


class SupabaseWriter:
    def __init__(self, config: Config):
        self.client: Client = create_client(config.supabase_url, config.supabase_service_key)
        self.network_id = config.network_id
        self._supabase_url = config.supabase_url
        self._supabase_key = config.supabase_service_key

    def upsert_node(self, packet: dict):
        """Upsert a node row from a parsed packet."""
        row = {
            "id": packet["node_id"],
            "network_id": self.network_id,
            "last_seen": packet["timestamp"],
            "is_online": True,
            "updated_at": packet["timestamp"],
        }
        if packet.get("rssi") is not None:
            row["rssi"] = packet["rssi"]
        if packet.get("snr") is not None:
            row["snr"] = packet["snr"]
        if packet.get("battery_level") is not None:
            row["battery_level"] = packet["battery_level"]
        if packet.get("short_name") is not None:
            row["short_name"] = packet["short_name"]
        if packet.get("long_name") is not None:
            row["long_name"] = packet["long_name"]

        self.client.table("nodes").upsert(row, on_conflict="id").execute()

        # Update running stats after upsert
        self._update_node_stats(packet["node_id"], packet)

    def insert_telemetry(self, packet: dict):
        """Insert a telemetry row from a parsed packet."""
        row = {
            "node_id": packet["node_id"],
            "network_id": self.network_id,
            "timestamp": packet["timestamp"],
            "rssi": packet.get("rssi"),
            "snr": packet.get("snr"),
            "battery_level": packet.get("battery_level"),
            "uptime_seconds": packet.get("uptime_seconds"),
        }
        self.client.table("telemetry").insert(row).execute()

    def insert_alert(self, alert: dict):
        """Insert an alert row. Deduplicates NODE_OFFLINE alerts."""
        if alert["alert_type"] == "NODE_OFFLINE":
            existing = (
                self.client.table("alerts")
                .select("id")
                .eq("node_id", alert["node_id"])
                .eq("alert_type", "NODE_OFFLINE")
                .eq("acknowledged", False)
                .execute()
            )
            if existing.data:
                return  # Already have an unacknowledged offline alert

        row = {
            "node_id": alert["node_id"],
            "network_id": self.network_id,
            "alert_type": alert["alert_type"],
            "message": alert["message"],
        }
        self.client.table("alerts").insert(row).execute()

    def broadcast_message(self, packet: dict):
        """Broadcast a text message to the dashboard via Supabase Realtime REST API.

        No database write — messages are ephemeral, cached in localStorage on the dashboard.
        """
        text = packet.get("text")
        if not text:
            return

        # Look up sender's short_name from the nodes table
        sender_name = packet.get("short_name")
        if not sender_name:
            node = self.get_node(packet["node_id"])
            if node:
                sender_name = node.get("short_name")

        message = {
            "id": "{}-{}".format(packet["node_id"], packet["timestamp"]),
            "node_id": packet["node_id"],
            "to_node_id": packet.get("to_node_id"),
            "channel_index": packet.get("channel_index", 0),
            "content": text,
            "sender_name": sender_name,
            "source": "mesh",
            "received_at": packet["timestamp"],
        }

        url = "{}/realtime/v1/api/broadcast".format(self._supabase_url)
        headers = {
            "Content-Type": "application/json",
            "apikey": self._supabase_key,
            "Authorization": "Bearer {}".format(self._supabase_key),
        }
        body = json.dumps({
            "messages": [{
                "topic": "realtime:mesh-messages",
                "event": "new_message",
                "payload": message,
            }]
        }).encode("utf-8")

        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            print("[broadcast] failed: {}".format(e))

    def poll_outbound_queue(self):
        """Fetch pending outbound messages from the queue. Returns list of rows."""
        try:
            result = (
                self.client.table("outbound_queue")
                .select("*")
                .order("created_at")
                .limit(20)
                .execute()
            )
            return result.data or []
        except Exception as e:
            print("[outbound] poll error: {}".format(e))
            return []

    def delete_outbound(self, row_id):
        """Delete a sent outbound message from the queue."""
        try:
            self.client.table("outbound_queue").delete().eq("id", row_id).execute()
        except Exception as e:
            print("[outbound] delete error: {}".format(e))

    def get_online_nodes(self) -> list[dict]:
        """Fetch all nodes currently marked as online."""
        result = (
            self.client.table("nodes")
            .select("id, short_name, last_seen, is_online")
            .eq("network_id", self.network_id)
            .eq("is_online", True)
            .execute()
        )
        return result.data

    def mark_node_offline(self, node_id: str, timestamp: str):
        """Set a node's is_online to false."""
        self.client.table("nodes").update({
            "is_online": False,
            "updated_at": timestamp,
        }).eq("id", node_id).execute()

    def get_node(self, node_id: str) -> Optional[dict]:
        result = (
            self.client.table("nodes")
            .select("*")
            .eq("id", node_id)
            .execute()
        )
        return result.data[0] if result.data else None

    def _update_node_stats(self, node_id: str, packet: dict):
        """Incrementally update running stats on the nodes row after each packet."""
        node = self.get_node(node_id)
        if not node:
            return

        updates = {
            "packets_total": (node.get("packets_total") or 0) + 1,
        }

        rssi = packet.get("rssi")
        if rssi is not None:
            old_avg = node.get("avg_rssi")
            total = updates["packets_total"]
            if old_avg is not None:
                updates["avg_rssi"] = round(old_avg + (rssi - old_avg) / total, 1)
            else:
                updates["avg_rssi"] = float(rssi)
            old_best = node.get("best_rssi")
            if old_best is None or rssi > old_best:
                updates["best_rssi"] = rssi

        snr = packet.get("snr")
        if snr is not None:
            old_avg_snr = node.get("avg_snr")
            total = updates["packets_total"]
            if old_avg_snr is not None:
                updates["avg_snr"] = round(old_avg_snr + (snr - old_avg_snr) / total, 1)
            else:
                updates["avg_snr"] = float(snr)
            old_best_snr = node.get("best_snr")
            if old_best_snr is None or snr > old_best_snr:
                updates["best_snr"] = snr

        bat = packet.get("battery_level")
        if bat is not None:
            old_min = node.get("battery_min")
            if old_min is None or bat < old_min:
                updates["battery_min"] = bat

        self.client.table("nodes").update(updates).eq("id", node_id).execute()

    def recompute_all_stats(self):
        """Full recompute of packet counts and uptime for all nodes. Run hourly."""
        now = datetime.now(timezone.utc)
        day_ago = (now - timedelta(hours=24)).isoformat()
        week_ago = (now - timedelta(days=7)).isoformat()

        nodes_result = (
            self.client.table("nodes")
            .select("*")
            .eq("network_id", self.network_id)
            .execute()
        )
        nodes = nodes_result.data or []

        for node in nodes:
            node_id = node["id"]

            total_res = (
                self.client.table("telemetry")
                .select("id", count="exact")
                .eq("node_id", node_id)
                .execute()
            )
            day_res = (
                self.client.table("telemetry")
                .select("id", count="exact")
                .eq("node_id", node_id)
                .gte("timestamp", day_ago)
                .execute()
            )
            week_res = (
                self.client.table("telemetry")
                .select("id", count="exact")
                .eq("node_id", node_id)
                .gte("timestamp", week_ago)
                .execute()
            )

            # Uptime percentage
            created = node.get("created_at")
            uptime_pct = None
            if created:
                created_dt = parse_dt(created)
                hours_existed = max((now - created_dt).total_seconds() / 3600, 1)
                offline_alerts = (
                    self.client.table("alerts")
                    .select("id", count="exact")
                    .eq("node_id", node_id)
                    .eq("alert_type", "NODE_OFFLINE")
                    .gte("created_at", created)
                    .execute()
                )
                offline_hours = (offline_alerts.count or 0) * 1.0
                uptime_pct = round(
                    max(0, min(100, ((hours_existed - offline_hours) / hours_existed) * 100)),
                    1,
                )

            # Current streak
            current_streak = 0
            last_offline = (
                self.client.table("alerts")
                .select("created_at")
                .eq("node_id", node_id)
                .eq("alert_type", "NODE_OFFLINE")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if last_offline.data:
                last_dt = parse_dt(last_offline.data[0]["created_at"])
                current_streak = max(0, (now - last_dt).days)
            elif created:
                current_streak = (now - parse_dt(created)).days

            longest = node.get("longest_streak_days") or 0
            if current_streak > longest:
                longest = current_streak

            offline_count_res = (
                self.client.table("alerts")
                .select("id", count="exact")
                .eq("node_id", node_id)
                .eq("alert_type", "NODE_OFFLINE")
                .execute()
            )

            updates = {
                "packets_total": total_res.count or 0,
                "packets_24h": day_res.count or 0,
                "packets_7d": week_res.count or 0,
                "uptime_pct": uptime_pct,
                "offline_count": offline_count_res.count or 0,
                "current_streak_days": current_streak,
                "longest_streak_days": longest,
            }

            self.client.table("nodes").update(updates).eq("id", node_id).execute()
            print(f"[stats] {node_id}: {updates['packets_total']} total, {updates['packets_24h']} 24h, uptime {uptime_pct}%")

        # Recompute player renown from owned nodes
        try:
            self.client.rpc("recompute_player_renown").execute()
            print("[stats] player renown recomputed")
        except Exception as e:
            print(f"[stats] renown recompute failed: {e}")

    # --- Ops Commands & Heartbeat ---

    def send_heartbeat(self, pid):
        """Upsert collector heartbeat so the dashboard knows we're alive."""
        try:
            self.client.table("collector_heartbeat").upsert({
                "id": "main",
                "last_beat": datetime.now(timezone.utc).isoformat(),
                "status": "running",
                "pid": pid,
            }, on_conflict="id").execute()
        except Exception as e:
            print(f"[heartbeat] error: {e}")

    def poll_ops_commands(self):
        """Fetch pending ops commands. Returns list of rows."""
        try:
            result = (
                self.client.table("ops_commands")
                .select("*")
                .eq("status", "pending")
                .order("created_at")
                .limit(10)
                .execute()
            )
            return result.data or []
        except Exception as e:
            print(f"[ops] poll error: {e}")
            return []

    def update_ops_command(self, cmd_id, status, result_msg=None):
        """Update an ops command status."""
        try:
            update = {
                "status": status,
                "executed_at": datetime.now(timezone.utc).isoformat(),
            }
            if result_msg:
                update["result"] = result_msg
            self.client.table("ops_commands").update(update).eq("id", cmd_id).execute()
        except Exception as e:
            print(f"[ops] update error: {e}")
