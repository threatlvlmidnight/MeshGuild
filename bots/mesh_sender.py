"""Send text messages to the Meshtastic mesh via TCP interface."""

import time

import meshtastic.tcp_interface


class MeshSender:
    def __init__(self, host: str, channel: int = 0):
        self.host = host
        self.channel = channel
        self._interface = None

    def connect(self):
        print(f"[mesh] Connecting to radio at {self.host}...")
        self._interface = meshtastic.tcp_interface.TCPInterface(hostname=self.host)
        time.sleep(2)  # let connection stabilize before sending
        print(f"[mesh] Connected")

    def send(self, text: str):
        if not self._interface:
            self.connect()
        # Meshtastic messages are limited to 228 bytes
        if len(text.encode("utf-8")) > 228:
            text = text.encode("utf-8")[:225].decode("utf-8", errors="ignore") + "..."
        self._interface.sendText(text, destinationId="^all", channelIndex=self.channel)
        print(f"[mesh] Sent: {text[:80]}")
        time.sleep(2)  # let message transmit before next action

    def close(self):
        if self._interface:
            time.sleep(1)
            self._interface.close()
            self._interface = None
