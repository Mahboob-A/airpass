# Sprint 7 Tickets: File Transfer Queues & UI Refinement

## Epic 7: Multi-File Transfers and UI Queue System

### T-7-01: Update peer.js for Dual DataChannels and Negotiated Control Channel
**Description:** Modify `peer.js` to support multiple file transfers instead of one. Set up a dedicated 'p2p-control' signaling DataChannel using `negotiated: true, id: 0`, rather than relying on `ondatachannel` timing for metadata transfer.
**Acceptance Criteria:**
- Initiator and responder both create `p2p-control` channel statically with `id: 0`.
- New dynamic channels can be spawned by `transferId` explicitly.

### T-7-02: Fix File Picker and UI Issues
**Description:** Receiver's file picker is unresponsive from single role assignment block. "Cancel/Reject" keeps UI in a blocked state. Drag-and-drop should be wire unconditionally on both ends, and rejection should isolated to item status in queue.
**Acceptance Criteria:**
- `setupDragAndDrop` is wired up regardless of peer role in `room.js`.
- Rejecting an incoming file doesn't deadlock the connection; it just updates the queued item's status.

### T-7-03: Implement the Sending & Receiving Queues UI
**Description:** Provide dedicated sections for "Sending Queue" and "Receiving Queue", with progress and auto-download states.
**Acceptance Criteria:**
- UI components implemented in `room.html`, `ui.js`, and `style.css`.
- Progress works per queue item independently.
- Appropriate Auto-Download integration with `StreamSaver` per file.

### T-7-04: Backpressure Handling
**Description:** Ensure that concurrent multiple connections handle backpressure elegantly within the shared SCTP association constraints.
**Acceptance Criteria:**
- Progress handles network bottlenecks smoothly.
- Backpressure logic doesn't crash from memory over-accumulation during parallel reads.
