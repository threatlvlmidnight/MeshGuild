"""Achievement Engine — detects and awards achievements to nodes.

Implemented achievements:
  FIRST_CONTACT — First telemetry packet from a node
  NIGHT_WATCH   — Node online 30 consecutive days
  BACKBONE      — Node relayed 10,000+ packets
"""

from datetime import datetime, timedelta, timezone


ACHIEVEMENTS = {
    "FIRST_CONTACT": "Sent first mesh message",
    "NIGHT_WATCH": "Node online 30 consecutive days",
    "BACKBONE": "Node relayed 10,000 packets",
}

NIGHT_WATCH_DAYS = 30
BACKBONE_PACKETS = 10000


class AchievementEngine:
    def __init__(self, writer, network_id: str):
        self.writer = writer
        self.network_id = network_id

    def check_first_contact(self, node_id: str):
        """Award FIRST_CONTACT if node has no prior telemetry."""
        if self.writer.has_achievement(node_id, "FIRST_CONTACT"):
            return
        # Check if this is the first telemetry row
        count = self.writer.count_telemetry(node_id)
        if count <= 1:
            self._award(node_id, "FIRST_CONTACT")

    def check_backbone(self, node_id: str):
        """Award BACKBONE once node has 10,000+ telemetry packets."""
        if self.writer.has_achievement(node_id, "BACKBONE"):
            return
        count = self.writer.count_telemetry(node_id)
        if count >= BACKBONE_PACKETS:
            self._award(node_id, "BACKBONE")

    def check_night_watch(self):
        """Check 30-day uptime streak across all nodes. Run periodically."""
        nodes = self.writer.get_all_nodes(self.network_id)
        cutoff = datetime.now(timezone.utc) - timedelta(days=NIGHT_WATCH_DAYS)

        for node in nodes:
            node_id = node["id"]
            if self.writer.has_achievement(node_id, "NIGHT_WATCH"):
                continue

            created = node.get("created_at")
            if not created:
                continue
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if created_dt > cutoff:
                continue

            offline_alerts = self.writer.count_offline_alerts_since(
                node_id, cutoff.isoformat()
            )
            if offline_alerts == 0:
                self._award(node_id, "NIGHT_WATCH")

    def check_on_packet(self, node_id: str):
        """Run all per-packet achievement checks."""
        self.check_first_contact(node_id)
        self.check_backbone(node_id)

    def _award(self, node_id: str, achievement_key: str):
        self.writer.insert_achievement(node_id, self.network_id, achievement_key)
        print(f"[achievement] {node_id}: earned {achievement_key}!")
