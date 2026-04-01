"""MeshGuild Collector — MQTT subscriber that writes to Supabase + broadcasts messages."""

import json
import os
import subprocess
import sys
import time
import threading
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from collector.config import Config
from collector.parser import parse_packet
from collector.alerts import check_packet_alerts, find_offline_nodes
from collector.writer import SupabaseWriter
from collector.xp_engine import XpEngine
from collector.achievement_engine import AchievementEngine
from collector.card_engine import CardEngine


def main():
    config = Config()
    writer = SupabaseWriter(config)
    xp_engine = XpEngine(writer, config.network_id)
    achievement_engine = AchievementEngine(writer, config.network_id)
    card_engine = CardEngine(writer, config.network_id)

    print(f"[collector] Connecting to MQTT broker at {config.mqtt_host}:{config.mqtt_port}")
    print(f"[collector] Subscribing to: {config.mqtt_topic}")
    print(f"[collector] Publish topic: {config.mqtt_publish_topic}")
    print(f"[collector] Gateway node: {config.gateway_node_id or 'not set'}")
    print(f"[collector] Writing to Supabase: {config.supabase_url}")
    print(f"[collector] Network: {config.network_id}")

    # Will hold the MQTT client reference for outbound publishing
    mqtt_client_ref = {"client": None}

    def on_connect(client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            print("[collector] Connected to MQTT broker")
            client.subscribe(config.mqtt_topic)
            print(f"[collector] Subscribed to {config.mqtt_topic}")
            writer.log("info", "mqtt", "Connected to MQTT broker and subscribed", metadata={"topic": config.mqtt_topic})
        else:
            print(f"[collector] Connection failed: {reason_code}")
            writer.log("error", "mqtt", f"MQTT connection failed: {reason_code}")

    def on_message(client, userdata, msg):
        try:
            packet = parse_packet(msg.payload)
            if packet is None:
                return

            # Ignore our own outbound echo-backs (type=sendtext published by us)
            if packet["packet_type"] == "sendtext":
                return

            print(f"[collector] {packet['node_id']} | type={packet['packet_type']} rssi={packet['rssi']} snr={packet['snr']} bat={packet['battery_level']}")

            writer.upsert_node(packet)
            writer.insert_telemetry(packet)
            writer.log("debug", "packet", f"{packet['packet_type']} from {packet['node_id']}", node_id=packet["node_id"], metadata={
                "rssi": packet.get("rssi"),
                "snr": packet.get("snr"),
                "battery": packet.get("battery_level"),
            })

            alerts = check_packet_alerts(packet)
            for alert in alerts:
                print(f"[alert] {alert['alert_type']}: {alert['message']}")
                writer.insert_alert(alert)
                writer.log("warn", "alert", f"{alert['alert_type']}: {alert['message']}", node_id=alert.get("node_id"))

            # XP + achievements on every packet
            try:
                xp_engine.award_packet_xp(packet["node_id"])
                achievement_engine.check_on_packet(packet["node_id"])
            except Exception as e:
                print(f"[xp] error: {e}")
                writer.log("error", "xp", f"XP award error: {e}", node_id=packet["node_id"])

            # Broadcast text messages to the dashboard via Supabase Realtime
            if packet.get("text"):
                print(f"[mesh-msg] {packet['node_id']}: {packet['text'][:80]}")
                writer.broadcast_message(packet)
                writer.log("info", "message", f"Mesh message from {packet['node_id']}: {packet['text'][:120]}", node_id=packet["node_id"], metadata={
                    "to": packet.get("to_node_id"),
                    "channel": packet.get("channel_index"),
                })
                writer.log_message_vector(
                    direction="inbound",
                    from_node_id=packet["node_id"],
                    to_node_id=packet.get("to_node_id"),
                    channel_index=packet.get("channel_index", 0),
                )

                # Welcome bot: greet new nodes on first text message
                node = writer.get_node(packet["node_id"])
                if node and (node.get("packets_total") or 0) <= 3:
                    welcome_text = (
                        "Welcome to The Signal, operator. "
                        "Your node has been detected. "
                        "Visit meshguild.vercel.app to complete your Rite of First Signal."
                    )
                    welcome_payload = json.dumps({
                        "type": "sendtext",
                        "payload": welcome_text,
                    })
                    mc = mqtt_client_ref.get("client")
                    if mc:
                        mc.publish(config.mqtt_publish_topic, welcome_payload)
                        print(f"[welcome-bot] greeted {packet['node_id']}")

        except Exception as e:
            print(f"[collector] Error processing message: {e}")
            writer.log("error", "packet", f"Error processing message: {e}")

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
                    writer.log("warn", "alert", f"Node going dark: {alert['node_id']}", node_id=alert["node_id"])
            except Exception as e:
                print(f"[collector] Offline check error: {e}")
                writer.log("error", "system", f"Offline check error: {e}")

    # Start offline checker thread
    checker = threading.Thread(target=offline_checker, daemon=True)
    checker.start()

    def hourly_stats_loop():
        """Background thread: recompute node stats + award uptime XP every hour."""
        while True:
            time.sleep(3600)
            try:
                xp_engine.award_uptime_xp()
                xp_engine.check_streaks()
                achievement_engine.check_night_watch()
                writer.recompute_all_stats()
                writer.log("info", "system", "Hourly stats + XP recompute completed")
            except Exception as e:
                print(f"[collector] Hourly loop error: {e}")
                writer.log("error", "system", f"Hourly loop error: {e}")

    stats_timer = threading.Thread(target=hourly_stats_loop, daemon=True)
    stats_timer.start()

    def outbound_poll_loop():
        """Background thread: poll outbound_queue every 2s, publish to MQTT."""
        while True:
            time.sleep(2)
            try:
                rows = writer.poll_outbound_queue()
                for row in rows:
                    mc = mqtt_client_ref.get("client")
                    if mc is None:
                        continue

                    # Build Meshtastic JSON downlink packet
                    # Docs: https://meshtastic.org/docs/software/integrations/mqtt/
                    # Requires: "from" as decimal node ID, "type", "payload"
                    # Node must have a channel named "mqtt" with downlink enabled

                    # Determine sender node ID (decimal)
                    from_hex = row.get("from_node_id") or config.gateway_node_id
                    from_decimal = None
                    if from_hex:
                        try:
                            from_decimal = int(from_hex.lstrip("!"), 16)
                        except (ValueError, AttributeError):
                            pass

                    if from_decimal is None:
                        print(f"[outbound] SKIPPED — no gateway node configured (set GATEWAY_NODE_ID in .env)")
                        writer.delete_outbound(row["id"])
                        continue

                    payload = {
                        "from": from_decimal,
                        "type": "sendtext",
                        "payload": row["content"],
                    }
                    if row.get("channel_index") is not None:
                        payload["channel"] = row["channel_index"]
                    if row.get("to_node_id"):
                        try:
                            payload["to"] = int(row["to_node_id"].lstrip("!"), 16)
                        except (ValueError, AttributeError):
                            pass

                    topic = config.mqtt_publish_topic
                    mc.publish(topic, json.dumps(payload))
                    print(f"[outbound] sent via {topic}: from={from_decimal} ch={row.get('channel_index', 0)} to={payload.get('to', 'broadcast')} | {row['content'][:80]}")
                    writer.log("info", "outbound", f"Sent message: {row['content'][:120]}", metadata={
                        "from": from_decimal,
                        "to": payload.get("to", "broadcast"),
                        "channel": row.get("channel_index", 0),
                        "topic": topic,
                    })
                    writer.log_message_vector(
                        direction="outbound",
                        from_node_id=row.get("from_node_id"),
                        to_node_id=row.get("to_node_id"),
                        channel_index=row.get("channel_index", 0),
                        player_id=row.get("player_id"),
                    )
                    writer.delete_outbound(row["id"])

            except Exception as e:
                print(f"[outbound] poll error: {e}")
                writer.log("error", "outbound", f"Outbound poll error: {e}")

    outbound_timer = threading.Thread(target=outbound_poll_loop, daemon=True)
    outbound_timer.start()

    def heartbeat_loop():
        """Background thread: send heartbeat every 30 seconds."""
        pid = os.getpid()
        while True:
            writer.send_heartbeat(pid)
            time.sleep(30)

    heartbeat_timer = threading.Thread(target=heartbeat_loop, daemon=True)
    heartbeat_timer.start()

    def ops_command_loop():
        """Background thread: poll for ops commands every 5 seconds."""
        while True:
            time.sleep(5)
            try:
                commands = writer.poll_ops_commands()
                for cmd in commands:
                    cmd_type = cmd.get("command", "")
                    cmd_id = cmd["id"]
                    print(f"[ops] received command: {cmd_type} (id={cmd_id})")

                    if cmd_type == "REBOOT_COLLECTOR":
                        writer.update_ops_command(cmd_id, "executing", "Restarting collector...")
                        writer.log("warn", "ops", "REBOOT_COLLECTOR command received — restarting")
                        print("[ops] REBOOT_COLLECTOR — exiting with code 42 for wrapper restart")
                        writer.update_ops_command(cmd_id, "completed", "Collector restarted")
                        os._exit(42)

                    elif cmd_type == "RESTART_MOSQUITTO":
                        writer.update_ops_command(cmd_id, "executing", "Restarting Mosquitto...")
                        try:
                            result = subprocess.run(
                                ["brew", "services", "restart", "mosquitto"],
                                capture_output=True, text=True, timeout=30
                            )
                            if result.returncode == 0:
                                writer.update_ops_command(cmd_id, "completed", "Mosquitto restarted successfully")
                                print(f"[ops] Mosquitto restarted: {result.stdout.strip()}")
                            else:
                                writer.update_ops_command(cmd_id, "failed", f"Exit {result.returncode}: {result.stderr.strip()}")
                                print(f"[ops] Mosquitto restart failed: {result.stderr.strip()}")
                        except Exception as e:
                            writer.update_ops_command(cmd_id, "failed", str(e))
                            print(f"[ops] Mosquitto restart error: {e}")

                    else:
                        writer.update_ops_command(cmd_id, "failed", f"Unknown command: {cmd_type}")
                        print(f"[ops] Unknown command: {cmd_type}")

            except Exception as e:
                print(f"[ops] command loop error: {e}")

    ops_timer = threading.Thread(target=ops_command_loop, daemon=True)
    ops_timer.start()

    # Log startup
    writer.log("info", "system", "Collector starting", metadata={
        "mqtt_host": config.mqtt_host,
        "mqtt_port": config.mqtt_port,
        "gateway": config.gateway_node_id,
        "network": config.network_id,
        "pid": os.getpid(),
    })

    # Connect MQTT
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    mqtt_client_ref["client"] = client

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
