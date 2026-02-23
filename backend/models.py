"""Pydantic models for all WebSocket messages.

Defines the canonical message schemas for the signaling protocol.
See SRS.md §4 for the full protocol specification.

Client → Server messages: CreateRoomMessage, JoinRoomMessage,
    SignalMessage, VerifyPasswordMessage
Server → Client messages: RoomCreatedResponse, RoomJoinedResponse,
    PeerJoinedResponse, PeerLeftResponse, SignalMessage,
    PasswordResultResponse, ErrorResponse
"""
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────────
# Client → Server messages
# ─────────────────────────────────────────────────────────────

class CreateRoomMessage(BaseModel):
    """Sent by the sender to create a new transfer room."""
    type: Literal["create-room"]
    password: str | None = None


class JoinRoomMessage(BaseModel):
    """Sent by the receiver to join an existing room by code."""
    type: Literal["join-room"]
    code: str

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        """Room codes are always uppercase. Normalize on input."""
        return v.strip().upper()


class SignalMessage(BaseModel):
    """WebRTC signaling message (SDP offer/answer or ICE candidate).
    
    The server relays this opaquely to the other peer in the room.
    The server does NOT inspect or process the payload.
    """
    type: Literal["signal"]
    payload: dict[str, Any]


class VerifyPasswordMessage(BaseModel):
    """Sent by the receiver to verify the room password before connecting."""
    type: Literal["verify-password"]
    password: str


# ─────────────────────────────────────────────────────────────
# Server → Client messages
# ─────────────────────────────────────────────────────────────

class RoomCreatedResponse(BaseModel):
    """Sent to the sender after successful room creation."""
    type: Literal["room-created"] = "room-created"
    room_id: str
    code: str
    url: str


class RoomJoinedResponse(BaseModel):
    """Sent to the receiver after successfully joining a room."""
    type: Literal["room-joined"] = "room-joined"
    room_id: str
    role: Literal["receiver"] = "receiver"
    password_required: bool = False


class PeerJoinedResponse(BaseModel):
    """Sent to Peer A when Peer B joins the same room."""
    type: Literal["peer-joined"] = "peer-joined"


class PeerLeftResponse(BaseModel):
    """Sent to the remaining peer when the other disconnects."""
    type: Literal["peer-left"] = "peer-left"


class PasswordResultResponse(BaseModel):
    """Sent in response to VerifyPasswordMessage."""
    type: Literal["password-result"] = "password-result"
    valid: bool


class ErrorResponse(BaseModel):
    """Sent when any server-side error occurs."""
    type: Literal["error"] = "error"
    code: str   # e.g. ROOM_NOT_FOUND, ROOM_FULL, PASSWORD_INVALID
    message: str


# ─────────────────────────────────────────────────────────────
# Incoming message union type (for parsing)
# ─────────────────────────────────────────────────────────────

IncomingMessage = (
    CreateRoomMessage
    | JoinRoomMessage
    | SignalMessage
    | VerifyPasswordMessage
)
