# Sprint 2 Tickets

Sprint goal: DataChannel opens between two browsers.
Estimated tickets: 3

---

## T-2-01 | Frontend Project Setup | Priority: HIGH

What: Initialize the frontend directory with required CSS/JS files and configure Vitest for testing.
Why: Satisfies local development environments per development-guideline.md.
Acceptance: 
- HTML, CSS, and JS files exist
- `package.json` and `vitest.config.js` exist
- `npm test` runs successfully
Depends on: none

---

## T-2-02 | WebSocket Signaling Client | Priority: HIGH

What: Implement `js/signaling.js` and `js/signaling.test.js` to wrap the browser WebSocket API.
Why: Satisfies SRS §4 (WebSocket message protocol integration on the client side).
Acceptance: 
- `signaling.test.js` passes with 100% coverage
- Handles connection, typed events, and queuing pre-open messages
Depends on: T-2-01

---

## T-2-03 | WebRTC PeerConnection Orchestrator | Priority: HIGH

What: Implement `js/peer.js` and `js/peer.test.js` to manage the RTCPeerConnection lifecycle.
Why: Satisfies SRS §2.2 (WebRTC signaling, ICE, DataChannel setup).
Acceptance: 
- `peer.test.js` passes
- Manages offer/answer flow and Trickle ICE
- Creates and receives a reliable DataChannel named `file-transfer`
Depends on: T-2-02
