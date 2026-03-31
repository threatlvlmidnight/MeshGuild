from datetime import datetime, timedelta, timezone

from supabase import create_client, Client


class SupabaseWriter:
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

    # ── Node operations ──────────────────────────────────────

    def upsert_node(self, packet: dict, network_id: str):
        now = datetime.now(timezone.utc).isoformat()
        node_id = packet["node_id"]
        short_name = packet.get("short_name")

        # Duplicate detection: if this node has a short_name, check for other
        # node IDs with the same short_name and retire them
        if short_name:
            result = (
                self.client.table("nodes")
                .select("id")
                .eq("network_id", network_id)
                .eq("short_name", short_name)
                .neq("id", node_id)
                .execute()
            )
            for old_node in result.data:
                old_id = old_node["id"]
                print(f"[dedup] Retiring duplicate node {old_id} (same short_name '{short_name}' as {node_id})")
                self.client.table("telemetry").delete().eq("node_id", old_id).execute()
                self.client.table("alerts").delete().eq("node_id", old_id).execute()
                self.client.table("xp_events").delete().eq("node_id", old_id).execute()
                self.client.table("achievements").delete().eq("node_id", old_id).execute()
                self.client.table("cards").delete().eq("node_id", old_id).execute()
                self.client.table("nodes").delete().eq("id", old_id).execute()

        row = {
            "id": node_id,
            "network_id": network_id,
            "last_seen": packet["timestamp"],
            "is_online": True,
            "updated_at": now,
        }
        if packet.get("rssi") is not None:
            row["rssi"] = packet["rssi"]
        if packet.get("snr") is not None:
            row["snr"] = packet["snr"]
        if short_name:
            row["short_name"] = short_name
        if packet.get("long_name"):
            row["long_name"] = packet["long_name"]
        if packet.get("battery_level") is not None:
            row["battery_level"] = packet["battery_level"]

        self.client.table("nodes").upsert(row).execute()

        # Update running stats after upsert
        self._update_node_stats(node_id, packet)

    def insert_telemetry(self, packet: dict, network_id: str):
        row = {
            "node_id": packet["node_id"],
            "network_id": network_id,
            "timestamp": packet["timestamp"],
            "rssi": packet.get("rssi"),
            "snr": packet.get("snr"),
            "battery_level": packet.get("battery_level"),
            "uptime_seconds": packet.get("uptime_seconds"),
        }
        self.client.table("telemetry").insert(row).execute()

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
            old_best = node.get("best_rssi")
            total = updates["packets_total"]
            if old_avg is not None:
                updates["avg_rssi"] = round(old_avg + (rssi - old_avg) / total, 1)
            else:
                updates["avg_rssi"] = float(rssi)
            if old_best is None or rssi > old_best:
                updates["best_rssi"] = rssi

        snr = packet.get("snr")
        if snr is not None:
            old_avg_snr = node.get("avg_snr")
            old_best_snr = node.get("best_snr")
            total = updates["packets_total"]
            if old_avg_snr is not None:
                updates["avg_snr"] = round(old_avg_snr + (snr - old_avg_snr) / total, 1)
            else:
                updates["avg_snr"] = float(snr)
            if old_best_snr is None or snr > old_best_snr:
                updates["best_snr"] = snr

        bat = packet.get("battery_level")
        if bat is not None:
            old_min = node.get("battery_min")
            if old_min is None or bat < old_min:
                updates["battery_min"] = bat

        (
            self.client.table("nodes")
            .update(updates)
            .eq("id", node_id)
            .execute()
        )

    def recompute_all_stats(self, network_id: str):
        """Full recompute of packet counts and uptime for all nodes. Run hourly."""
        now = datetime.now(timezone.utc)
        day_ago = (now - timedelta(hours=24)).isoformat()
        week_ago = (now - timedelta(days=7)).isoformat()

        nodes = self.get_all_nodes(network_id)
        for node in nodes:
            node_id = node["id"]

            # Total packets
            total_res = (
                self.client.table("telemetry")
                .select("id", count="exact")
                .eq("node_id", node_id)
                .execute()
            )
            # Packets in last 24h
            day_res = (
                self.client.table("telemetry")
                .select("id", count="exact")
                .eq("node_id", node_id)
                .gte("timestamp", day_ago)
                .execute()
            )
            # Packets in last 7d
            week_res = (
                self.client.table("telemetry")
                .select("id", count="exact")
                .eq("node_id", node_id)
                .gte("timestamp", week_ago)
                .execute()
            )

            # Uptime percentage: (hours_existed - offline_hours) / hours_existed
            created = node.get("created_at")
            uptime_pct = None
            if created:
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                hours_existed = max((now - created_dt).total_seconds() / 3600, 1)
                offline_count = self.count_offline_alerts_since(
                    node_id, created_dt.isoformat()
                )
                # Rough estimate: each offline alert ~ 1 hour of downtime
                offline_hours = offline_count * 1.0
                uptime_pct = round(
                    max(0, min(100, ((hours_existed - offline_hours) / hours_existed) * 100)),
                    1,
                )

            # Current streak: days since last offline alert
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
                last_dt = datetime.fromisoformat(
                    last_offline.data[0]["created_at"].replace("Z", "+00:00")
                )
                current_streak = max(0, (now - last_dt).days)
            elif created:
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                current_streak = (now - created_dt).days

            longest = node.get("longest_streak_days") or 0
            if current_streak > longest:
                longest = current_streak

            updates = {
                "packets_total": total_res.count or 0,
                "packets_24h": day_res.count or 0,
                "packets_7d": week_res.count or 0,
                "uptime_pct": uptime_pct,
                "offline_count": self.count_offline_alerts_since(
                    node_id,
                    (node.get("created_at") or now.isoformat()),
                ),
                "current_streak_days": current_streak,
                "longest_streak_days": longest,
            }

            (
                self.client.table("nodes")
                .update(updates)
                .eq("id", node_id)
                .execute()
            )
            print(f"[stats] {node_id}: {updates['packets_total']} total, {updates['packets_24h']} 24h, {updates['packets_7d']} 7d, uptime {uptime_pct}%")

    def insert_alert(self, node_id: str, network_id: str, alert_type: str, message: str):
        self.client.table("alerts").insert({
            "node_id": node_id,
            "network_id": network_id,
            "alert_type": alert_type,
            "message": message,
        }).execute()

    def has_active_alert(self, node_id: str, alert_type: str) -> bool:
        result = (
            self.client.table("alerts")
            .select("id")
            .eq("node_id", node_id)
            .eq("alert_type", alert_type)
            .eq("acknowledged", False)
            .execute()
        )
        return len(result.data) > 0

    def get_stale_online_nodes(self, network_id: str, threshold_minutes: int = 10) -> list:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=threshold_minutes)).isoformat()
        result = (
            self.client.table("nodes")
            .select("id, long_name")
            .eq("network_id", network_id)
            .eq("is_online", True)
            .lt("last_seen", cutoff)
            .execute()
        )
        return result.data

    def set_node_offline(self, node_id: str):
        now = datetime.now(timezone.utc).isoformat()
        (
            self.client.table("nodes")
            .update({"is_online": False, "updated_at": now})
            .eq("id", node_id)
            .execute()
        )

    def get_node(self, node_id: str) -> dict | None:
        result = (
            self.client.table("nodes")
            .select("*")
            .eq("id", node_id)
            .execute()
        )
        return result.data[0] if result.data else None

    def get_online_nodes(self, network_id: str) -> list:
        result = (
            self.client.table("nodes")
            .select("id, long_name")
            .eq("network_id", network_id)
            .eq("is_online", True)
            .execute()
        )
        return result.data

    def get_all_nodes(self, network_id: str) -> list:
        result = (
            self.client.table("nodes")
            .select("*")
            .eq("network_id", network_id)
            .execute()
        )
        return result.data

    def update_node_xp(self, node_id: str, xp_total: int, level: int):
        now = datetime.now(timezone.utc).isoformat()
        (
            self.client.table("nodes")
            .update({"xp_total": xp_total, "level": level, "updated_at": now})
            .eq("id", node_id)
            .execute()
        )

    # ── XP operations ────────────────────────────────────────

    def insert_xp_event(self, node_id: str, network_id: str, event_type: str, xp_awarded: int):
        self.client.table("xp_events").insert({
            "node_id": node_id,
            "network_id": network_id,
            "event_type": event_type,
            "xp_awarded": xp_awarded,
        }).execute()

    def has_xp_event_since(self, node_id: str, event_type: str, since_iso: str) -> bool:
        result = (
            self.client.table("xp_events")
            .select("id")
            .eq("node_id", node_id)
            .eq("event_type", event_type)
            .gte("created_at", since_iso)
            .execute()
        )
        return len(result.data) > 0

    def get_weekly_xp(self, node_id: str) -> int:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        result = (
            self.client.table("xp_events")
            .select("xp_awarded")
            .eq("node_id", node_id)
            .gte("created_at", week_ago)
            .execute()
        )
        return sum(row["xp_awarded"] for row in result.data)

    # ── Achievement operations ───────────────────────────────

    def has_achievement(self, node_id: str, achievement_key: str) -> bool:
        result = (
            self.client.table("achievements")
            .select("id")
            .eq("node_id", node_id)
            .eq("achievement_key", achievement_key)
            .execute()
        )
        return len(result.data) > 0

    def insert_achievement(self, node_id: str, network_id: str, achievement_key: str):
        self.client.table("achievements").insert({
            "node_id": node_id,
            "network_id": network_id,
            "achievement_key": achievement_key,
        }).execute()

    # ── Card operations ──────────────────────────────────────

    def insert_card(self, node_id: str, network_id: str, card_name: str, rarity: str, trigger_event: str):
        self.client.table("cards").insert({
            "node_id": node_id,
            "network_id": network_id,
            "card_name": card_name,
            "rarity": rarity,
            "trigger_event": trigger_event,
        }).execute()

    # ── Telemetry queries ────────────────────────────────────

    def count_telemetry(self, node_id: str) -> int:
        result = (
            self.client.table("telemetry")
            .select("id", count="exact")
            .eq("node_id", node_id)
            .execute()
        )
        return result.count or 0

    def count_offline_alerts_since(self, node_id: str, since_iso: str) -> int:
        result = (
            self.client.table("alerts")
            .select("id", count="exact")
            .eq("node_id", node_id)
            .eq("alert_type", "NODE_OFFLINE")
            .gte("created_at", since_iso)
            .execute()
        )
        return result.count or 0
