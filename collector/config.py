import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from collector directory
load_dotenv(Path(__file__).parent / ".env")


class Config:
    def __init__(self):
        self.mqtt_host = os.environ.get("MQTT_HOST", "localhost")
        self.mqtt_port = int(os.environ.get("MQTT_PORT", "1883"))
        self.mqtt_topic = os.environ.get("MQTT_TOPIC", "msh/2/json/#")
        self.supabase_url = os.environ.get("SUPABASE_URL")
        self.supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY")
        self.supabase_anon_key = os.environ.get("SUPABASE_ANON_KEY")
        self.mqtt_publish_topic = os.environ.get("MQTT_PUBLISH_TOPIC", "msh/2/json/mqtt/")
        self.gateway_node_id = os.environ.get("GATEWAY_NODE_ID", "")  # hex e.g. !02ee16c8
        self.network_id = os.environ.get("NETWORK_ID", "okc-crew")

        if not self.supabase_url:
            raise ValueError("SUPABASE_URL environment variable is required")
        if not self.supabase_service_key:
            raise ValueError("SUPABASE_SERVICE_KEY environment variable is required")
