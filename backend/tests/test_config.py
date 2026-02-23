"""Tests for configuration loading."""
import os
import pytest
from unittest.mock import patch


def test_config_loads_app_env():
    """Config should load APP_ENV from environment."""
    with patch.dict(os.environ, {"APP_ENV": "testing"}):
        # Force reimport to pick up new env
        import importlib
        import config
        importlib.reload(config)
        assert config.settings.app_env == "testing"


def test_config_has_required_fields():
    """Config object must have all required fields."""
    from config import settings
    assert hasattr(settings, 'app_host')
    assert hasattr(settings, 'app_port')
    assert hasattr(settings, 'app_env')
    assert hasattr(settings, 'secret_key')
    assert hasattr(settings, 'bcrypt_rounds')
    assert hasattr(settings, 'turn_url')
    assert hasattr(settings, 'turn_username')
    assert hasattr(settings, 'turn_credential')
    assert hasattr(settings, 'room_expiry_minutes')
    assert hasattr(settings, 'max_rooms')


def test_bcrypt_rounds_is_integer():
    from config import settings
    assert isinstance(settings.bcrypt_rounds, int)
    assert settings.bcrypt_rounds >= 4


def test_room_expiry_is_positive():
    from config import settings
    assert settings.room_expiry_minutes > 0
