"""Room state management for P2P signaling.

This module manages all in-memory room state: creation, peer tracking,
code generation, expiry, and password verification.

No file data ever passes through this module.
See SRS.md §2.1 for functional requirements.
See backend-doc.md §5 for TDD implementation notes.
"""
import asyncio
import random
import string
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import WebSocket

from config import settings


# ─────────────────────────────────────────────────────────────
# Data model
# ─────────────────────────────────────────────────────────────

@dataclass
class Room:
    """Represents a single transfer session between two peers."""
    room_id: str
    code: str
    password_hash: Optional[str]
    created_at: datetime
    peers: dict[str, WebSocket] = field(default_factory=dict)

    @property
    def is_full(self) -> bool:
        return len(self.peers) >= 2

    @property
    def is_expired(self) -> bool:
        expiry = timedelta(minutes=settings.room_expiry_minutes)
        return datetime.utcnow() - self.created_at > expiry

    @property
    def has_password(self) -> bool:
        return self.password_hash is not None

    def get_other_peer_ws(self, peer_id: str) -> Optional[WebSocket]:
        """Return the WebSocket of the other peer (not the given peer_id)."""
        for pid, ws in self.peers.items():
            if pid != peer_id:
                return ws
        return None


# ─────────────────────────────────────────────────────────────
# Custom exceptions
# ─────────────────────────────────────────────────────────────

class RoomNotFoundError(Exception):
    pass

class RoomFullError(Exception):
    pass

class RoomLimitExceededError(Exception):
    pass


# ─────────────────────────────────────────────────────────────
# Room Manager
# ─────────────────────────────────────────────────────────────

class RoomManager:
    """Manages all in-memory room state.
    
    This is a singleton accessed via the module-level `room_manager` instance.
    All methods that modify state are safe for single-process async use.
    Not designed for multi-process deployments (use Redis for that).
    """

    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self._code_to_room_id: dict[str, str] = {}

    # ── Code generation ──────────────────────────────────────

    def generate_code(self) -> str:
        """Generate a unique 6-character uppercase alphanumeric room code.
        
        Retries on collision (extremely rare but handled correctly).
        See SRS.md §FR-03 for code format requirements.
        """
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(10):  # max 10 attempts before giving up
            code = "".join(random.choices(alphabet, k=6))
            if code not in self._code_to_room_id:
                return code
        raise RuntimeError("Failed to generate unique room code after 10 attempts")

    # ── Room CRUD ────────────────────────────────────────────

    async def create_room(self, password: Optional[str] = None) -> Room:
        """Create a new room and store it in memory.
        
        Args:
            password: Optional plaintext password. Will be bcrypt-hashed.
                      The plaintext is immediately discarded after hashing.
        
        Returns:
            The newly created Room object.
            
        Raises:
            RoomLimitExceededError: If MAX_ROOMS is reached.
        """
        if len(self.rooms) >= settings.max_rooms:
            raise RoomLimitExceededError(f"Maximum room limit of {settings.max_rooms} reached")

        room_id = str(uuid.uuid4())
        code = self.generate_code()
        
        password_hash = None
        if password:
            # Hash with bcrypt — plaintext password is NOT stored
            salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
            password_hash = bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

        room = Room(
            room_id=room_id,
            code=code,
            password_hash=password_hash,
            created_at=datetime.utcnow(),
        )

        self.rooms[room_id] = room
        self._code_to_room_id[code] = room_id
        return room

    def get_room(self, room_id: str) -> Optional[Room]:
        """Get a room by its UUID."""
        return self.rooms.get(room_id)

    def get_room_by_code(self, code: str) -> Optional[Room]:
        """Get a room by its 6-digit code (case-insensitive)."""
        code = code.strip().upper()
        room_id = self._code_to_room_id.get(code)
        if room_id is None:
            return None
        return self.rooms.get(room_id)

    def is_room_full(self, room_id: str) -> bool:
        """Return True if the room has 2 peers."""
        room = self.get_room(room_id)
        return room is not None and room.is_full

    def delete_room(self, room_id: str) -> None:
        """Remove a room and its code mapping from memory."""
        room = self.rooms.pop(room_id, None)
        if room:
            self._code_to_room_id.pop(room.code, None)

    # ── Peer management ──────────────────────────────────────

    def add_peer(self, room_id: str, peer_id: str, websocket: WebSocket) -> None:
        """Add a peer's WebSocket connection to a room."""
        room = self.get_room(room_id)
        if room is None:
            raise RoomNotFoundError(f"Room {room_id} not found")
        if room.is_full:
            raise RoomFullError(f"Room {room_id} is full")
        room.peers[peer_id] = websocket

    def remove_peer(self, room_id: str, peer_id: str) -> None:
        """Remove a peer from a room. Deletes the room if it becomes empty."""
        room = self.get_room(room_id)
        if room:
            room.peers.pop(peer_id, None)
            if len(room.peers) == 0:
                self.delete_room(room_id)

    # ── Password verification ─────────────────────────────────

    def verify_password(self, room_id: str, password: Optional[str]) -> bool:
        """Verify a password against the stored bcrypt hash.
        
        Returns True if:
        - The room has no password (any/None password is accepted)
        - The provided password matches the stored hash
        
        Returns False if:
        - The room has a password and the provided password is wrong
        - The room has a password and None was provided
        """
        room = self.get_room(room_id)
        if room is None:
            return False
        if not room.has_password:
            return True
        if password is None:
            return False
        return bcrypt.checkpw(
            password.encode("utf-8"),
            room.password_hash.encode("utf-8")
        )

    # ── Expiry cleanup ────────────────────────────────────────

    async def cleanup_expired_rooms(self) -> int:
        """Remove all expired rooms. Returns the count of rooms removed.
        
        Called periodically by the background task in main.py.
        See SRS.md §FR-01 for expiry requirements.
        """
        expired_ids = [
            room_id for room_id, room in self.rooms.items()
            if room.is_expired
        ]
        for room_id in expired_ids:
            self.delete_room(room_id)
        return len(expired_ids)


# Module-level singleton
room_manager = RoomManager()
