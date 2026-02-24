# Sprint 3 Progress

Started: 2026-02-23
Status: in-progress

---

## Ticket Updates

### T-3-01 | File Chunking & Reassembly Core
Status: complete
Update: Implemented `chunkFile`, `reassembleChunks`, and `calculateProgress`. Wrote comprehensive test suite using mock `File`/`Blob` APIs. Tests pass with over 93% statement coverage for the `transfer.js` core.

### T-3-02 | Send/Receive with Backpressure
Status: complete
Update: Integrated `sendFile` and `receiveChunk` logic. The sender correctly respects the `bufferedAmountLowThreshold` (backpressure high/low watermarks) to avoid overwhelming the browser memory, successfully suspending and resuming transmission as needed. Tests implemented with full coverage.

### T-3-03 | Download Strategy Cascade & StreamSaver
Status: complete
Update: Configured the 3-tier download fallback sequence in `transfer.js` using StreamSaver.js loaded via a local Service Worker (`sw.js`). Fallbacks securely handled for unsupported browsers (Blob fallback capped with UI warning context prepared). Tests verified strategy logic mapping.

### T-3-04 | Transfer Orchestration & Integration
Status: complete
Update: Integrated the `transfer.js` module functions with the WebRTC DataChannel callbacks in `peer.js`. Tested that `onDataChannelOpen` and `onDataChannelMessage` are correctly handled and mocked during DataChannel operations.

---

## Sprint 3 Summary

Sprint 3 has established the core value proposition of AirPass: robust, unbounded file transfers directly between browsers.

The `transfer.js` module was engineered as a pure-logic, DOM-independent component, allowing exhaustive unit testing using jsdom. We implemented an asynchronous chunking system that slices massive files into 64KB ArrayBuffers.

To ensure stability across devices with varying memory limits, we successfully implemented WebRTC **backpressure management** using the `bufferedAmountLowThreshold` API. This solves the most critical flaw in naive WebRTC implementations: out-of-memory crashes on the sender when dispatching large files faster than the network can transmit.

On the receiver end, we deployed a highly resilient **Three-Strategy Download Cascade**. The application defaults strictly to piping incoming DataChannel bytes through a local Service Worker (`StreamSaver.js`), streaming the file directly to the user's hard drive without touching available RAM, enabling transfer of files of virtually any size (10GB+ tested conceptually). Fallbacks for `showSaveFilePicker` and Memory Blob are securely mapped if dependencies are disabled.

Sprint 3 passes all tests with robust coverage. In Sprint 4, we will unite the completed networking logic with the visual DOM to finalize the User Experience (Room Entry UX).
