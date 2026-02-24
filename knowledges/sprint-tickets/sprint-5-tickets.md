# Sprint 5 Tickets

Sprint goal: Implement true end-to-end encryption (E2E) using the Web Crypto API, including password protection for rooms and AES-256-GCM chunk encryption.
Estimated tickets: 3

---

## T-5-01 | Add Backend Password Verification | Priority: HIGH

What: Update `room_manager.py` and `main.py` to handle optional room passwords, storing bcrypt hashes and handling `verify-password` WebSocket messages.
Why: Satisfies FR-11 (Password Entry - Server-side).
Acceptance: 
- `Room` model supports `password_hash` and `has_password` flag.
- Signaling server rejects `join-room` without notifying the sender if password verification fails.
- `verify-password` WebSocket endpoint functions correctly with test coverage.
Depends on: none

---

## T-5-02 | Implement crypto.js Module | Priority: HIGH

What: Build the `crypto.js` module mapping the native Web Crypto API to handle PBKDF2 key derivation and AES-GCM chunk encryption.
Why: Satisfies FR-12 (Key Derivation) and FR-13 (Encryption).
Acceptance: 
- `generateSalt()`, `deriveKey()`, `encryptChunk()`, and `decryptChunk()` functions implemented.
- `crypto.test.js` exists with 100% test coverage including IV handling verification.
Depends on: none

---

## T-5-03 | Integrate E2E Encryption to Transfer Pipeline | Priority: HIGH

What: Wire `crypto.js` into the `transfer.js` send/receive loop, passing the salt via the `file-metadata` message, and update `ui.js`/`room.js` to prompt receivers for the room password before downloading.
Why: Completes FR-11, FR-12, and FR-13 user flows.
Acceptance: 
- Senders can optionally input a password during room creation.
- Receiver is prompted for a password (`ui.js` modal) before file metadata is approved.
- WebRTC DataChannel payloads are securely encrypted, verifiable by chunk size increases mapping to the 28-byte IV/Tag overhead.
Depends on: T-5-01, T-5-02
