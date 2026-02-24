# Sprint 4 Progress

Started: 2026-02-24
Status: in-progress

---

## Ticket Updates

### T-4-01 | Implement Core UI Structure (index.html, room.html)
Status: complete
Update: Semantic HTML shells established for `index.html` (room creation/joining) and `room.html` (transfer UI including drag-and-drop zone, progress bar, and QR code container). No inline JS or styling logic included.

### T-4-02 | Implement ui.js Module
Status: complete
Update: Written `ui.js` which exposes functions (`setStatus`, `updateProgress`, `showRoomCode`, `showFileInfo`, `showModal`) for pure DOM manipulation. Promisified the file acceptance and warnings to seamlessly integrate with Transfer module.

### T-4-03 | Wire index.html Interactions (app.js)
Status: complete
Update: Hooked up event listeners on the landing page for room creation and joining. Embedded pre-flight API checks against the `/api/room/{code}` endpoint to validate connectivity and room capacities before initiating WebSocket procedures.

### T-4-04 | Wire room.html Interactions (join.html/room.html JS)
Status: complete
Update: Hooked up `room.html` WebSocket event lifecycle, mapping `SignalingClient` events to `PeerConnection` states. Successfully configured the drag-and-drop zone and integrated the file receive state machine to apply StreamSaver chunk unallocating strategy correctly.

---

## Sprint Summary

Sprint 4 successfully united the application's headless networking logic with its frontend interface. The foundation for "Room Entry UX" is now complete. 

The application workflow is fully realized on the frontend: users land on `index.html` to either create or join a room. `app.js` securely handles user intent and validates rooms via the REST API before redirecting. Within the `room.html` environment, a strict separation of concerns was achieved by delegating DOM manipulation to `ui.js`, isolating it from the complexities of WebRTC peer orchestration in `room.js`. 

We also integrated the critical DataChannel interaction layer, wiring up the UI to prompt users with file metadata constraints (Strategy 1 vs 3 downloads) before automatically directing chunks to either the in-memory `chunkStore` or streaming directly to disk via StreamSaver. 

In Sprint 5, we will secure this established data workflow by introducing AES-256-GCM chunk inflation and encryption.
