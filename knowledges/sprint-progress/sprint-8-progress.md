# Sprint 8 Progress

Started: 2026-02-25
Status: complete

---

## Ticket Updates

### T-8-01 | Fix share URL / join.html blank page
Status: complete
Update: Populated join.html with a redirect script that extracts the room code from the URL path (/join/CODE) and redirects to room.html?code=CODE. Uses window.location.replace for clean history. Falls back to index if no valid code found.

### T-8-02 | Fix passwordRequired camelCase bug
Status: complete
Update: Changed msg.password_required to msg.passwordRequired in room.js line 93. The server sends camelCase JSON keys; the old snake_case check always evaluated to undefined, silently skipping the password prompt.

### T-8-03 | Fix backend test suite for /api/health
Status: complete
Update: Updated test_api.py and test_websocket.py to use /api/health instead of /. All 43 backend tests now pass with 0 failures. The health endpoint was moved in Sprint 6 but tests were not updated.

### T-8-04 | Add Peer IP Disclosure Notice
Status: complete
Update: Added IP disclosure banner in room.html with warning icon, styled in style.css with amber tones. Banner is shown when onControlChannelOpen fires via ui.toggleHidden in room.js. Meets F-34 and SRS 3.2 requirements.

### T-8-05 | Add Transfer Cancel mechanism
Status: complete
Update: Added Cancel buttons to both sending and receiving queue items in ui.js. Created _bindCancelButton in room.js that sends transfer-cancelled control message and cleans up activeTransfers. Remote peer handles the message to cancel its side. Actions hide on terminal states.

### T-8-06 | Skip encryption when no password set
Status: complete
Update: Modified handleFileSelection and handleControlMessage to skip PBKDF2 key derivation and AES-GCM when roomPassword is empty. Salt is sent as null for unencrypted transfers. encryptChunk/decryptChunk callbacks are null-gated in sendFile and receiveChunk calls.

### T-8-07 | Add mobile responsive CSS
Status: complete
Update: Added two responsive breakpoints (768px and 480px) to style.css. Small screens get scaled room codes, smaller cards, stacked modal actions, and 44px minimum tap targets on all buttons. Queue header row stacks vertically on tablets.

### T-8-08 | Add connection retry UI
Status: complete
Update: Added retry-container with a Retry Connection button in room.html header. ui.js setStatus now toggles retry button visibility on failed state. room.js wires the button to reload the page, re-initiating the full WebSocket and WebRTC flow.

### T-8-09 | Add root .env.example
Status: complete
Update: Created .env.example at project root with all required variables from config.py documented with inline comments. Includes APP_ENV, SECRET_KEY, TURN credentials, ROOM_EXPIRY_MINUTES, MAX_ROOMS, and BCRYPT_ROUNDS.

### T-8-10 | Add Coturn to production docker-compose
Status: complete
Update: Added coturn service using coturn/coturn:4.6-alpine image to docker/production/docker-compose.yml with host networking and volume-mounted config. Created coturn/turnserver.conf with long-term credential auth, port ranges, and security settings.

### T-8-11 | Add dev cert generation script
Status: complete
Update: Created scripts/generate-dev-certs.sh that generates self-signed SSL certs with SAN for localhost and auto-detected local IP. Outputs to ssl/certs/ which is already gitignored. Works on macOS and Linux.

### T-8-12 | Add Makefile for dev commands
Status: complete
Update: Created root Makefile with targets: dev (backend+frontend local), dev-docker, prod-docker, test, test-backend, test-frontend, certs, clean, and help. Each target has a help comment for self-documenting output.

### T-8-13 | QR code downloadable as PNG
Status: complete
Update: Added Save QR as PNG button below the QR code in room.html wrapped in a qr-wrapper div. ui.js downloadQrPng extracts the canvas rendered by qrcode.js and triggers a PNG download via data URL. Button is hidden for responders along with the QR code.

### T-8-14 | TURN-only relay toggle
Status: complete
Update: Added relay-only toggle switch in the room-info card. getEffectiveIceConfig helper applies iceTransportPolicy relay when toggled on. If no TURN server is configured, toggle is rejected with a modal warning. Toggle is disabled once P2P connects. Changing toggle pre-connection recreates PeerConnection with the new config.

### T-8-15 | Graceful room expiry handling
Status: complete
Update: Added 30-minute expiry countdown timer that starts on room creation or join. Warning countdown appears at 10 minutes remaining, turns urgent at 5 minutes. Server-side ROOM_NOT_FOUND errors are intercepted to show expiry-specific messaging. If P2P is still active when the room expires, transfers continue with a non-blocking notification.

---

## Sprint Summary

Sprint 8 resolved all 15 tickets from the post-Sprint 7 gap analysis. Three critical bugs were fixed: the empty join.html that broke share URLs and QR codes now redirects correctly to room.html; the passwordRequired camelCase mismatch that silently skipped password prompts for receivers was corrected; and backend tests were updated from the old / health endpoint to /api/health, restoring the full 43-test suite to passing. High-priority production gaps were addressed: peer IP disclosure notice (F-34), transfer cancel with control channel messaging (F-29), encryption bypass for no-password rooms eliminating unnecessary PBKDF2 overhead, mobile responsive CSS with 44px tap targets, and a retry button for failed connections. Infrastructure improvements include a root .env.example template, Coturn TURN server in production docker-compose with shared-secret auth, a self-signed cert generation script for local HTTPS development, and a Makefile with dev/test/deploy targets. All 43 backend tests and 40 frontend tests pass. StreamSaver CDN was updated from 2.0.5 to 2.0.6. Three medium-priority spec compliance items were added: QR code downloadable as PNG (F-14), TURN-only relay toggle for IP anonymity (F-34 second part), and graceful room expiry handling with countdown timer and P2P continuity.
