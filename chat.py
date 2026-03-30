"""
Meshtastic console chat — connects to Radio 2 on COM5 and chats over LoRa.
Usage: python chat.py
"""

import threading
import time
from datetime import datetime
import meshtastic.serial_interface
from pubsub import pub

PORT = "COM5"
CHANNEL = 0


def timestamp():
    return datetime.now().strftime("%H:%M:%S")


def on_receive(packet, interface):
    try:
        if packet.get("decoded", {}).get("portnum") == "TEXT_MESSAGE_APP":
            text = packet["decoded"]["text"]
            sender = packet.get("fromId", "unknown")
            # Don't echo our own messages
            if sender == interface.myInfo.my_node_num:
                return
            print(f"\r\033[K[{timestamp()}] \033[92m{sender}\033[0m: {text}")
            print("You: ", end="", flush=True)
    except Exception:
        pass


def on_connection(interface, topic=pub.AUTO_TOPIC):
    pass


def main():
    print(f"Connecting to radio on {PORT}...")
    try:
        interface = meshtastic.serial_interface.SerialInterface(PORT)
    except Exception as e:
        print(f"Could not connect to {PORT}: {e}")
        return

    node = interface.getNode("^local")
    name = interface.myInfo
    print(f"Connected — {PORT}")
    print(f"Type a message and press Enter to send. Ctrl+C to quit.\n")

    pub.subscribe(on_receive, "meshtastic.receive.text")

    try:
        while True:
            print("You: ", end="", flush=True)
            text = input()
            if text.strip():
                interface.sendText(text, channelIndex=CHANNEL)
                print(f"\r\033[K[{timestamp()}] \033[94mYou\033[0m: {text}")
    except KeyboardInterrupt:
        print("\nDisconnecting...")
    finally:
        interface.close()


if __name__ == "__main__":
    main()
