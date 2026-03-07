# Sprint 7 Progress

## T-7-01: Update peer.js for Dual DataChannels and Negotiated Control Channel
**Status:** Done
- [x] Defined multi-channel architecture.
- [x] Split generic DataChannel into `p2p-control` plus dynamic UUID channels.
- [x] Upgrade Control Channel initialization to use `negotiated: true, id: 0` per IETF specifications.

## T-7-02: Fix File Picker and UI Issues
**Status:** Done
- [x] Wire up `setupDragAndDrop` loop unconditionally on both ends.
- [x] Fix isolation of rejected state in `room.js`.

## T-7-03: Implement the Sending & Receiving Queues UI
**Status:** Done
- [x] Add dynamic UI functions (`addQueueItem`, `updateQueueItemProgress`).
- [x] Split queue visuals.
- [x] Integrate local StreamSaver instances isolated by transfer UUID.

## T-7-04: Backpressure Handling
**Status:** Done
- [x] Modify `transfer.js` or `room.js` to ensure the multiple files sharing a single ICE interface don't overflow the buffer out of bounds.
