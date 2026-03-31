"""XP Engine — awards XP for node activity and computes levels.

XP Sources:
  UPTIME_HOUR  — 10 XP per hour online (hourly timer)
  PACKET_RELAY — 2 XP per telemetry packet received
  STREAK_BONUS — 500 XP for 7 consecutive days online

Level thresholds:
  1=0, 2=500, 3=2000, 4=5000, 5=15000, 6=50000
"""

from datetime import datetime, timedelta, timezone

LEVEL_THRESHOLDS = [
    (6, 50000, "Archnode"),
    (5, 15000, "Sentinel"),
    (4, 5000, "Guardian"),
    (3, 2000, "Warden"),
    (2, 500, "Relay"),
    (1, 0, "Beacon"),
]

STREAK_DAYS = 7
STREAK_XP = 500
UPTIME_XP = 10
PACKET_XP = 2


def level_from_xp(xp: int) -> tuple[int, str]:
    """Return (level, title) for a given XP total."""
    for level, threshold, title in LEVEL_THRESHOLDS:
        if xp >= threshold:
            return level, title
    return 1, "Beacon"


class XpEngine:
    def __init__(self, writer, network_id: str):
        self.writer = writer
        self.network_id = network_id

    def award_packet_xp(self, node_id: str):
        """Award XP for receiving a telemetry packet."""
        self.writer.insert_xp_event(node_id, self.network_id, "PACKET_RELAY", PACKET_XP)
        self._update_node_xp(node_id, PACKET_XP)

    def award_uptime_xp(self):
        """Award XP to all online nodes. Run once per hour."""
        online_nodes = self.writer.get_online_nodes(self.network_id)
        for node in online_nodes:
            node_id = node["id"]
            self.writer.insert_xp_event(node_id, self.network_id, "UPTIME_HOUR", UPTIME_XP)
            self._update_node_xp(node_id, UPTIME_XP)
            print(f"[xp] {node_id}: +{UPTIME_XP} XP (uptime hour)")

    def check_streaks(self):
        """Check 7-day uptime streaks and award bonus. Run once per hour."""
        nodes = self.writer.get_all_nodes(self.network_id)
        cutoff = datetime.now(timezone.utc) - timedelta(days=STREAK_DAYS)

        for node in nodes:
            node_id = node["id"]
            created = node.get("created_at")
            if not created:
                continue

            # Node must have existed for at least 7 days
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if created_dt > cutoff:
                continue

            # Check if node has been continuously online (no offline gaps in last 7 days)
            offline_alerts = self.writer.count_offline_alerts_since(
                node_id, cutoff.isoformat()
            )
            if offline_alerts > 0:
                continue

            # Check if streak bonus already awarded this week
            week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            if self.writer.has_xp_event_since(node_id, "STREAK_BONUS", week_ago):
                continue

            self.writer.insert_xp_event(
                node_id, self.network_id, "STREAK_BONUS", STREAK_XP
            )
            self._update_node_xp(node_id, STREAK_XP)
            print(f"[xp] {node_id}: +{STREAK_XP} XP (7-day streak!)")

    def _update_node_xp(self, node_id: str, xp_delta: int):
        """Add XP to node total and recompute level."""
        node = self.writer.get_node(node_id)
        if not node:
            return
        new_xp = (node.get("xp_total") or 0) + xp_delta
        new_level, _ = level_from_xp(new_xp)
        self.writer.update_node_xp(node_id, new_xp, new_level)
