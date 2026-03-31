"""NWS Weather Alert Bot — polls for severe weather and sends alerts to the mesh.

Usage:
    python -m bots.weather
"""

import time
import requests

from bots.config import BotConfig
from bots.mesh_sender import MeshSender

NWS_API = "https://api.weather.gov/alerts/active"
USER_AGENT = "MeshGuild Weather Bot (github.com/threatlvlmidnight/MeshGuild)"

# NWS severity levels we care about (skip minor/unknown)
SEVERITY_FILTER = {"Extreme", "Severe", "Moderate"}


def fetch_alerts(lat: str, lon: str) -> list[dict]:
    """Fetch active NWS alerts for a lat/lon point."""
    resp = requests.get(
        NWS_API,
        params={"point": f"{lat},{lon}", "status": "actual", "message_type": "alert"},
        headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json"},
        timeout=15,
    )
    resp.raise_for_status()
    features = resp.json().get("features", [])

    alerts = []
    for f in features:
        props = f.get("properties", {})
        severity = props.get("severity", "Unknown")
        if severity not in SEVERITY_FILTER:
            continue
        alerts.append({
            "id": props.get("id", ""),
            "event": props.get("event", "Unknown"),
            "severity": severity,
            "headline": props.get("headline", ""),
            "description": props.get("description", ""),
            "areas": props.get("areaDesc", ""),
        })
    return alerts


def format_alert(alert: dict) -> str:
    """Format an NWS alert for mesh broadcast (228-byte limit)."""
    # Build a compact message
    msg = f"[NWS {alert['severity'].upper()}]\n{alert['event']}\n{alert['headline']}"
    return msg


def main():
    config = BotConfig()
    sender = MeshSender(config.radio_host, config.mesh_channel)
    seen_ids: set[str] = set()

    print(f"[weather] Polling NWS for ({config.nws_lat}, {config.nws_lon})")
    print(f"[weather] Poll interval: {config.weather_poll_seconds}s")
    print(f"[weather] Severity filter: {SEVERITY_FILTER}")

    while True:
        try:
            alerts = fetch_alerts(config.nws_lat, config.nws_lon)
            new_alerts = [a for a in alerts if a["id"] not in seen_ids]

            if new_alerts:
                print(f"[weather] {len(new_alerts)} new alert(s)")
                for alert in new_alerts:
                    seen_ids.add(alert["id"])
                    msg = format_alert(alert)
                    print(f"[weather] Broadcasting: {alert['event']}")
                    try:
                        sender.send(msg)
                    except Exception as e:
                        print(f"[weather] Failed to send: {e}")
            else:
                print(f"[weather] No new alerts ({len(seen_ids)} tracked)")

        except requests.RequestException as e:
            print(f"[weather] NWS API error: {e}")
        except Exception as e:
            print(f"[weather] Unexpected error: {e}")

        time.sleep(config.weather_poll_seconds)


if __name__ == "__main__":
    main()
