# Sprint 9 Tickets

Sprint goal: Add React component tests and replace browser dialogs with React modals.
Estimated tickets: 6

---

## T-9-01 | React component tests — LandingPage | Priority: HIGH

What: Write Vitest tests for LandingPage form validation, room creation flow, and join room navigation.
Why: SRS FR-01 (Room Management) — ensure entry points work correctly.
Acceptance: All LandingPage tests pass. Form validation edge cases covered (empty fields, invalid codes).
Depends on: none

---

## T-9-02 | React component tests — RoomPage | Priority: HIGH

What: Write Vitest tests for RoomPage connection lifecycle states (connecting, connected, disconnected).
Why: SRS FR-01 (Room Management) — ensure room lifecycle is testable.
Acceptance: All RoomPage tests pass. States: idle, connecting, connected, disconnected, error.
Depends on: none

---

## T-9-03 | React component tests — useTransferLogic | Priority: HIGH

What: Write Vitest tests for control message handling (file-offer, file-accept, file-reject, file-cancel).
Why: SRS FR-02 (WebRTC Signaling) — ensure signaling logic is testable.
Acceptance: All useTransferLogic tests pass. Control message parsing and state transitions verified.
Depends on: none

---

## T-9-04 | React component tests — TransferDashboard | Priority: HIGH

What: Write Vitest tests for TransferDashboard progress rendering and stats display.
Why: SRS FR-03 (File Transfer) — ensure progress UI is correct.
Acceptance: All TransferDashboard tests pass. Progress percentage, speed, ETA display verified.
Depends on: none

---

## T-9-05 | React component tests — FileDropZone | Priority: MEDIUM

What: Write Vitest tests for FileDropZone drag/drop events and file selection.
Why: SRS FR-03 (File Transfer) — ensure file selection is testable.
Acceptance: All FileDropZone tests pass. Drag enter, drag leave, drop events covered.
Depends on: none

---

## T-9-06 | Replace browser dialogs with React modals | Priority: MEDIUM

What: Create Modal components and replace window.confirm/window.prompt calls with modal-based flows.
Why: Frontend polish — browser dialogs are jarring and cannot be styled.
Acceptance: All modals render correctly. File accept/reject and password prompts use modals. Tests pass.
Depends on: T-9-01, T-9-02
