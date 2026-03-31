class AlertEngine:
    RSSI_THRESHOLD = -110
    BATTERY_THRESHOLD = 20

    def __init__(self, writer, network_id: str):
        self.writer = writer
        self.network_id = network_id

    def check_packet(self, packet: dict):
        node_id = packet["node_id"]

        rssi = packet.get("rssi")
        if rssi is not None and rssi < self.RSSI_THRESHOLD:
            if not self.writer.has_active_alert(node_id, "WEAK_SIGNAL"):
                self.writer.insert_alert(
                    node_id,
                    self.network_id,
                    "WEAK_SIGNAL",
                    f"RSSI {rssi} dBm is below threshold ({self.RSSI_THRESHOLD} dBm)",
                )

        battery = packet.get("battery_level")
        if battery is not None and battery < self.BATTERY_THRESHOLD:
            if not self.writer.has_active_alert(node_id, "LOW_BATTERY"):
                self.writer.insert_alert(
                    node_id,
                    self.network_id,
                    "LOW_BATTERY",
                    f"Battery at {battery}% (below {self.BATTERY_THRESHOLD}%)",
                )

    def check_offline_nodes(self):
        stale_nodes = self.writer.get_stale_online_nodes(self.network_id)
        for node in stale_nodes:
            node_id = node["id"]
            name = node.get("long_name") or node_id
            self.writer.set_node_offline(node_id)
            if not self.writer.has_active_alert(node_id, "NODE_OFFLINE"):
                self.writer.insert_alert(
                    node_id,
                    self.network_id,
                    "NODE_OFFLINE",
                    f"{name} has not been seen for over 10 minutes",
                )
