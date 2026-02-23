# backend-doc.md — Backend Implementation Mastery Guide
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Domain:** Backend (Python 3.12 + FastAPI + WebSocket)  
**Role:** Mastery document — step-by-step implementation guide for everything backend.

> **For AI Agents:** This is the Layer 3 mastery document for the backend. Before reading this, you must have read `BRD.md` (why), `SRS.md` (what), and `AGENTS.md` (how to orchestrate). This document tells you *exactly* how to implement the backend, file by file, function by function, test by test. Follow the section order — it matches the sprint order. Cross-references to `SRS.md` are provided throughout. For deployment context (Docker, env vars in production), see `deployment-doc.md`. For how the frontend calls these APIs, see `frontend-doc.md`.

---

## 1. Backend Architecture Overview

### 1.1 What the backend does (and does NOT do)

The backend is a **pure signaling relay**. Its complete job is:

1. Accept WebSocket connections from browser clients
2. Create and manage in-memory room state
3. Route JSON messages between two peers in the same room
4. Expose a small HTTP API for room lookup and ICE config

**The backend NEVER:**
- Receives file bytes (not even a single byte of file data)
- Stores any file content in memory, disk, or database
- Processes SDP or ICE candidate content (it relays them opaque)
- Requires authentication or user sessions

This is not a simplification — it is the core privacy architecture. See `BRD.md §BR-01`.

### 1.2 Database decision: in-memory only (LMDB/SQLite/Redis: not needed)

> **Definitive answer to the database question.** Do not add a database to this project.

**The short answer:** P2P Share requires no database. In-memory Python dicts are the correct and complete storage solution.

**Why not LMDB?**

LMDB is an embedded key-value store optimised for read-heavy workloads. It would only make sense here if you needed room state to survive server restarts. But rooms are ephemeral by design:

- A room exists for a single file transfer session (≤ 30 minutes)
- If the server restarts, any open transfer fails anyway (the WebSocket connection drops)
- Persisting rooms across restarts buys nothing — the WebSocket connections are gone

Other open-source P2P signaling servers (FilePizza, Web Wormhole, PairDrop) all use in-memory state for exactly this reason. There is no production precedent for database-backed ephemeral signaling rooms.

**The only reason you'd add persistence:** if you want rooms to survive server restarts AND clients can transparently reconnect their WebSocket. That is a significantly more complex system (reconnection tokens, heartbeats, state reconciliation) and is explicitly out of scope per `BRD.md §7`.

**Decision table:**

| Need | Solution |
|------|---------|
| Room state during a session | `dict` in `RoomManager` ✅ |
| Room state across server restarts | Not needed — out of scope |
| Room state across multiple server processes | Not needed — single process with `--workers 1` |
| File content storage | Never — architectural prohibition |

**If you ever do need persistence** (e.g., adding named rooms or resumable transfers in a future version), Redis with `EXPIRE` is the right choice — not LMDB. Redis handles WebSocket-scale pub/sub, has built-in TTL-based expiry, and is designed for this exact use case. LMDB is for embedded single-process read-heavy use. See `SRS.md §7` for what is in scope.

### 1.3 Module responsibilities

| File | Single Responsibility |
|------|----------------------|
| `main.py` | FastAPI app definition, route registration, WebSocket endpoint, startup/shutdown |
| `room_manager.py` | All room state: create, join, leave, expire, code generation |
| `models.py` | All Pydantic models for incoming and outgoing WebSocket messages |
| `config.py` | Load all settings from environment; single source of truth for config |

> **For AI Agents:** Never put room logic in `main.py`. Never put HTTP handling in `room_manager.py`. The module boundary is strict. See `SRS.md §1.3` for the canonical structure.

### 1.4 Data flow diagram

```
Browser A                    FastAPI Server                   Browser B
    |                              |                               |
    |  WS connect /ws/{room_id}   |                               |
    |----------------------------->|                               |
    |  { type: "create-room" }    |                               |
    |----------------------------->|                               |
    |                              | room created, stored in       |
    |                              | RoomManager.rooms dict        |
    |  { type: "room-created" }   |                               |
    |<-----------------------------|                               |
    |                              |   WS connect /ws/{room_id}   |
    |                              |<------------------------------|
    |                              |   { type: "join-room" }      |
    |                              |<------------------------------|
    |  { type: "peer-joined" }    |                               |
    |<-----------------------------|  { type: "room-joined" }     |
    |                              |------------------------------>|
    |  { type: "signal",          |                               |
    |    payload: {offer} }       |                               |
    |----------------------------->|                               |
    |                              |  { type: "signal",           |
    |                              |    payload: {offer} }        |
    |                              |------------------------------>|
    |                              |  { type: "signal",           |
    |                              |    payload: {answer} }       |
    |                              |<------------------------------|
    |  { type: "signal",          |                               |
    |    payload: {answer} }      |                               |
    |<-----------------------------|                               |
    |  ...ICE candidates relayed both ways...                     |
    |                                                             |
    |<============= WebRTC DataChannel (P2P, no server) =========>|
    |                    File bytes flow here                     |
```

---

## 2. Project Setup (Sprint 1 Start)

### 2.1 Initialize the backend project

```bash
mkdir -p p2p-share/backend/tests
cd p2p-share/backend

# Create virtual environment with Python 3.12
uv venv --python 3.12

# Activate
source .venv/bin/activate

# Create requirements.txt
cat > requirements.txt << 'EOF'
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
bcrypt>=4.1.0
python-dotenv>=1.0.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.26.0
black>=24.0.0
ruff>=0.2.0
pytest-cov>=4.1.0
EOF

# Install all dependencies
uv pip install -r requirements.txt

# Create test init file
touch tests/__init__.py
```

### 2.2 `.env` file

Create `backend/.env` (never commit this):

```env
APP_HOST=0.0.0.0
APP_PORT=8000
APP_ENV=development
SECRET_KEY=dev-secret-key-change-in-production
BCRYPT_ROUNDS=12
TURN_URL=turn:openrelay.metered.ca:80
TURN_USERNAME=dev-username
TURN_CREDENTIAL=dev-password
ROOM_EXPIRY_MINUTES=30
MAX_ROOMS=5000
```

Create `backend/.env.example` (commit this):

```env
APP_HOST=0.0.0.0
APP_PORT=8000
APP_ENV=development
SECRET_KEY=change-me-to-random-32-bytes-hex
BCRYPT_ROUNDS=12
TURN_URL=turn:your-turn-server:3478
TURN_USERNAME=your-username
TURN_CREDENTIAL=your-password
ROOM_EXPIRY_MINUTES=30
MAX_ROOMS=5000
```

### 2.3 `pytest.ini` configuration

Create `backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
```

### 2.4 CORS configuration note

In development, the frontend runs on `http://localhost:3000` and the backend on `http://localhost:8000`. CORS must be configured in `main.py` to allow the frontend origin.

In production, Nginx serves both from the same domain, so CORS is irrelevant. The `APP_ENV` variable controls whether permissive dev CORS or strict production CORS is used.

---

## 3. Implementation: `config.py`

### 3.1 TDD — write the test first

Create `backend/tests/test_config.py`:

```python
"""Tests for configuration loading."""
import os
import pytest
from unittest.mock import patch


def test_config_loads_app_env():
    """Config should load APP_ENV from environment."""
    with patch.dict(os.environ, {"APP_ENV": "testing"}):
        # Force reimport to pick up new env
        import importlib
        from backend import config
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
```

### 3.2 Implement `config.py`

```python
"""Application configuration loaded from environment variables.

This is the single source of truth for all settings.
Never access os.environ directly outside this module.

See SRS.md §9 for the complete list of environment variables.
"""
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """All application settings, loaded from environment or .env file."""

    # Server
    app_host: str = Field(default="0.0.0.0", env="APP_HOST")
    app_port: int = Field(default=8000, env="APP_PORT")
    app_env: str = Field(default="development", env="APP_ENV")

    # Security
    secret_key: str = Field(default="dev-secret-key", env="SECRET_KEY")
    bcrypt_rounds: int = Field(default=12, env="BCRYPT_ROUNDS")

    # TURN server (required for production; see deployment-doc.md §4)
    turn_url: str = Field(default="", env="TURN_URL")
    turn_username: str = Field(default="", env="TURN_USERNAME")
    turn_credential: str = Field(default="", env="TURN_CREDENTIAL")

    # Room management
    room_expiry_minutes: int = Field(default=30, env="ROOM_EXPIRY_MINUTES")
    max_rooms: int = Field(default=5000, env="MAX_ROOMS")

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()
```

---

## 4. Implementation: `models.py`

### 4.1 TDD — write tests first

Create `backend/tests/test_models.py`:

```python
"""Tests for Pydantic message models.

All WebSocket message schemas must be validated here.
See SRS.md §4 for the canonical message protocol.
"""
import pytest
from pydantic import ValidationError


def test_create_room_message_no_password():
    from models import CreateRoomMessage
    msg = CreateRoomMessage(type="create-room")
    assert msg.type == "create-room"
    assert msg.password is None


def test_create_room_message_with_password():
    from models import CreateRoomMessage
    msg = CreateRoomMessage(type="create-room", password="secret")
    assert msg.password == "secret"


def test_join_room_message_requires_code():
    from models import JoinRoomMessage
    with pytest.raises(ValidationError):
        JoinRoomMessage(type="join-room")  # missing code


def test_join_room_message_normalizes_code_to_uppercase():
    from models import JoinRoomMessage
    msg = JoinRoomMessage(type="join-room", code="x7k2p9")
    assert msg.code == "X7K2P9"


def test_signal_message_requires_payload():
    from models import SignalMessage
    with pytest.raises(ValidationError):
        SignalMessage(type="signal")  # missing payload


def test_room_created_response_has_required_fields():
    from models import RoomCreatedResponse
    msg = RoomCreatedResponse(
        type="room-created",
        room_id="test-uuid",
        code="X7K2P9",
        url="https://example.com/join/X7K2P9"
    )
    assert msg.room_id == "test-uuid"
    assert msg.code == "X7K2P9"


def test_error_response_has_code_and_message():
    from models import ErrorResponse
    msg = ErrorResponse(
        type="error",
        code="ROOM_NOT_FOUND",
        message="Room not found or expired"
    )
    assert msg.code == "ROOM_NOT_FOUND"


def test_verify_password_message():
    from models import VerifyPasswordMessage
    msg = VerifyPasswordMessage(type="verify-password", password="secret")
    assert msg.password == "secret"
```

### 4.2 Implement `models.py`

```python
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
```

---

## 5. Implementation: `room_manager.py`

### 5.1 TDD — write tests first

Create `backend/tests/test_room_manager.py`:

```python
"""Unit tests for RoomManager.

All room state logic must be tested here before implementation.
See SRS.md §2.1 for room management functional requirements.
"""
import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime, timedelta


@pytest.fixture(autouse=True)
def reset_rooms():
    """Ensure clean state between tests."""
    from room_manager import room_manager
    room_manager.rooms.clear()
    yield
    room_manager.rooms.clear()


# ── Code generation ──────────────────────────────────────────

def test_generate_code_returns_6_characters():
    from room_manager import room_manager
    code = room_manager.generate_code()
    assert len(code) == 6


def test_generate_code_is_uppercase_alphanumeric():
    from room_manager import room_manager
    code = room_manager.generate_code()
    assert code.isalnum()
    assert code == code.upper()


def test_generate_code_produces_unique_values():
    from room_manager import room_manager
    codes = {room_manager.generate_code() for _ in range(100)}
    # 100 codes should almost certainly be unique (collision space is huge)
    assert len(codes) > 90


# ── Room creation ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_room_returns_room_object():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    assert room.room_id is not None
    assert room.code is not None
    assert len(room.code) == 6


@pytest.mark.asyncio
async def test_create_room_stores_in_rooms_dict():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    assert room.room_id in room_manager.rooms


@pytest.mark.asyncio
async def test_create_room_with_password_hashes_it():
    from room_manager import room_manager
    import bcrypt
    room = await room_manager.create_room(password="secret")
    # The stored hash must NOT be the plaintext password
    assert room.password_hash is not None
    assert room.password_hash != "secret"
    # But it must verify correctly
    assert bcrypt.checkpw(b"secret", room.password_hash.encode())


@pytest.mark.asyncio
async def test_create_room_no_password_stores_none():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    assert room.password_hash is None


# ── Room lookup ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_room_by_code_returns_correct_room():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    found = room_manager.get_room_by_code(room.code)
    assert found is not None
    assert found.room_id == room.room_id


@pytest.mark.asyncio
async def test_get_room_by_code_returns_none_for_missing():
    from room_manager import room_manager
    result = room_manager.get_room_by_code("ZZZZZZ")
    assert result is None


@pytest.mark.asyncio
async def test_get_room_by_code_is_case_insensitive():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    found = room_manager.get_room_by_code(room.code.lower())
    assert found is not None


# ── Peer management ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_room_starts_with_no_peers():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    assert len(room.peers) == 0


@pytest.mark.asyncio
async def test_add_peer_increments_count():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    mock_ws = AsyncMock()
    room_manager.add_peer(room.room_id, "peer-1", mock_ws)
    assert len(room.peers) == 1


@pytest.mark.asyncio
async def test_room_is_full_with_two_peers():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    room_manager.add_peer(room.room_id, "peer-1", AsyncMock())
    room_manager.add_peer(room.room_id, "peer-2", AsyncMock())
    assert room_manager.is_room_full(room.room_id) is True


@pytest.mark.asyncio
async def test_remove_peer_decrements_count():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    room_manager.add_peer(room.room_id, "peer-1", AsyncMock())
    room_manager.remove_peer(room.room_id, "peer-1")
    assert len(room.peers) == 0


# ── Room expiry ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_expired_room_is_removed():
    from room_manager import room_manager, Room
    from datetime import datetime, timedelta

    room = await room_manager.create_room(password=None)
    # Backdate the creation time
    room.created_at = datetime.utcnow() - timedelta(minutes=31)
    await room_manager.cleanup_expired_rooms()
    assert room.room_id not in room_manager.rooms


@pytest.mark.asyncio
async def test_active_room_is_not_removed():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    await room_manager.cleanup_expired_rooms()
    assert room.room_id in room_manager.rooms


# ── Password verification ────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_correct_password_returns_true():
    from room_manager import room_manager
    room = await room_manager.create_room(password="correcthorsebattery")
    result = room_manager.verify_password(room.room_id, "correcthorsebattery")
    assert result is True


@pytest.mark.asyncio
async def test_verify_wrong_password_returns_false():
    from room_manager import room_manager
    room = await room_manager.create_room(password="correcthorsebattery")
    result = room_manager.verify_password(room.room_id, "wrongpassword")
    assert result is False


@pytest.mark.asyncio
async def test_verify_password_on_no_password_room_returns_true():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    # Rooms without password are always accessible
    result = room_manager.verify_password(room.room_id, None)
    assert result is True
```

### 5.2 Implement `room_manager.py`

```python
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
```

---

## 6. Implementation: `main.py`

### 6.1 TDD — write tests first

Create `backend/tests/test_websocket.py`:

```python
"""Integration tests for the WebSocket signaling endpoint.

Tests the full message handling flow without a real browser.
Uses FastAPI TestClient for HTTP endpoints and
httpx for WebSocket connections.

See SRS.md §4 for the message protocol being tested.
"""
import pytest
import json
from fastapi.testclient import TestClient
from httpx import AsyncClient


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
```

Create `backend/tests/test_api.py`:

```python
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
    resp = client.get("/")
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
```

### 6.2 Implement `main.py`

```python
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

@app.get("/")
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
                    response = RoomCreatedResponse(
                        room_id=room.room_id,
                        code=room.code,
                        url=f"{base_url}/join/{room.code}",
                    )
                    await websocket.send_json(response.model_dump(by_alias=True))
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
```

---

## 7. Running and Verifying the Backend

### 7.1 Run tests
```bash
cd p2p-share/backend
uv run pytest tests/ -v --cov=. --cov-report=term-missing
```

### 7.2 Start the development server
```bash
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 7.3 Manual verification with wscat
```bash
npm install -g wscat

# Terminal 1: Connect as sender
wscat -c ws://localhost:8000/ws/new

# Send create-room
{"type":"create-room"}
# → Should receive: {"type":"room-created","roomId":"...","code":"X7K2P9","url":"..."}

# Terminal 2: Connect as receiver (use the room_id from above)
wscat -c ws://localhost:8000/ws/{room_id}
{"type":"join-room","code":"X7K2P9"}
# → Terminal 2: {"type":"room-joined",...}
# → Terminal 1: {"type":"peer-joined"}
```

---

## 8. Error Code Reference

| Code | Meaning | When sent |
|------|---------|-----------|
| `ROOM_NOT_FOUND` | Room code does not exist or has expired | join-room with invalid code |
| `ROOM_FULL` | Room already has 2 participants | join-room on full room |
| `NOT_IN_ROOM` | Peer tried to signal before joining | signal before create/join |
| `PASSWORD_INVALID` | Wrong password | verify-password fails |
| `CREATE_FAILED` | Room creation error (limit reached) | create-room when at MAX_ROOMS |
| `INVALID_JSON` | Malformed message | non-JSON WebSocket message |
| `UNKNOWN_TYPE` | Unrecognized message type field | unknown type value |

---

## 9. Document Cross-References

| For more on... | See document |
|----------------|-------------|
| Why the server never touches files | `BRD.md §BR-01` |
| WebSocket message protocol spec | `SRS.md §4` |
| HTTP endpoints spec | `SRS.md §5` |
| Environment variables | `SRS.md §9` |
| TDD coverage requirements | `SRS.md §6.4` |
| How the frontend calls these APIs | `frontend-doc.md §3, §4.2` |
| Docker container for this backend | `deployment-doc.md §2.1` |
| Nginx proxy config for WebSocket | `deployment-doc.md §3.2` |
| TURN server configuration | `deployment-doc.md §4` |
| Development tooling (uv, pytest) | `development-guideline.md §2` |
| TDD workflow | `development-guideline.md §3` |
| Sprint execution guide | `AGENTS.md §3` |
