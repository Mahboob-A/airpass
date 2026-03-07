# The Next Steps for AirPass

**Document Version:** 1.0
**Created:** Post-Sprint 7 Analysis
**Purpose:** Comprehensive gap analysis of what remains for production deployment and robust local development.

---

## Current State Summary

Sprints 1 through 7 are functionally complete. The backend signaling server, WebRTC peer connection, file transfer with backpressure, room entry UX, E2E encryption, Docker/Nginx deployment scaffolding, and multi-file transfer queues with dual DataChannels are all implemented. The application is branded as "AirPass" and is live at `airpass.mehboob.tech`.

This document catalogs every remaining gap between the current codebase and a robust production-grade deployment, organized by severity.

---

## 1. Critical Bugs (Will break core user flows)

### 1.1 Share URL leads to a blank page -- join.html is empty

**Impact:** Any receiver clicking a share link or scanning a QR code sees a blank page.

The backend generates share URLs as `{base_url}/join/{CODE}`. Nginx routes `/join/*` to `join.html`, which is an empty file (0 bytes). The current architecture uses `room.html` for both sender and receiver roles, but share links never reach it.

**Fix options:**
- (A) Populate `join.html` with a redirect: `window.location.href = '/room.html?code=' + code`
- (B) Change Nginx `location /join/` to rewrite to `/room.html?code=$1`
- (C) Move all receiver logic into a real `join.html` as the SRS originally specified

Option B is the simplest. Option C is the most spec-compliant but requires significant refactoring.

---

### 1.2 Password-protected rooms silently fail for receivers

**Impact:** The password prompt never appears. Receivers bypass password verification entirely.

The server sends JSON with camelCase key `"passwordRequired"`, but `room.js` reads `msg.password_required` (snake_case). In JavaScript, `msg.password_required` evaluates to `undefined` (falsy), so the password check is always skipped.

**Fix:** In `room.js`, change `msg.password_required` to `msg.passwordRequired`.

---

### 1.3 Backend test suite is broken

**Impact:** `uv run pytest` will fail. CI/CD pipelines are blocked.

The health check endpoint was moved from `GET /` to `GET /api/health` during Sprint 6/7, but multiple test files still assert against the old path:
- `test_api.py::test_health_check_returns_ok` tests `GET /`
- `test_websocket.py::test_health_check` tests `GET /`

The development Dockerfile healthcheck was updated to `/api/health` (correct), but the tests were not.

**Fix:** Update all test assertions to use `/api/health`.

---

## 2. High Priority -- Required for Production

### 2.1 F-34: Peer IP Disclosure Notice -- completely missing

SRS 3.2 and Project-Features.md mandate a visible notice on both sender and receiver screens: "Direct connection -- the other party can see your IP address." No code, CSS, or HTML for this exists anywhere in the codebase.

This is a privacy compliance requirement for a product that markets itself as "privacy-first."

**Work required:**
- Add a persistent banner/notice element in `room.html`
- Style it in `style.css`
- Show it when the DataChannel opens (in `room.js` when `onControlChannelOpen` fires)

---

### 2.2 F-29: Transfer Cancel -- no cancel mechanism

No cancel button exists in the queue item UI. No `transfer-cancelled` control message is sent or handled in `room.js`. Users cannot abort a transfer in progress.

The SRS 4.3 defines `transfer-cancelled` as a required DataChannel message type.

**Work required:**
- Add a "Cancel" button to each active queue item in `ui.js addQueueItem()`
- Send `{ type: "transfer-cancelled", id }` via the control channel on click
- Handle `transfer-cancelled` in `handleControlMessage()` to abort the send loop and close the transfer channel
- Clean up the `activeTransfers` Map entry

---

### 2.3 F-16: Connection failure retry UI -- missing

SRS says "Failed state SHALL display a human-readable error message and a retry option." Currently, `ui.setStatus('failed')` shows "Connection failed" with no retry button or error detail.

**Work required:**
- Add a "Retry Connection" button that appears alongside the failed status
- Implement `attemptReconnect()` that tears down the current PeerConnection and re-initiates signaling

---

### 2.4 No TURN server in any docker-compose file

Neither `docker/develop/docker-compose.yml` nor `docker/production/docker-compose.yml` includes a Coturn service. The `deployment-doc.md` specifies a Coturn container. Without TURN, approximately 15-20% of users on symmetric NAT cannot connect.

**Work required:**
- Add a `coturn` service to `docker/production/docker-compose.yml`
- Create `coturn/turnserver.conf` per `deployment-doc.md 6.2`
- Document the firewall port requirements (3478 UDP/TCP, 5349, relay range)

---

### 2.5 No root-level .env.example for Docker Compose

Docker Compose files reference `../../.env` but there is no `.env.example` at the project root to guide setup. A root `.env` exists but should never be committed. New developers or deployers have no template.

**Fix:** Create a root-level `.env.example` with all required variables documented.

---

### 2.6 Mobile responsiveness incomplete (F-30)

CSS has only one `@media` query (for `.queues-container` at 768px). The main `.base-layout`, `.card`, `.room-code-display` (3.5rem font), `.qr-box`, and modal elements have no mobile breakpoints. On small screens, the room code and cards will overflow or be awkwardly sized.

SRS requires "minimum 44px tap targets" and full mobile functionality.

**Work required:**
- Add responsive breakpoints for small screens (max-width: 480px, 768px)
- Ensure touch-friendly tap targets (44px minimum)
- Test on Chrome for Android and Safari for iOS

---

### 2.7 Encryption runs unnecessarily when no password is set

In `room.js handleFileSelection()`, a salt and key are always generated even when `roomPassword` is an empty string. This runs PBKDF2 with 100,000 iterations (slow on mobile) and encrypts/decrypts every chunk unnecessarily, degrading transfer speed for the common no-password case.

**Fix:** Skip salt generation, key derivation, and encrypt/decrypt calls when `roomPassword` is empty. Send `salt: null` in the metadata message to signal unencrypted mode.

---

## 3. Medium Priority -- Spec Compliance and Robustness

### 3.1 WebSocket URL architecture diverges from SRS

SRS specifies `/ws/{room_id}` where `room_id` is the actual room UUID. Currently, `room.js` hardcodes `/ws/p2p` for all connections. The server accepts any path string and creates/joins rooms via messages, so this works functionally, but it violates the SRS architecture.

**Decision needed:** Either update the SRS to reflect the current approach (generic WebSocket endpoint), or update room.js to use the room UUID in the path.

---

### 3.2 Docker directory structure deviates from SRS 1.3

SRS specifies `Dockerfile` and `docker-compose.yml` at project root. Implementation places them in `docker/develop/` and `docker/production/`. This is arguably a better organization but diverges from the canonical spec.

**Decision needed:** Update SRS to reflect the actual structure, or restructure Docker files.

---

### 3.3 F-14: QR code not downloadable as PNG -- RESOLVED (Sprint 8, T-8-13)

SRS says "The QR code SHALL be downloadable as a PNG." Resolved: Save QR as PNG button added below QR container. Uses canvas toDataURL to trigger download.

---

### 3.4 TURN-only relay mode toggle (F-34 second part) -- RESOLVED (Sprint 8, T-8-14)

The advanced opt-in "relay-only" mode for IP anonymity is specified in F-34 and SRS 3.2. Resolved: toggle in room-info card sets iceTransportPolicy to relay. Validates TURN availability before enabling. Disabled once P2P connects.

---

### 3.5 StreamSaver version mismatch

`room.html` loads StreamSaver `2.0.5` from CDN. `frontend-doc.md` specifies `2.0.6`. Should be aligned.

---

### 3.6 No graceful handling of room expiry during transfer -- RESOLVED (Sprint 8, T-8-15)

If a room expires mid-transfer (30 min), the WebSocket drops but the DataChannel (P2P) may stay alive. Resolved: countdown timer warns at 10 min remaining, urgent at 5 min. Server ROOM_NOT_FOUND errors show expiry-specific UI. Active P2P transfers continue after signaling drops.

---

## 4. Local Development Gaps

### 4.1 No working local HTTPS for cross-device testing

WebRTC and Web Crypto APIs require HTTPS on non-localhost origins. The development docker-compose serves HTTPS on port 443, but there are no self-signed certs generated automatically. A developer must manually run `mkcert` or `openssl` and place certs in `ssl/certs/`.

**Recommendation:** Add a `scripts/generate-dev-certs.sh` that creates self-signed certificates for `localhost` and local IP addresses.

---

### 4.2 No single-command local dev startup

There is no `Makefile`, `justfile`, or root-level npm script that starts both backend and frontend for development without Docker. The README mentions separate commands for backend (`uv run uvicorn`) and frontend (`python3 -m http.server`), but these run on different ports.

**Recommendation:** Create a `Makefile` or `scripts/dev.sh` with targets:
- `make dev` -- starts backend + frontend servers
- `make dev-docker` -- starts the development Docker Compose
- `make test` -- runs both backend and frontend test suites
- `make certs` -- generates self-signed dev certificates

---

### 4.3 CORS friction between backend and frontend dev servers

Backend on `:8000` and frontend on `:3000` require CORS. CORS middleware is enabled in development mode, but WebSocket connections from `:3000` to `:8000` may still have issues in some browsers. The development docker-compose solves this by routing through Nginx, but non-Docker local dev is awkward.

**Recommendation:** Document the two development modes clearly in the README:
1. Docker mode (recommended): `docker compose -f docker/develop/docker-compose.yml up`
2. Manual mode: backend on :8000, frontend on :3000, WebSocket URL override needed

---

## 5. Testing Gaps

### 5.1 Frontend test coverage incomplete for Sprint 7 changes

Sprint 7 changed `peer.js` significantly (dual channels, negotiated control channel, dynamic transfer channels). `peer.test.js` was partially updated but does not fully test `onTransferChannelOpen`, `createTransferChannel()`, or the control channel message flow. `room.js` has zero test coverage.

---

### 5.2 No E2E or integration test suite

All tests are unit-level mocks. There are no integration tests that verify the full flow: create room, join room, establish WebRTC, transfer file, verify file integrity. This is acknowledged as manual testing in sprint progress files but should be automated for production confidence.

**Recommendation:** Add a Playwright or Puppeteer-based E2E test that opens two browser tabs and transfers a small file.

---

### 5.3 Backend test fixtures may not match current API

Beyond the health check endpoint change (1.3), other test expectations may be stale:
- `test_ws_create_room` may receive duplicate `room-created` messages if the fixed `main.py` handler has a double-send issue
- WebSocket test fixtures should be audited against the current `main.py` message handling

---

## 6. Documentation Gaps

### 6.1 Missing project understanding docs

`knowledges/project-understanding/frontend-overview.md` and `knowledges/project-understanding/deployment-overview.md` do not exist. Per AGENTS.md 5, these should be created after sprints that touch those areas.

---

### 6.2 Sprint 7 progress file lacks sprint summary

Per AGENTS.md 4, a 150-200 word summary should be appended when all tickets are resolved. The Sprint 7 progress file has ticket updates but no summary section.

---

### 6.3 frontend-doc.md is out of date

The document still references the old single-DataChannel architecture (`file-transfer` channel) and the sender/receiver role model. Sprint 7 changed to dual channels (negotiated `p2p-control` + dynamic transfer channels) and initiator/responder roles. The doc also still shows `join.html` as a separate receiver view with distinct logic.

---

## Priority Execution Order

For maximum impact with minimum risk, address these in order:

| Order | Item | Category | Effort |
|-------|------|----------|--------|
| 1 | Fix share URL / join.html blank page | Critical Bug 1.1 | Small |
| 2 | Fix passwordRequired camelCase bug | Critical Bug 1.2 | Tiny |
| 3 | Fix backend test suite | Critical Bug 1.3 | Small |
| 4 | Add Peer IP Disclosure Notice | High 2.1 | Small |
| 5 | Add Transfer Cancel | High 2.2 | Medium |
| 6 | Skip encryption when no password | High 2.7 | Small |
| 7 | Add mobile responsive CSS | High 2.6 | Medium |
| 8 | Add connection retry UI | High 2.3 | Small |
| 9 | Add root .env.example | High 2.5 | Tiny |
| 10 | Add Coturn to production compose | High 2.4 | Medium |
| 11 | Add dev cert generation script | Dev 4.1 | Small |
| 12 | Add Makefile for dev commands | Dev 4.2 | Small |
| 13 | Update frontend-doc.md | Docs 6.3 | Medium |
| 14 | Create missing overview docs | Docs 6.1 | Small |
| 15 | ~~Add QR download as PNG~~ | ~~Medium 3.3~~ | ~~Done~~ |
| 16 | ~~Add TURN-only relay toggle~~ | ~~Medium 3.4~~ | ~~Done~~ |
| 17 | Add E2E test suite | Testing 5.2 | Large |
| 18 | Update peer.test.js coverage | Testing 5.1 | Medium |

---

## Document Cross-References

| For more on... | See document |
|----------------|-------------|
| Full feature list | `knowledges/Project-Features.md` |
| Technical requirements | `knowledges/SRS.md` |
| Backend implementation | `knowledges/backend-doc.md` |
| Frontend implementation | `knowledges/frontend-doc.md` |
| Deployment guide | `knowledges/deployment-doc.md` |
| Sprint progress history | `knowledges/sprint-progress/` |
| Agent orchestration | `AGENTS.md` |
