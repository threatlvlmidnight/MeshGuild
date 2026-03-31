"""
MeshGuild Collector — subscribes to Mosquitto, writes mesh data to Supabase.

Usage:
    Set environment variables (see .env.example), then:
    python -m collector.collector
"""

import threading
import time

import paho.mqtt.client as mqtt

from collector.config import Config
from collector.parser import parse_packet
from collector.supabase_client import SupabaseWriter
from collector.alert_engine import AlertEngine


def main():
    config = Config()
    writer = SupabaseWriter(config.supabase_url, config.supabase_service_key)
    alert_engine = AlertEngine(writer, config.network_id)

    def on_connect(client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            print(f"Connected to MQTT broker at {config.mqtt_host}:{config.mqtt_port}")
            client.subscribe(config.mqtt_topic)
            print(f"Subscribed to {config.mqtt_topic}")
        else:
            print(f"MQTT connection failed: {reason_code}")

    def on_message(client, userdata, message):
        raw = message.payload.decode("utf-8", errors="replace")
        print(f"[MQTT] {message.topic}: {raw[:120]}...")

        packet = parse_packet(raw)
        if packet is None:
            print(f"  -> skipped (unparseable)")
            return

        print(f"  -> node={packet['node_id']} type={packet['packet_type']} rssi={packet['rssi']}")

        try:
            writer.upsert_node(packet, config.network_id)
            writer.insert_telemetry(packet, config.network_id)
            alert_engine.check_packet(packet)
        except Exception as e:
            print(f"  -> ERROR writing to Supabase: {e}")

    def offline_check_loop():
        while True:
            time.sleep(60)
            try:
                alert_engine.check_offline_nodes()
            except Exception as e:
                print(f"[OFFLINE CHECK] ERROR: {e}")

    # Start background offline checker
    timer = threading.Thread(target=offline_check_loop, daemon=True)
    timer.start()

    # Connect to MQTT
    mqttc = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    mqttc.on_connect = on_connect
    mqttc.on_message = on_message

    print(f"Connecting to MQTT broker at {config.mqtt_host}:{config.mqtt_port}...")
    mqttc.connect(config.mqtt_host, config.mqtt_port)
    mqttc.loop_forever()


if __name__ == "__main__":
    main()
