"""Supabase writer: upsert nodes, insert telemetry, insert alerts."""

from supabase import create_client, Client
from collector.config import Config


class SupabaseWriter:
    def __init__(self, config: Config):
        self.client: Client = create_client(config.supabase_url, config.supabase_service_key)
        self.network_id = config.network_id

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
