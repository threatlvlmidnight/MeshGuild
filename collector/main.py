"""MeshGuild Collector — MQTT subscriber that writes to Supabase."""

import sys
import time
import threading
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from collector.config import Config
from collector.parser import parse_packet
from collector.alerts import check_packet_alerts, find_offline_nodes
from collector.writer import SupabaseWriter


def main():
    config = Config()
    writer = SupabaseWriter(config)

    print(f"[collector] Connecting to MQTT broker at {config.mqtt_host}:{config.mqtt_port}")
    print(f"[collector] Subscribing to: {config.mqtt_topic}")
    print(f"[collector] Writing to Supabase: {config.supabase_url}")
    print(f"[collector] Network: {config.network_id}")

    def on_connect(client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            print("[collector] Connected to MQTT broker")
            client.subscribe(config.mqtt_topic)
            print(f"[collector] Subscribed to {config.mqtt_topic}")
        else:
            print(f"[collector] Connection failed: {reason_code}")

    def on_message(client, userdata, msg):
        try:
            packet = parse_packet(msg.payload)
            if packet is None:
                return

            print(f"[collector] {packet['node_id']} | rssi={packet['rssi']} snr={packet['snr']} bat={packet['battery_level']}")

            writer.upsert_node(packet)
            writer.insert_telemetry(packet)

            alerts = check_packet_alerts(packet)
            for alert in alerts:
                print(f"[alert] {alert['alert_type']}: {alert['message']}")
                writer.insert_alert(alert)

        except Exception as e:
            print(f"[collector] Error processing message: {e}")

    def offline_checker():
        """Background thread: check for offline nodes every 60 seconds."""
        while True:
            time.sleep(60)
            try:
                nodes = writer.get_online_nodes()
                now = datetime.now(timezone.utc)
                alerts = find_offline_nodes(nodes, now=now)
                for alert in alerts:
                    print(f"[alert] {alert['alert_type']}: {alert['message']}")
                    writer.insert_alert(alert)
                    writer.mark_node_offline(alert["node_id"], now.isoformat())
            except Exception as e:
                print(f"[collector] Offline check error: {e}")

    # Start offline checker thread
    checker = threading.Thread(target=offline_checker, daemon=True)
    checker.start()

    # Connect MQTT
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(config.mqtt_host, config.mqtt_port, keepalive=60)
        print("[collector] Starting MQTT loop (Ctrl+C to stop)")
        client.loop_forever()
    except KeyboardInterrupt:
        print("\n[collector] Shutting down...")
        client.disconnect()
    except ConnectionRefusedError:
        print(f"[collector] Cannot connect to MQTT broker at {config.mqtt_host}:{config.mqtt_port}")
        print("[collector] Is Mosquitto running?")
        sys.exit(1)


if __name__ == "__main__":
    main()
