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
