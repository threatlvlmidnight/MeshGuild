import os
from collector.config import Config


def test_config_defaults(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-key")
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    config = Config()
    assert config.mqtt_host == "localhost"
    assert config.mqtt_port == 1883
    assert config.mqtt_topic == "msh/US/2/json/#"
    assert config.supabase_url == "https://test.supabase.co"
    assert config.supabase_service_key == "test-key"
    assert config.network_id == "okc-crew"


def test_config_custom_values(monkeypatch):
    monkeypatch.setenv("MQTT_HOST", "192.168.1.100")
    monkeypatch.setenv("MQTT_PORT", "1884")
    monkeypatch.setenv("MQTT_TOPIC", "custom/topic/#")
    monkeypatch.setenv("SUPABASE_URL", "https://custom.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "custom-key")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    monkeypatch.setenv("NETWORK_ID", "other-network")
    config = Config()
    assert config.mqtt_host == "192.168.1.100"
    assert config.mqtt_port == 1884
    assert config.network_id == "other-network"


def test_config_missing_url(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "key")
    try:
        Config()
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "SUPABASE_URL" in str(e)


def test_config_missing_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    try:
        Config()
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "SUPABASE_SERVICE_KEY" in str(e)
