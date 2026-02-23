# SRS — Software Requirements Specification
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Status:** Approved for Development  
**SRS Type:** Functional + Non-Functional + Architecture  

> **For AI Agents:** This is the primary technical entry-point document. It defines *what* the system must do and *how* it is structured. Read `BRD.md` first to understand *why*. For detailed implementation steps, use `backend-doc.md`, `frontend-doc.md`, and `deployment-doc.md`. For development workflow and standards, read `development-guideline.md`. For orchestration of all docs, read `AGENTS.md`.

---

## 1. System Overview

### 1.1 Purpose
P2P Share is a web application that facilitates browser-to-browser file transfer using WebRTC DataChannel as the transport. The server's only role is WebSocket-based signaling (SDP/ICE exchange). File bytes never pass through the server.

### 1.2 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser A (Sender)               │
│  index.html → room.html                                         │
│  js/signaling.js  js/peer.js  js/transfer.js  js/crypto.js     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket (wss://)
                           │ Signaling only (SDP, ICE, JSON)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Signaling Server                     │
│  main.py  room_manager.py  models.py  config.py                 │
│  (server NEVER touches file bytes)                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket (wss://)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser B (Receiver)             │
│  join.html                                                      │
│  js/signaling.js  js/peer.js  js/transfer.js  js/crypto.js     │
└─────────────────────────────────────────────────────────────────┘
        ↕  WebRTC DataChannel (P2P, encrypted via DTLS)
        ↕  File data flows DIRECTLY between browsers
        ↕  (bypasses server entirely after connection is established)

         ↕ STUN server (discovers public IP)  [stun.l.google.com:19302]
         ↕ TURN server (relay for strict NAT) [self-hosted Coturn or Metered.ca]
```

### 1.3 Project Directory Structure

```
p2p-share/
├── backend/
│   ├── main.py                 # FastAPI app, WebSocket endpoint, HTTP routes
│   ├── room_manager.py         # Room state management, code generation
│   ├── models.py               # Pydantic models for all WebSocket messages
│   ├── config.py               # TURN credentials, env-based settings
│   └── requirements.txt        # Python dependencies (managed via uv)
│
├── frontend/
│   ├── index.html              # Home page: create room / join by code / join by URL
│   ├── room.html               # Sender view: file selection, transfer progress
│   ├── join.html               # Receiver view: waiting, accept/reject, progress
│   ├── js/
│   │   ├── signaling.js        # WebSocket wrapper: connect, send, receive, reconnect
│   │   ├── peer.js             # RTCPeerConnection wrapper: offer, answer, ICE, DataChannel
│   │   ├── transfer.js         # File chunking, backpressure, reassembly, progress math
│   │   ├── crypto.js           # Web Crypto API: PBKDF2 key derivation, AES-GCM encrypt/decrypt
│   │   └── ui.js               # DOM manipulation, progress bar, speed meter, QR code
│   └── css/
│       └── style.css           # All styles (no framework dependency)
│
├── nginx/
│   └── nginx.conf              # Reverse proxy, WebSocket upgrade, SSL termination
│
├── Dockerfile                  # Single-stage FastAPI container
├── docker-compose.yml          # App + Nginx service definitions
└── README.md                   # Setup and deployment instructions
```

> **For AI Agents:** The project structure above is canonical. Do not deviate from it. All file paths referenced in `backend-doc.md`, `frontend-doc.md`, and `deployment-doc.md` align to this structure.

---

## 2. Functional Requirements

### 2.1 Room Management

**FR-01: Create Room**
- The system SHALL generate a unique room ID (UUID) and a human-readable 6-digit alphanumeric room code
- The system SHALL store room state in memory (no database required)
- The system SHALL return a shareable URL containing the room ID to the sender
- The system SHALL allow only 2 participants per room (one sender, one receiver)
- Rooms SHALL expire and be cleaned up after 30 minutes of inactivity or when both peers disconnect

**FR-02: Join Room**
- A receiver SHALL be able to join via: direct URL, 6-digit room code, or QR code scan
- If a room is full (2 participants), the server SHALL reject the join with a meaningful error
- If a room does not exist or has expired, the server SHALL return a 404-equivalent error

**FR-03: Room Code Generation**
- Room codes SHALL be exactly 6 characters, alphanumeric (uppercase), e.g., `X7K2P9`
- Room codes SHALL be unique at any given time (collision detection required)
- Room codes SHALL be case-insensitive for entry (normalize to uppercase)

### 2.2 WebRTC Signaling

**FR-04: WebSocket Signaling**
- The server SHALL accept WebSocket connections at `/ws/{room_id}`
- The server SHALL relay WebSocket messages between the two peers in a room
- The server SHALL notify Peer A when Peer B joins (and vice versa)
- The server SHALL notify the remaining peer when the other disconnects
- The server SHALL NOT log, store, or process the content of signal messages (SDP/ICE)

**FR-05: SDP Exchange**
- The Sender SHALL create an RTCPeerConnection offer and send it via the signaling channel
- The Receiver SHALL create an answer and send it back via the signaling channel
- Both sides SHALL use Trickle ICE: send the SDP immediately, send ICE candidates incrementally as they are gathered

**FR-06: ICE Candidate Exchange**
- ICE candidates SHALL be sent to the signaling server as they are gathered
- The signaling server SHALL relay them to the other peer
- The client SHALL call `addIceCandidate()` for each received candidate after `setRemoteDescription` has been called

### 2.3 File Transfer

**FR-07: File Metadata**
- Before any file data is sent, the sender SHALL transmit a JSON metadata message containing: filename, total size (bytes), MIME type, total number of chunks, and whether encryption is active
- The receiver SHALL display this metadata (filename, size, type) and prompt for accept/reject

**FR-08: File Chunking**
- Files SHALL be read using the browser File API and sliced into chunks of 64KB (65,536 bytes)
- Chunks SHALL be sent sequentially over the RTCDataChannel as `ArrayBuffer`
- The sender SHALL monitor `RTCDataChannel.bufferedAmount` and pause sending when it exceeds 16MB (backpressure); resume when it drops below 1MB

**FR-09: File Reassembly and Download**
- The receiver SHALL accumulate received chunks indexed by sequence number
- Upon receiving the final chunk, the receiver SHALL initiate a file download using the three-strategy cascade defined in `frontend-doc.md §4.7`:
  - **Strategy 3 — Service Worker streaming (mandatory production default):** chunks pipe directly to disk via StreamSaver.js with no RAM accumulation. Works on Chrome, Firefox, Edge, and Safari 15+. This is always tried first, for every browser.
  - **Strategy 2 — `showSaveFilePicker` (fallback if Strategy 3 fails):** Chrome and Edge only. Explicitly skipped on Firefox because Firefox's implementation silently accumulates in memory with no error. Only reached if StreamSaver.js failed to load.
  - **Strategy 1 — Memory Blob (last resort):** accumulates the full file in RAM. When this path is reached, the UI MUST display a user-visible warning: "Your browser does not support efficient large file downloads. For files over 1 GB, please use Chrome for best results." Effective file size cap on this path is ~1 GB.
- The strategy is selected automatically by `selectDownloadStrategy()` before the DataChannel opens
- The selected strategy SHALL be logged to the browser console for debugging

**FR-10: Transfer Progress**
- Both sender and receiver SHALL display:
  - Percentage complete (0–100%)
  - Current transfer speed (MB/s), computed over the last 1-second window
  - Total bytes transferred
  - Estimated time remaining
- Progress updates SHALL occur at minimum every 500ms

### 2.4 Password Protection & Encryption

**FR-11: Password Entry**
- The sender MAY optionally set a password when creating a room
- If set, the server SHALL store a bcrypt hash of the password
- The receiver SHALL be prompted to enter the password before the file metadata is shown
- The server SHALL verify the password hash and reject the receiver if it does not match

**FR-12: Client-Side Key Derivation**
- The encryption key SHALL be derived client-side using the Web Crypto API: `PBKDF2(password, salt, 100000 iterations, SHA-256)` → `AES-256 key`
- The salt SHALL be a random 16-byte value generated by the sender and transmitted as part of the file metadata message (NOT through the server)
- The derived key SHALL be cached in memory for the session duration; the password SHALL be discarded after key derivation

**FR-13: Encryption**
- Each 64KB file chunk SHALL be encrypted using `AES-GCM` before transmission
- Each chunk SHALL use a unique 12-byte random IV
- The IV SHALL be prepended to the ciphertext before sending: `[12 bytes IV][ciphertext]`
- The receiver SHALL extract the IV from the first 12 bytes of each chunk and decrypt using the same derived key

### 2.5 QR Code

**FR-14: QR Code Generation**
- After room creation, the sender page SHALL display a QR code encoding the shareable room URL
- The QR code SHALL be generated client-side using `qrcode.js` (no server involvement)
- The QR code SHALL be downloadable as a PNG

### 2.6 UI/UX Requirements

**FR-15: Entry Points on Home Page**
- The home page (`index.html`) SHALL provide:
  1. A "Create Room" button (generates a new room)
  2. A text input for 6-digit code + "Join" button
  3. URL-based auto-join (if `?code=XXXXXX` is in the URL, pre-fill the join field)

**FR-16: Connection Status**
- Both views SHALL display a connection status indicator with states: Waiting, Connecting, Connected, Transferring, Complete, Failed
- Failed state SHALL display a human-readable error message and a retry option

---

## 3. Non-Functional Requirements

### 3.1 Performance

| Requirement | Target |
|------------|--------|
| Signaling latency (WebSocket relay) | < 50ms added latency |
| Connection setup time (ICE + DTLS) | < 3 seconds on a typical internet connection |
| Transfer speed (same network) | Within 10% of raw DataChannel throughput (~100-500 Mbps) |
| Transfer speed (across internet) | Bounded by the bottleneck peer's upload speed |
| Maximum file size supported | **10GB** via Service Worker streaming (Strategy 3 — the mandatory production default for all browsers). Strategy 2 fallback (`showSaveFilePicker`) supports large files on Chrome/Edge only. Strategy 1 fallback (Memory Blob) is hard-limited to ~1GB; the UI warns the user and recommends Chrome when this path is reached. See `frontend-doc.md §4.7`. |
| Concurrent rooms | 500+ (in-memory, no database — see §2.1 and `backend-doc.md §1.3` for the LMDB/database decision) |

### 3.2 Security

| Requirement | Implementation |
|------------|----------------|
| Transport security | All traffic over HTTPS/WSS; Nginx terminates TLS |
| WebRTC transport | DTLS mandatory (built into WebRTC standard) |
| File encryption (optional) | AES-256-GCM via Web Crypto API |
| Key derivation | PBKDF2 with 100,000 iterations |
| Password verification | bcrypt on server (for room entry only) |
| SDP integrity | WSS transport protects against MITM on signaling |
| Server-side file access | Architecturally impossible — no file bytes on server |
| **Peer IP disclosure** | **By design**: WebRTC P2P connections expose each peer's IP to the other peer. This is inherent to how ICE works — peers learn each other's IP addresses during candidate exchange. The UI MUST display a clear notice: *"Direct connection — the other party can see your IP address."* For maximum privacy, users may enable TURN-relay-only mode (opt-in). See `Project-Features.md §F-34` and `BRD.md §5`. |

### 3.3 Reliability

- The application SHALL handle WebSocket disconnection and display a clear error state
- ICE restart SHALL be triggered automatically on connection loss during transfer
- The TURN server SHALL be configured as a fallback for ~15-20% of users who cannot establish direct P2P

### 3.4 Compatibility

| Browser | Minimum Version |
|---------|----------------|
| Chrome (Desktop + Android) | 90+ |
| Firefox (Desktop) | 90+ |
| Edge (Desktop) | 90+ |
| Safari (Desktop + iOS) | 15+ |

### 3.5 Deployability

- The entire application SHALL be deployable with a single `docker compose up -d` command
- Configuration SHALL be via environment variables (no hardcoded secrets)
- The Docker image SHALL be < 200MB

---

## 4. WebSocket Message Protocol

All WebSocket messages are JSON-encoded. The `type` field is always present and determines the message structure.

### 4.1 Client → Server Messages

```json
// Create a new room
{ "type": "create-room", "password": "optional-password-or-null" }

// Join an existing room by code
{ "type": "join-room", "code": "X7K2P9" }

// Relay SDP offer to other peer (server forwards as-is)
{ "type": "signal", "payload": { "type": "offer", "sdp": "..." } }

// Relay SDP answer to other peer
{ "type": "signal", "payload": { "type": "answer", "sdp": "..." } }

// Relay ICE candidate to other peer
{ "type": "signal", "payload": { "type": "candidate", "candidate": {...} } }

// Verify room password (receiver, before getting file metadata)
{ "type": "verify-password", "password": "plaintext-password" }
```

### 4.2 Server → Client Messages

```json
// Room created successfully
{ "type": "room-created", "roomId": "uuid", "code": "X7K2P9", "url": "https://..." }

// Room joined successfully
{ "type": "room-joined", "roomId": "uuid", "role": "receiver" }

// The other peer has connected
{ "type": "peer-joined" }

// The other peer has disconnected
{ "type": "peer-left" }

// Forwarded signal from the other peer
{ "type": "signal", "payload": { "type": "offer|answer|candidate", ... } }

// Password verification result
{ "type": "password-result", "valid": true }

// Error
{ "type": "error", "code": "ROOM_NOT_FOUND|ROOM_FULL|PASSWORD_INVALID|...", "message": "..." }
```

### 4.3 Peer-to-Peer DataChannel Messages (NOT through server)

```json
// File metadata (sent first, as JSON string)
{
  "type": "file-meta",
  "name": "document.pdf",
  "size": 104857600,
  "mimeType": "application/pdf",
  "totalChunks": 1600,
  "encrypted": true,
  "salt": "base64-encoded-16-byte-salt"
}

// File chunk (sent as ArrayBuffer, NOT JSON)
// Format: [4-byte chunk index (Uint32)][12-byte IV if encrypted][chunk data]

// Transfer control (JSON string)
{ "type": "transfer-complete" }
{ "type": "transfer-cancelled" }
{ "type": "transfer-accepted" }
{ "type": "transfer-rejected" }
```

> **For AI Agents:** The message protocol above is canonical. `backend-doc.md` implements the server-side of Client→Server and Server→Client messages. `frontend-doc.md` implements all four message categories. Do not invent new message types without updating this spec.

---

## 5. HTTP API Endpoints

In addition to the WebSocket endpoint, the FastAPI backend exposes these HTTP endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check — returns `{"status": "ok"}` |
| `GET` | `/api/room/{code}` | Check if a room with this code exists and is not full |
| `GET` | `/api/ice-config` | Returns ICE server configuration (STUN + TURN credentials) to the client |
| `WS` | `/ws/{room_id}` | WebSocket signaling endpoint |

> **For AI Agents:** Full API implementation details including request/response schemas and error handling are in `backend-doc.md`.

---

## 6. Test-Driven Development (TDD) Mandate

> **This project MUST follow TDD.** Tests are written before implementation code.

### 6.1 TDD Workflow

```
For every feature or function:
  1. Write a failing test that defines the expected behavior
  2. Run the test — confirm it fails (Red)
  3. Write the minimum code to make the test pass
  4. Run the test — confirm it passes (Green)
  5. Refactor while keeping tests green (Refactor)
  6. Commit: test + implementation together
```

### 6.2 Backend Tests (pytest)

Test files live in `backend/tests/`:
```
backend/
├── tests/
│   ├── __init__.py
│   ├── test_room_manager.py    # Unit tests for room creation, joining, expiry
│   ├── test_models.py          # Unit tests for Pydantic model validation
│   ├── test_websocket.py       # Integration tests for WebSocket endpoints
│   └── test_api.py             # Integration tests for HTTP endpoints
```

Run with: `uv run pytest backend/tests/ -v`

### 6.3 Frontend Tests (Vitest or Jest)

Test files live adjacent to source in `frontend/js/`:
```
frontend/js/
├── signaling.test.js
├── transfer.test.js
└── crypto.test.js
```

Run with: `npx vitest run`

### 6.4 Test Coverage Requirements

| Layer | Minimum Coverage |
|-------|-----------------|
| `room_manager.py` | 95% |
| `models.py` | 100% |
| WebSocket message handling | 90% |
| `crypto.js` | 100% (encryption is safety-critical) |
| `transfer.js` (chunking logic) | 90% |

> **For AI Agents:** Never write implementation code without a corresponding test. If you generate code for `room_manager.py`, generate `test_room_manager.py` first or simultaneously. See `development-guideline.md` for the full TDD workflow and tooling setup.

---

## 7. Development Phases

The project is developed in 6 sprints. Each sprint is independently functional (produces a runnable demo):

| Sprint | Focus | Deliverable |
|--------|-------|-------------|
| **S1** | Signaling server | FastAPI + WebSocket room relay working end-to-end |
| **S2** | WebRTC P2P connection | DataChannel opens between two browsers |
| **S3** | File transfer | Chunked file transfer with progress display |
| **S4** | Room entry UX | URL/code/QR entry points all working |
| **S5** | Encryption | Password-protected AES-GCM encrypted transfers |
| **S6** | Deployment | Docker Compose, Nginx, SSL, production TURN |

> **For AI Agents:** Always know which sprint is active. Do not implement Sprint 5 features while working on Sprint 2. Reference `development-guideline.md` for sprint-by-sprint execution guidance.

---

## 8. Technology Stack

| Layer | Technology | Version | Reason |
|-------|-----------|---------|--------|
| **Backend runtime** | Python | 3.12 | LTS, latest stable |
| **Backend framework** | FastAPI | 0.110+ | Native async WebSocket support, Pydantic v2 |
| **ASGI server** | Uvicorn | 0.27+ | High-performance async |
| **Package manager** | uv | latest | Fast, deterministic, lockfile |
| **Backend testing** | pytest + pytest-asyncio | latest | Async test support |
| **WebRTC** | Browser native `RTCPeerConnection` | — | No library needed for core |
| **Simplification lib** | simple-peer (optional) | 9.11+ | Thin wrapper, reduces boilerplate |
| **Encryption** | Web Crypto API (browser native) | — | No library, no bundle size |
| **QR Code** | qrcode.js | CDN | Client-side, no server needed |
| **Reverse proxy** | Nginx | 1.25+ | SSL termination, WebSocket upgrade |
| **Containerization** | Docker + Docker Compose | v2+ | Single-command deployment |
| **Frontend tests** | Vitest | latest | ESM-native, fast |

---

## 9. Environment Variables

All configuration via `.env` file (never committed):

```env
# Server
APP_HOST=0.0.0.0
APP_PORT=8000
APP_ENV=production          # development | production

# Security
SECRET_KEY=<random-32-bytes-hex>
BCRYPT_ROUNDS=12

# TURN server (required for production)
TURN_URL=turn:your-turn-server.com:3478
TURN_USERNAME=your-turn-username
TURN_CREDENTIAL=your-turn-password

# Optional: Metered.ca TURN (development)
METERED_API_KEY=your-metered-key

# Room settings
ROOM_EXPIRY_MINUTES=30
MAX_ROOMS=5000
```

> **For AI Agents:** Never hardcode any of these values. Always load from environment. `config.py` is the single source of truth for all settings. See `backend-doc.md` for the full `config.py` implementation.

---

## 10. Document Cross-References

| Purpose | Document |
|---------|---------|
| Business context and goals | `BRD.md` |
| Feature-by-feature descriptions | `Project-Features.md` |
| Backend implementation guide | `backend-doc.md` |
| Frontend implementation guide | `frontend-doc.md` |
| Docker/Nginx deployment guide | `deployment-doc.md` |
| Development standards & TDD workflow | `development-guideline.md` |
| AI agent orchestration | `AGENTS.md` |
