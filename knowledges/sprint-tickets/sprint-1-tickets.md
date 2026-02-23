# Sprint 1 Tickets

Sprint goal: FastAPI + WebSocket room system working end-to-end. Two browser tabs can join the same room.
Estimated tickets: 4

---

## T-1-01 | Environment and Configuration | Priority: HIGH

What: Initialize uv project, install dependencies, and implement config.py with test_config.py.
Why: Satisfies SRS §9 and sets up the base environment.
Acceptance: 
- uv virtual environment created
- requirements.txt installed
- test_config.py passes
Depends on: none

---

## T-1-02 | WebSocket Message Models | Priority: HIGH

What: Implement Pydantic schemas in models.py for all WS messages with test_models.py.
Why: Satisfies protocol definition in SRS §4.
Acceptance: 
- All models from SRS §4 exist
- test_models.py passes with 100% coverage
Depends on: T-1-01

---

## T-1-03 | Room State Management | Priority: HIGH

What: Implement room CRUD, code generation, and expiry in room_manager.py with test_room_manager.py.
Why: Satisfies FR-01, FR-02, and FR-03 for room logic.
Acceptance: 
- test_room_manager.py passes with >=95% coverage
Depends on: T-1-01

---

## T-1-04 | FastAPI and WebSocket Endpoint | Priority: HIGH

What: Implement main.py with HTTP routes and /ws/{room_id} endpoint, and integration tests.
Why: Satisfies FR-04 for WebSocket signaling relay.
Acceptance: 
- test_websocket.py passes with >=90% coverage
- test_api.py passes
Depends on: T-1-02, T-1-03
