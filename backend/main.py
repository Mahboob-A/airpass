"""FastAPI application entry point.

Defines all HTTP routes and the WebSocket signaling endpoint.
All business logic is delegated to room_manager.py.
This file handles only: routing, WebSocket lifecycle, and message dispatch.

See SRS.md §5 for HTTP endpoint specs.
See SRS.md §4 for WebSocket message protocol.
See backend-doc.md §6 for implementation rationale.
"""
import asyncio
import json
import uuid
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from config import settings
from models import (
    CreateRoomMessage, JoinRoomMessage, SignalMessage,
    VerifyPasswordMessage,
    RoomCreatedResponse, RoomJoinedResponse, PeerJoinedResponse,
    PeerLeftResponse, PasswordResultResponse, ErrorResponse,
)
from room_manager import room_manager, RoomNotFoundError, RoomFullError

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# App lifecycle
# ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background tasks on startup, clean up on shutdown."""
    cleanup_task = asyncio.create_task(periodic_room_cleanup())
    yield
    cleanup_task.cancel()


async def periodic_room_cleanup():
    """Background task: remove expired rooms every 5 minutes."""
    while True:
        await asyncio.sleep(300)  # 5 minutes
        removed = await room_manager.cleanup_expired_rooms()
        if removed > 0:
            logger.info(f"Cleaned up {removed} expired rooms")


# ─────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="P2P Share Signaling Server",
    description="WebSocket signaling relay for P2P file transfer. Files never touch this server.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: permissive in dev, restrictive in production
# See deployment-doc.md §3 for production Nginx CORS handling
if settings.is_development:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ─────────────────────────────────────────────────────────────
# HTTP endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Health check endpoint. Returns 200 OK if server is running."""
    return {"status": "ok"}


@app.get("/api/room/{code}")
async def check_room(code: str):
    """Check if a room with this code exists and whether it's full.
    
    Used by the join page to validate a code before initiating a WebSocket connection.
    See SRS.md §5 for the endpoint spec.
    """
    room = room_manager.get_room_by_code(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found or expired")
    return {
        "exists": True,
        "full": room.is_full,
        "password_required": room.has_password,
    }


@app.get("/api/ice-config")
async def get_ice_config():
    """Return ICE server configuration (STUN + TURN) for the WebRTC client.
    
    TURN credentials are loaded from environment — never hardcoded.
    See SRS.md §FR-33, deployment-doc.md §4 for TURN configuration.
    See frontend-doc.md §4.2 for how the client uses this response.
    """
    ice_servers = [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun1.l.google.com:19302"},
    ]

    # Add TURN server if configured (required for production)
    if settings.turn_url:
        ice_servers.append({
            "urls": settings.turn_url,
            "username": settings.turn_username,
            "credential": settings.turn_credential,
        })

    return {"iceServers": ice_servers}


# ─────────────────────────────────────────────────────────────
# WebSocket endpoint
# ─────────────────────────────────────────────────────────────

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """Main WebSocket signaling endpoint.
    
    Accepts connections from both senders (room_id="new") and receivers.
    Routes all signaling messages between the two peers in a room.
    
    Message flow: see SRS.md §4 and backend-doc.md §1.3
    """
    await websocket.accept()
    peer_id = str(uuid.uuid4())
    current_room_id: str | None = None

    try:
        async for raw_message in websocket.iter_text():
            try:
                data = json.loads(raw_message)
            except json.JSONDecodeError:
                await _send_error(websocket, "INVALID_JSON", "Message must be valid JSON")
                continue

            msg_type = data.get("type")

            # ── Create room ──────────────────────────────────
            if msg_type == "create-room":
                try:
                    msg = CreateRoomMessage(**data)
                    room = await room_manager.create_room(password=msg.password)
                    current_room_id = room.room_id
                    room_manager.add_peer(room.room_id, peer_id, websocket)

                    base_url = _get_base_url(websocket)
                    # JSON key convention: camelCase for client
                    await websocket.send_text(json.dumps({
                        "type": "room-created",
                        "roomId": room.room_id,
                        "code": room.code,
                        "url": f"{base_url}/join/{room.code}",
                    }))

                except Exception as e:
                    await _send_error(websocket, "CREATE_FAILED", str(e))

            # ── Join room ────────────────────────────────────
            elif msg_type == "join-room":
                try:
                    msg = JoinRoomMessage(**data)
                    room = room_manager.get_room_by_code(msg.code)

                    if room is None:
                        await _send_error(websocket, "ROOM_NOT_FOUND", "Room not found or expired")
                        continue

                    if room.is_full:
                        await _send_error(websocket, "ROOM_FULL", "Room is full")
                        continue

                    current_room_id = room.room_id
                    room_manager.add_peer(room.room_id, peer_id, websocket)

                    # Notify the receiver they joined
                    await websocket.send_text(json.dumps({
                        "type": "room-joined",
                        "roomId": room.room_id,
                        "role": "receiver",
                        "passwordRequired": room.has_password,
                    }))

                    # Notify the sender that a peer joined
                    other_ws = room.get_other_peer_ws(peer_id)
                    if other_ws:
                        await other_ws.send_text(json.dumps({"type": "peer-joined"}))

                except RoomFullError:
                    await _send_error(websocket, "ROOM_FULL", "Room is already full")

            # ── Verify password ──────────────────────────────
            elif msg_type == "verify-password":
                if not current_room_id:
                    await _send_error(websocket, "NOT_IN_ROOM", "Must join a room first")
                    continue
                msg = VerifyPasswordMessage(**data)
                valid = room_manager.verify_password(current_room_id, msg.password)
                await websocket.send_text(json.dumps({
                    "type": "password-result",
                    "valid": valid,
                }))

            # ── Relay signal ─────────────────────────────────
            elif msg_type == "signal":
                if not current_room_id:
                    await _send_error(websocket, "NOT_IN_ROOM", "Must join a room first")
                    continue
                room = room_manager.get_room(current_room_id)
                if room is None:
                    await _send_error(websocket, "ROOM_NOT_FOUND", "Room expired")
                    continue
                other_ws = room.get_other_peer_ws(peer_id)
                if other_ws:
                    # Relay opaquely — server does NOT inspect signal content
                    await other_ws.send_text(raw_message)

            else:
                await _send_error(websocket, "UNKNOWN_TYPE", f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        logger.debug(f"Peer {peer_id} disconnected")

    finally:
        # Clean up: remove peer and notify the other peer
        if current_room_id:
            room = room_manager.get_room(current_room_id)
            if room:
                other_ws = room.get_other_peer_ws(peer_id)
                room_manager.remove_peer(current_room_id, peer_id)
                if other_ws:
                    try:
                        await other_ws.send_text(json.dumps({"type": "peer-left"}))
                    except Exception:
                        pass  # Other peer may have already disconnected


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

async def _send_error(websocket: WebSocket, code: str, message: str) -> None:
    """Send an error message to the client."""
    try:
        await websocket.send_text(json.dumps({
            "type": "error",
            "code": code,
            "message": message,
        }))
    except Exception:
        pass  # WebSocket may already be closed


def _get_base_url(websocket: WebSocket) -> str:
    """Derive the base URL from the WebSocket request headers."""
    scheme = "https" if websocket.headers.get("x-forwarded-proto") == "https" else "http"
    host = websocket.headers.get("host", "localhost:8000")
    return f"{scheme}://{host}"


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.is_development,
    )
