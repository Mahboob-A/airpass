# Sprint 8 Tickets

Sprint goal: Fix all critical bugs, high-priority gaps, and development experience issues identified in the post-Sprint 7 gap analysis. Extended with medium-priority spec compliance items.
Estimated tickets: 15

---

## T-8-01 | Fix share URL / join.html blank page | Priority: HIGH

What: Populate the empty join.html so share links and QR codes route receivers to the room page correctly.
Why: Share URLs generate 404/blank pages, breaking F-03, F-04, F-06.
Acceptance:
- Clicking a share URL like /join/X7K2P9 redirects to room.html?code=X7K2P9
- QR code scan on mobile leads to the room page
Depends on: none

---

## T-8-02 | Fix passwordRequired camelCase bug | Priority: HIGH

What: Fix room.js to read msg.passwordRequired instead of msg.password_required.
Why: Password-protected rooms silently fail for receivers. The password prompt never appears.
Acceptance:
- Receiver joining a password-protected room sees the password prompt
- Correct password grants access; wrong password is rejected
Depends on: none

---

## T-8-03 | Fix backend test suite for /api/health | Priority: HIGH

What: Update test_api.py and test_websocket.py to use /api/health instead of /.
Why: Tests fail because the health check endpoint was moved to /api/health.
Acceptance:
- uv run pytest backend/tests/ -v passes with 0 failures
Depends on: none

---

## T-8-04 | Add Peer IP Disclosure Notice | Priority: HIGH

What: Add a visible notice on the room page stating the direct P2P connection exposes IP addresses.
Why: Required by F-34, SRS 3.2 for privacy compliance.
Acceptance:
- A persistent notice appears when the DataChannel connects
- Text clearly states IP disclosure risk
Depends on: none

---

## T-8-05 | Add Transfer Cancel mechanism | Priority: HIGH

What: Add cancel buttons to queue items and handle transfer-cancelled control messages.
Why: Required by F-29, SRS 4.3. Users cannot abort transfers.
Acceptance:
- Cancel button appears on active transfer queue items
- Clicking cancel aborts the transfer and notifies the peer
- Both sender and receiver clean up state correctly
Depends on: none

---

## T-8-06 | Skip encryption when no password set | Priority: HIGH

What: Bypass PBKDF2 key derivation and AES-GCM encrypt/decrypt when roomPassword is empty.
Why: Unnecessary PBKDF2 (100k iterations) slows transfers when no password is used.
Acceptance:
- No-password transfers skip encryption entirely
- Password-protected transfers still encrypt correctly
Depends on: T-8-02

---

## T-8-07 | Add mobile responsive CSS | Priority: HIGH

What: Add responsive breakpoints for small screens and ensure touch-friendly tap targets.
Why: Required by F-30. Current UI breaks on mobile devices.
Acceptance:
- UI is usable on 375px-wide screens
- All interactive elements meet 44px minimum tap target
- Room code, cards, and modals scale appropriately
Depends on: none

---

## T-8-08 | Add connection retry UI | Priority: HIGH

What: Show a retry button when the connection fails, with a human-readable error message.
Why: Required by F-16. Failed state shows no retry option.
Acceptance:
- Failed status shows a "Retry" button
- Clicking retry re-initiates the WebSocket and WebRTC connection
Depends on: none

---

## T-8-09 | Add root .env.example | Priority: HIGH

What: Create a root-level .env.example template for Docker Compose deployments.
Why: No template exists for new developers or deployers.
Acceptance:
- .env.example exists at project root with all required variables documented
Depends on: none

---

## T-8-10 | Add Coturn to production docker-compose | Priority: HIGH

What: Add a Coturn TURN server service and configuration to the production Docker Compose.
Why: Without TURN, ~15-20% of users cannot connect.
Acceptance:
- coturn service defined in docker/production/docker-compose.yml
- coturn/turnserver.conf created with documented configuration
Depends on: T-8-09

---

## T-8-11 | Add dev cert generation script | Priority: MEDIUM

What: Create a script to generate self-signed SSL certificates for local HTTPS development.
Why: WebRTC requires HTTPS on non-localhost. Manual cert creation is error-prone.
Acceptance:
- scripts/generate-dev-certs.sh creates certs in ssl/certs/
- Script works on macOS and Linux
Depends on: none

---

## T-8-12 | Add Makefile for dev commands | Priority: MEDIUM

What: Create a Makefile with common development targets.
Why: No single-command dev startup exists.
Acceptance:
- make dev, make test, make dev-docker, make certs targets work
Depends on: T-8-11

---

## T-8-13 | QR code downloadable as PNG | Priority: MEDIUM

What: Add a Save QR button that downloads the generated QR code as a PNG image file.
Why: SRS says "The QR code SHALL be downloadable as a PNG." Required by F-14.
Acceptance:
- A Save QR button appears below the QR code on the room page
- Clicking it downloads a PNG file of the QR code
Depends on: none

---

## T-8-14 | TURN-only relay toggle | Priority: MEDIUM

What: Add a toggle switch for relay-only mode that sets iceTransportPolicy to relay.
Why: F-34 second part and SRS 3.2 specify an opt-in TURN-only mode for IP anonymity.
Acceptance:
- A relay-only toggle appears near the IP disclosure notice
- When enabled, RTCPeerConnection uses iceTransportPolicy relay
- Toggle is only functional when TURN is configured
Depends on: T-8-04

---

## T-8-15 | Graceful room expiry handling | Priority: MEDIUM

What: Add an expiry countdown timer and handle server-side room expiry gracefully.
Why: Gap analysis 3.6. Room expiry mid-session has no warning or graceful handling.
Acceptance:
- A countdown shows remaining room time after 20 minutes
- When the room expires server-side, the UI shows a clear message
- Active P2P transfers continue even after signaling WebSocket closes
Depends on: none
