"""Integration tests for the WebSocket signaling endpoint.

Tests the full message handling flow without a real browser.
Uses FastAPI TestClient for HTTP endpoints and
httpx for WebSocket connections.

See SRS.md §4 for the message protocol being tested.
"""
import pytest
import json
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def reset_rooms():
    from room_manager import room_manager
    room_manager.rooms.clear()
    room_manager._code_to_room_id.clear()
    yield
    room_manager.rooms.clear()
    room_manager._code_to_room_id.clear()


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


# ── HTTP endpoints ───────────────────────────────────────────

def test_health_check(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ice_config_returns_stun_server(client):
    response = client.get("/api/ice-config")
    assert response.status_code == 200
    data = response.json()
    assert "iceServers" in data
    # At minimum, a STUN server must be present
    stun_servers = [s for s in data["iceServers"] if "stun" in s.get("urls", "")]
    assert len(stun_servers) >= 1


def test_room_check_nonexistent_code(client):
    response = client.get("/api/room/ZZZZZZ")
    assert response.status_code == 404


# ── WebSocket: Room creation ─────────────────────────────────

def test_ws_create_room(client):
    with client.websocket_connect("/ws/new") as ws:
        ws.send_json({"type": "create-room"})
        msg = ws.receive_json()
        assert msg["type"] == "room-created"
        assert "code" in msg
        assert len(msg["code"]) == 6
        assert "roomId" in msg
        assert "url" in msg


def test_ws_create_room_with_password(client):
    with client.websocket_connect("/ws/new") as ws:
        ws.send_json({"type": "create-room", "password": "secret"})
        msg = ws.receive_json()
        assert msg["type"] == "room-created"


# ── WebSocket: Room joining ──────────────────────────────────

def test_ws_join_room_sends_peer_joined_to_creator(client):
    """When receiver joins, sender must receive peer-joined."""
    with client.websocket_connect("/ws/new") as sender_ws:
        sender_ws.send_json({"type": "create-room"})
        created = sender_ws.receive_json()
        room_id = created["roomId"]

        with client.websocket_connect(f"/ws/{room_id}") as receiver_ws:
            receiver_ws.send_json({"type": "join-room", "code": created["code"]})
            
            # Receiver should get room-joined
            joined_msg = receiver_ws.receive_json()
            assert joined_msg["type"] == "room-joined"
            
            # Sender should get peer-joined
            peer_msg = sender_ws.receive_json()
            assert peer_msg["type"] == "peer-joined"


def test_ws_join_nonexistent_room_returns_error(client):
    with client.websocket_connect("/ws/new") as ws:
        ws.send_json({"type": "join-room", "code": "ZZZZZZ"})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert msg["code"] == "ROOM_NOT_FOUND"


# ── WebSocket: Signal relay ──────────────────────────────────

def test_ws_signal_is_relayed_to_other_peer(client):
    """Signal messages must be forwarded opaquely to the other peer."""
    with client.websocket_connect("/ws/new") as sender_ws:
        sender_ws.send_json({"type": "create-room"})
        created = sender_ws.receive_json()
        room_id = created["roomId"]

        with client.websocket_connect(f"/ws/{room_id}") as receiver_ws:
            receiver_ws.send_json({"type": "join-room", "code": created["code"]})
            receiver_ws.receive_json()   # room-joined
            sender_ws.receive_json()     # peer-joined

            # Sender sends an offer signal
            offer_payload = {"type": "offer", "sdp": "v=0\r\no=..."}
            sender_ws.send_json({"type": "signal", "payload": offer_payload})

            # Receiver must receive it
            relayed = receiver_ws.receive_json()
            assert relayed["type"] == "signal"
            assert relayed["payload"] == offer_payload


# ── WebSocket: Disconnection ─────────────────────────────────

def test_ws_peer_left_sent_on_disconnect(client):
    """When a peer disconnects, the other peer receives peer-left."""
    with client.websocket_connect("/ws/new") as sender_ws:
        sender_ws.send_json({"type": "create-room"})
        created = sender_ws.receive_json()
        room_id = created["roomId"]

        with client.websocket_connect(f"/ws/{room_id}") as receiver_ws:
            receiver_ws.send_json({"type": "join-room", "code": created["code"]})
            receiver_ws.receive_json()   # room-joined
            sender_ws.receive_json()     # peer-joined
            # receiver disconnects (context manager exit)

        # Sender should receive peer-left
        msg = sender_ws.receive_json()
        assert msg["type"] == "peer-left"
