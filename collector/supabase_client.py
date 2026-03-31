from datetime import datetime, timedelta, timezone

from supabase import create_client, Client


class SupabaseWriter:
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

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
