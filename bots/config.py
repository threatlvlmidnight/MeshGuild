"""Bot configuration — loaded from bots/.env"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


class BotConfig:
    def __init__(self):
        self.radio_host = os.environ.get("RADIO_HOST", "192.168.86.20")
        self.mesh_channel = int(os.environ.get("MESH_CHANNEL", "0"))

        # NWS weather alert settings
        self.nws_lat = os.environ.get("NWS_LAT", "35.5609")
        self.nws_lon = os.environ.get("NWS_LON", "-97.5564")
        self.weather_poll_seconds = int(os.environ.get("WEATHER_POLL_SECONDS", "1800"))

        # Supabase (for weekly stats)
        self.supabase_url = os.environ.get("SUPABASE_URL")
        self.supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY")
        self.network_id = os.environ.get("NETWORK_ID", "okc-crew")
