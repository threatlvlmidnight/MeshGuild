"""Remote node reboot — sends an admin reboot packet over LoRa mesh.

Usage:
    python -m bots.reboot !043294cc           # reboot V01
    python -m bots.reboot !02ee16c8           # reboot V02
    python -m bots.reboot --list              # list known nodes
"""

import sys
import time

import meshtastic.tcp_interface

from bots.config import BotConfig


def list_nodes(host: str):
    """List nodes visible to the radio."""
    iface = meshtastic.tcp_interface.TCPInterface(hostname=host)
    time.sleep(2)
    print("Known nodes:")
    for nid, info in iface.nodes.items():
        user = info.get("user", {})
        short = user.get("shortName", "?")
        long_name = user.get("longName", "?")
        print(f"  {nid}: {short} / {long_name}")
    iface.close()


def reboot_node(host: str, node_id: str):
    """Send a reboot command to a node via mesh admin packet."""
    print(f"[reboot] Connecting to radio at {host}...")
    iface = meshtastic.tcp_interface.TCPInterface(hostname=host)
    time.sleep(2)

    # Verify node exists
    if node_id not in iface.nodes:
        print(f"[reboot] Error: node {node_id} not found in mesh")
        print("[reboot] Known nodes:")
        for nid in iface.nodes:
            print(f"  {nid}")
        iface.close()
        return False

    user = iface.nodes[node_id].get("user", {})
    name = user.get("longName") or user.get("shortName") or node_id
    print(f"[reboot] Sending reboot to {name} ({node_id})...")

    node = iface.getNode(node_id)
    node.reboot(10)  # reboot after 10 seconds
    print(f"[reboot] Reboot command sent — {name} will restart in 10 seconds")
    time.sleep(2)
    iface.close()
    return True


def main():
    config = BotConfig()

    if len(sys.argv) < 2:
        print("Usage: python -m bots.reboot <node_id>")
        print("       python -m bots.reboot --list")
        sys.exit(1)

    if sys.argv[1] == "--list":
        list_nodes(config.radio_host)
    else:
        node_id = sys.argv[1]
        if not node_id.startswith("!"):
            print(f"[reboot] Node ID must start with '!' (got: {node_id})")
            sys.exit(1)
        success = reboot_node(config.radio_host, node_id)
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
