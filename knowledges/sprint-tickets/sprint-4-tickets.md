# Sprint 4 Tickets

Sprint goal: Finalize the DOM structure, wire up user interactions for room creation and joining, and link the UI with the completed WebRTC and transfer logic.
Estimated tickets: 4

---

## T-4-01 | Implement Core UI Structure (index.html, room.html) | Priority: HIGH

What: Create the semantic HTML layouts for the landing page (`index.html`) and the active transfer page (`room.html`).
Why: Satisfies FR-01 and FR-28 (clean, minimal UI without heavy frameworks).
Acceptance: 
- `frontend/index.html` exists with room creation and entry forms.
- `frontend/room.html` exists with connection status, file dropzone, and progress indicators.
Depends on: none

---

## T-4-02 | Implement ui.js Module | Priority: HIGH

What: Write the `ui.js` module to handle all pure DOM manipulations (status updates, progress bars, visibility toggles).
Why: Separating DOM manipulation from networking logic is required by the frontend blueprint to keep code testable and cleanly layered.
Acceptance: 
- `frontend/js/ui.js` exposes functions like `setStatus`, `updateProgress`, `showFileInfo`, and warning modals.
- Module contains zero WebRTC or WebSocket logic.
Depends on: T-4-01

---

## T-4-03 | Wire index.html Interactions (app.js) | Priority: HIGH

What: Bind DOM events on the landing page to initialize `SignalingClient` and transition to `room.html`.
Why: Allows the user to actually create a room or join one (FR-01, FR-02).
Acceptance: 
- Validating room codes and restricting input length.
- "Create Room" connects to signaling, requests a room, and redirects to `room.html?code=XYZ`.
- "Join Room" redirect works.
Depends on: T-4-01

---

## T-4-04 | Wire room.html Interactions (join.html/room.html JS) | Priority: HIGH

What: Bind DOM events on the room page: file selection, drag-and-drop, connection status reflection, and download strategy warnings.
Why: Orchestrates the WebRTC `PeerConnection`, UI updates, and handles file selection to actually start the transfer (FR-03, FR-06).
Acceptance:
- Drag-and-drop zone visually responds and accepts files.
- Selecting a file initiates the `sendFile` orchestration.
- Receiving a file metadata message prompts the UI accurately and executes the `selectDownloadStrategy` cascade warnings if needed.
Depends on: T-4-02, T-4-03
