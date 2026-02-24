# Sprint 3 Tickets

Sprint goal: Chunked file transfer with streaming downloads and progress tracking.
Estimated tickets: 4

---

## T-3-01 | File Chunking & Reassembly Core | Priority: HIGH

What: Implement `chunkFile`, `reassembleChunks`, and `calculateProgress` in `transfer.js`, along with corresponding unit tests in `transfer.test.js`.
Why: Satisfies FR-08 (Chunking) and FR-10 (Progress calculation).
Acceptance: 
- `transfer.test.js` passes for chunking, reassembly, and progress math.
- A `File` properly splits into 64KB `ArrayBuffer` chunks.
Depends on: none

---

## T-3-02 | Send/Receive with Backpressure | Priority: HIGH

What: Implement `sendFile` and `receiveChunk` in `transfer.js` integrating the WebRTC `bufferedAmountLowThreshold` for backpressure.
Why: Satisfies FR-08 (Backpressure) preventing out-of-memory crashes on large files.
Acceptance: 
- Sender respects the 16MB high watermark by pausing, and resumes on the 1MB low watermark.
- Chunks have the index prepended correctly before transmission.
Depends on: T-3-01

---

## T-3-03 | Download Strategy Cascade & StreamSaver | Priority: HIGH

What: Implement the 3-strategy download cascade (`createServiceWorkerStream`, `openSaveFilePicker`, `triggerDownloadFromBlob`) and configure the `StreamSaver` Service Worker.
Why: Satisfies FR-09 and NFR 3.1 (Streaming download support for unlimited file sizes).
Acceptance: 
- `frontend/StreamSaver/` contains `mitm.html` and `sw.js`.
- Strategy cascade strictly follows priority: StreamSaver -> save file picker -> Blob fallback.
Depends on: none

---

## T-3-04 | Transfer Orchestration & Integration | Priority: HIGH

What: Wire up the `transfer.js` logic with the existing `peer.js` DataChannel in the application flow to test end-to-end file delivery.
Why: Satisfies the Sprint 3 goal (runnable demo of end-to-end file transfer).
Acceptance: 
- Sender can load a file and push it through the DataChannel.
- Receiver accumulates bytes and successfully triggers a file download locally upon completion.
Depends on: T-3-02, T-3-03
