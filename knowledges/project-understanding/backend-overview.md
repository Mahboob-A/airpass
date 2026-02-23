# Backend Overview

**Current State (Sprint 1 Complete)**
The backend is an ephemeral signaling server built with FastAPI and WebSockets.

**Architecture**
- `config.py`: Environment variable loading using pydantic-settings.
- `models.py`: Canonical Pydantic schemas for the WebSocket protocol (`CreateRoomMessage`, `JoinRoomMessage`, `SignalMessage`, etc).
- `room_manager.py`: Singleton `RoomManager` handling all in-memory transient state (rooms, peers, codes, expiry, password verification).
- `main.py`: HTTP endpoints (health, room check, ICE config) and the primary WebSocket router (`/ws/{room_id}`).

**Key Behaviors**
- No database; all state is securely stored in memory natively.
- Passwords are bcrypt-hashed (the hash is stored transiently with the room and discarded upon room expiration).
- Rooms expire automatically after `ROOM_EXPIRY_MINUTES` defaults to 30 minutes.
- The server opaquely relays WebRTC `signal` payloads without inspecting the content, fully preserving privacy.
- Strictly adheres to the TDD principles with 43 tests verifying logic at 86-100% test coverage across core modules.
