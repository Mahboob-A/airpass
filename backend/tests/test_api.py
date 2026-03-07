"""Integration tests for HTTP API endpoints."""
import pytest


@pytest.fixture
def client():
    from main import app
    from fastapi.testclient import TestClient
    return TestClient(app)


@pytest.fixture(autouse=True)
def reset_rooms():
    from room_manager import room_manager
    room_manager.rooms.clear()
    room_manager._code_to_room_id.clear()
    yield
    room_manager.rooms.clear()
    room_manager._code_to_room_id.clear()


def test_health_check_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_room_check_existing_room(client):
    from room_manager import room_manager
    import asyncio
    room = asyncio.get_event_loop().run_until_complete(
        room_manager.create_room(password=None)
    )
    resp = client.get(f"/api/room/{room.code}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["exists"] is True
    assert data["full"] is False


def test_room_check_full_room(client):
    from room_manager import room_manager
    from unittest.mock import AsyncMock
    import asyncio
    room = asyncio.get_event_loop().run_until_complete(
        room_manager.create_room(password=None)
    )
    room_manager.add_peer(room.room_id, "p1", AsyncMock())
    room_manager.add_peer(room.room_id, "p2", AsyncMock())
    resp = client.get(f"/api/room/{room.code}")
    assert resp.status_code == 200
    assert resp.json()["full"] is True
