# AGENTS.md — AI Agent Orchestration Guide
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Audience:** AI Coding Agents (Amazon Q Developer, Anthropic Claude, GitHub Copilot, Cursor, Windsurf, etc.)  
**Role of this document:** Orchestrator. This is the single document that tells the AI agent how to use all other documents together.

> **START HERE.** If you are an AI agent beginning work on this project, read this document fully before opening any other file. It defines how to navigate the documentation system, how to make decisions, how to execute development, and how to troubleshoot correctly.

---

## 0. Absolute Rules

These apply everywhere, always, without exception.

**No emoji.** No emoji characters anywhere in the project — not in code comments, not in docs, not in progress reports, not in ticket files, not in commit messages, not in console output strings, not in UI text. Plain text only throughout.

**No over-writing.** Ticket updates are 40-60 words. Sprint summaries are 150-200 words. Project understanding doc updates per sprint are 100-200 words. If you are writing more than this, stop and cut.

**KISS.** Every doc the agent creates or updates must be the simplest version that communicates the fact. No padding, no restating what is already known, no summaries of summaries.

---

## 1. Folder Layout

```
p2p-share/                          <- project root
|
|-- AGENTS.md                       <- this file, always at root
|
|-- knowledges/                     <- all documentation lives here
|   |-- BRD.md
|   |-- SRS.md
|   |-- Project-Features.md
|   |-- development-guideline.md
|   |-- backend-doc.md
|   |-- frontend-doc.md
|   |-- deployment-doc.md
|   |-- ai-assisted-dev-tips.md
|   |
|   |-- sprint-tickets/             <- one ticket file per sprint
|   |   |-- sprint-1-tickets.md
|   |   |-- sprint-2-tickets.md
|   |   ...
|   |
|   |-- sprint-progress/            <- one progress file per sprint
|   |   |-- sprint-1-progress.md
|   |   |-- sprint-2-progress.md
|   |   ...
|   |
|   |-- project-understanding/      <- quick-glance docs per project area
|   |   |-- backend-overview.md
|   |   |-- frontend-overview.md
|   |   |-- deployment-overview.md
|   |
|   |-- <other-meaningful-dir>/     <- agent creates dirs as needed
|       |-- <doc>.md
|
|-- backend/
|-- frontend/
|-- nginx/
|-- Dockerfile
|-- docker-compose.yml
```

**Rules for the knowledges/ tree:**

- The agent creates all sprint and progress files automatically at sprint start. The human does not create them.
- File names are lowercase, hyphenated, no spaces.
- When the agent needs to write a doc that does not fit an existing directory, it creates a meaningful directory name under `knowledges/` and places the doc inside it. The directory name should describe the content category, not the specific doc.
- No files from the knowledges tree are ever placed at the project root. Only AGENTS.md lives at root.

---

## 2. The Documentation System — Mental Model

This project has a layered documentation system. Every document has a defined role. Do not skip layers.

```
+------------------------------------------------------------------+
|                    LAYER 1: WHY (Business)                       |
|   BRD.md              -- Why this project exists. Read first.   |
|   Project-Features.md -- What features exist and why            |
+-----------------------------+------------------------------------+
                              | feeds into
+-----------------------------v------------------------------------+
|                    LAYER 2: WHAT (Specification)                 |
|   SRS.md -- Requirements. Architecture. Message protocol.       |
+-----------------------------+------------------------------------+
                              | feeds into
+-----------------------------v------------------------------------+
|                    LAYER 3: HOW (Implementation)                 |
|   backend-doc.md    -- How to build the backend                 |
|   frontend-doc.md   -- How to build the frontend               |
|   deployment-doc.md -- How to build the deployment             |
+-----------------------------+------------------------------------+
                              | governed by
+-----------------------------v------------------------------------+
|                    LAYER 4: STANDARDS (Process)                  |
|   development-guideline.md -- TDD, sprint order, tooling, style |
|   AGENTS.md               -- YOU ARE HERE. Orchestration.       |
+------------------------------------------------------------------+
```

Rule: Never make an architectural decision without checking Layer 1 and Layer 2 first. Never write code without checking the appropriate Layer 3 document. Never start a new task without checking Layer 4.

All Layer 1-3 documents live in `knowledges/`. AGENTS.md lives at the project root.

---

## 3. Document Reading Order by Scenario

### Scenario A: Starting the project from scratch
1. Read `BRD.md` — understand the product
2. Read `SRS.md` — understand the architecture and all requirements
3. Read `Project-Features.md` — understand all 33 features
4. Read `development-guideline.md` — understand TDD workflow and tooling
5. Read `backend-doc.md` — understand all backend implementation steps
6. Read `frontend-doc.md` — understand all frontend implementation steps
7. Read `deployment-doc.md` — understand deployment

### Scenario B: Implementing a specific feature
1. Find the feature in `Project-Features.md` — get the Sprint, SRS Ref, and Implementation pointer
2. Open the SRS Ref section in `SRS.md` — get the formal requirement
3. Open the Implementation pointer doc — get the step-by-step implementation guide
4. Check `development-guideline.md §3` — follow TDD cycle for this feature

### Scenario C: Fixing a bug
1. Identify which layer the bug is in (backend / frontend / deployment)
2. Open the relevant Layer 3 doc to understand expected behavior
3. Cross-reference the relevant functional requirement in `SRS.md`
4. Fix the minimum code that satisfies the requirement
5. Ensure tests still pass (`development-guideline.md §4`)

### Scenario D: Adding a new message type to the WebSocket protocol
1. **First**: Update `SRS.md §4` — the protocol spec is canonical here
2. **Then**: Update `backend-doc.md` — server-side handler
3. **Then**: Update `frontend-doc.md` — client-side handler
4. Write tests before implementation (`development-guideline.md §3`)

### Scenario E: Debugging a connection failure
1. Read `SRS.md §2.2` — WebRTC signaling requirements
2. Read `frontend-doc.md §4` — ICE and signaling implementation
3. Check browser `chrome://webrtc-internals` for ICE state
4. Verify TURN config via `deployment-doc.md §4`

---

## 4. Sprint Kickoff Protocol

Before writing a single line of code for any sprint, the agent must generate two documents. This is mandatory. No exceptions.

---

### Step 1: Generate the sprint ticket file

File location: `knowledges/sprint-tickets/sprint-N-tickets.md`

The agent reads the sprint spec from `AGENTS.md §5` (the sprint execution guide) and `SRS.md §7`, then breaks the sprint into discrete ticket-sized units of work with priority ordering. The human reads this file to understand exactly what is being built before the agent starts. The human may reorder, remove, or add tickets at this stage.

**Ticket file format:**

```
# Sprint N Tickets

Sprint goal: [one sentence from the sprint goal]
Estimated tickets: [count]

---

## T-N-01 | [Ticket title] | Priority: HIGH

What: [one sentence — what code is being written]
Why: [one sentence — which requirement this satisfies, e.g. SRS FR-01]
Acceptance: [1-3 bullet points — exactly when this ticket is done]
Depends on: [T-N-xx or "none"]

---

## T-N-02 | [Ticket title] | Priority: HIGH

...
```

Priority levels: HIGH / MEDIUM / LOW. Most tickets in a sprint are HIGH. MEDIUM is for polish or non-blocking items. LOW is for optional improvements that can be skipped if time is short.

The agent works through tickets in priority order: all HIGH tickets first, then MEDIUM, then LOW. Within the same priority level, the agent respects the dependency order listed in each ticket.

**Strict rules for ticket files:**
- No emoji anywhere in the file
- Ticket titles are plain descriptive phrases, not marketing copy
- Acceptance criteria are binary — each item is either done or not
- Do not pad with background, context paragraphs, or re-explanations of the sprint goal

---

### Step 2: Generate the sprint progress file

File location: `knowledges/sprint-progress/sprint-N-progress.md`

Created at sprint start with all ticket IDs listed as "pending". Updated after each ticket is completed. A final summary is appended when the sprint is done.

**Progress file format:**

```
# Sprint N Progress

Started: [date]
Status: in-progress

---

## Ticket Updates

### T-N-01 | [title]
Status: complete
Update: [40-60 words. State what was built, whether tests pass, and any
deviation from spec. Nothing else. Do not restate what the ticket said.]

### T-N-02 | [title]
Status: pending

...

---

## Sprint Summary
[Written only when all tickets are resolved. 150-200 words. Cover: what
was delivered, test status, any deviations from spec, and what the next
sprint depends on from this sprint's output. Plain prose. No lists.]
```

**Strict rules for progress files:**
- Per-ticket update: 40-60 words maximum. If you are writing more, cut it.
- Sprint summary: 150-200 words maximum.
- Status values are: pending / in-progress / complete / blocked
- No emoji anywhere in the file
- Do not copy-paste from the ticket file. The update reports outcome, not the plan.
- Update the file immediately after completing each ticket, not in batches.

---

### Step 3: Work through tickets in priority order

After both files exist and the human has had a chance to review the ticket file:
1. Pick the highest-priority unblocked ticket
2. Implement it following TDD (see `development-guideline.md §3`)
3. Mark it complete in the progress file with a 40-60 word update
4. Pick the next ticket

Do not work on multiple tickets simultaneously.

---

## 5. Project Understanding Docs

For each of the three project areas — backend, frontend, deployment — there is a standing quick-glance document in `knowledges/project-understanding/`. These docs are written for a developer (or the agent in a new session) who needs to understand how the project works without reading code.

**Files:**

| File | Updated by |
|------|-----------|
| `knowledges/project-understanding/backend-overview.md` | Agent, after each sprint that touches the backend |
| `knowledges/project-understanding/frontend-overview.md` | Agent, after each sprint that touches the frontend |
| `knowledges/project-understanding/deployment-overview.md` | Agent, after Sprint 6 |

**What each doc covers (use these headings, keep each section brief):**

```
# [Area] Overview

## What this area does
[2-3 sentences. The single-sentence job of this layer in the system.]

## Directory structure
[A simple annotated tree. One line per file/dir. No prose.]

## Where to find what
[A short table: "If you want X, look in Y". 5-10 rows max.]

## Key decisions and why
[Bullet list of non-obvious architectural choices made, with a one-line
reason for each. E.g. "Single uvicorn worker -- in-memory room state
cannot be shared across processes."]

## How data flows
[2-4 sentences or a simple ASCII diagram. The path a request takes
through this layer from entry to exit.]

## Known constraints
[Things a developer must not change without updating the spec. Keep to
3-5 items.]
```

**Update rules:**
- Update the relevant overview doc at the end of each sprint that changes that area.
- Each sprint's contribution to the overview should add or revise at most 100-200 words.
- Do not rewrite the whole doc each sprint. Edit the relevant sections in place.
- Do not duplicate information that is already in the Layer 3 mastery docs. The overview is a map, not a manual.
- No emoji.

---

## 6. Sprint-by-Sprint Execution Guide

> **Rule:** Complete each sprint fully (including tests) before starting the next. Do not cherry-pick features across sprints.

See `SRS.md §7` for the full sprint plan. Below is the AI agent's execution checklist for each sprint.

---

### Sprint 1 — Signaling Server

**Goal:** FastAPI + WebSocket room system working end-to-end. Two browser tabs can join the same room.

**Pre-sprint checklist:**
- [ ] `BRD.md` read and understood
- [ ] `SRS.md §2.1` (Room Management FRs) read
- [ ] `SRS.md §4` (WebSocket message protocol) read
- [ ] `backend-doc.md §2` (project setup) read
- [ ] `backend-doc.md §3` (room and WebSocket implementation) read
- [ ] `development-guideline.md §2` (uv setup) read

**Execution order:**
1. Set up project with `uv` per `development-guideline.md §2`
2. Write `test_room_manager.py` tests FIRST (TDD Red phase)
3. Implement `config.py` (environment loading)
4. Implement `models.py` (Pydantic message models)
5. Implement `room_manager.py` (room CRUD, code gen, expiry)
6. Make `test_room_manager.py` pass (TDD Green phase)
7. Write `test_websocket.py` integration tests FIRST
8. Implement `main.py` (FastAPI app, WebSocket endpoint)
9. Make `test_websocket.py` pass
10. Manual test: open two browser tabs, verify room creation and peer-joined message

**Definition of Done:**
- `uv run pytest` passes with 0 failures
- Two WebSocket clients can join the same room
- `peer-joined` message is received by the first client when the second joins
- Room expires correctly after 30 minutes

---

### Sprint 2 — WebRTC P2P Connection

**Goal:** DataChannel opens between two browsers. No file transfer yet — just the connection.

**Pre-sprint checklist:**
- [ ] `SRS.md §2.2` (WebRTC Signaling FRs) read
- [ ] `frontend-doc.md §2` (project setup) read
- [ ] `frontend-doc.md §3` (signaling.js) read
- [ ] `frontend-doc.md §4.1–4.3` (peer.js, ICE) read

**Execution order:**
1. Write `signaling.test.js` FIRST (WebSocket wrapper tests)
2. Implement `js/signaling.js`
3. Write `peer.test.js` FIRST (RTCPeerConnection mock tests)
4. Implement `js/peer.js` (offer/answer/ICE, DataChannel open)
5. Implement basic `index.html` and `room.html` stubs
6. Manual test: DataChannel `onopen` fires in both browsers

**Definition of Done:**
- `npx vitest run` passes
- DataChannel opens between two browser tabs (same machine)
- DataChannel opens between two browsers on different machines (same network)
- Connection status shows `Connected` in UI

---

### Sprint 3 — File Transfer

**Goal:** Full file transfer with progress display working. Strategy 3 (Service Worker) active as the default download strategy from day one.

**Pre-sprint checklist:**
- [ ] `SRS.md §2.3` (File Transfer FRs) read, specifically updated FR-09 (three-strategy cascade)
- [ ] `frontend-doc.md §4.4–4.7` (transfer.js and full strategy section) read
- [ ] `frontend-doc.md §6.2–6.3` (progress UI) read
- [ ] `Project-Features.md §F-21` (download strategy table) read

**Execution order:**
1. Write `transfer.test.js` FIRST (chunking, reassembly, backpressure, strategy selector logic)
2. Implement `js/transfer.js` including all three strategy functions and `selectDownloadStrategy()`
3. Add StreamSaver.js CDN script to `join.html` `<head>`:
   `<script src="https://cdn.jsdelivr.net/npm/streamsaver@2.0.6/StreamSaver.min.js"></script>`
4. Copy `mitm.html` and `sw.js` from StreamSaver dist into `frontend/StreamSaver/`
5. Implement file metadata send/receive protocol
6. Implement `showBrowserWarning()` in `js/ui.js` (shown when Strategy 1 fallback is reached)
7. In `join.html` file accept flow: call `selectDownloadStrategy()`, handle `showWarning`, then proceed
8. Implement progress calculation (speed, ETA, percentage)
9. Implement `js/ui.js` progress bar and speed meter
10. Implement `room.html` and `join.html` with full UI
11. Manual test: transfer a 100MB file end-to-end

**Definition of Done:**
- Transfer tests pass
- 1MB file transfers correctly (hash verified)
- 100MB file transfers correctly
- Strategy 3 is active (confirm `[Strategy 3] Service Worker streaming active` in browser console)
- Strategy 1 fallback shows the browser warning UI (test by temporarily unloading StreamSaver)
- Progress bar and speed meter update in real time
- Automatic download triggers on receiver side

---

### Sprint 4 — Room Entry UX

**Goal:** All three entry methods work. Mobile-responsive.

**Pre-sprint checklist:**
- [ ] `Project-Features.md §F-04 to F-06` read
- [ ] `frontend-doc.md §5` (entry points) read

**Execution order:**
1. Implement URL-based auto-join (`join.html` reads URL params)
2. Implement code-based join form on `index.html`
3. Implement QR code generation on `room.html` using `qrcode.js`
4. Implement mobile-responsive CSS in `style.css`
5. Test all three entry methods manually

---

### Sprint 5 — Encryption

**Goal:** Password-protected AES-256-GCM encrypted transfers work.

**Pre-sprint checklist:**
- [ ] `SRS.md §2.4` (Encryption FRs) read
- [ ] `frontend-doc.md §5.4–5.5` (crypto.js) read
- [ ] `backend-doc.md §5` (password handling) read

**Execution order:**
1. Write `crypto.test.js` FIRST — test key derivation and encrypt/decrypt round-trip
2. Implement `js/crypto.js` (PBKDF2 + AES-GCM)
3. Make `crypto.test.js` pass
4. Update `room_manager.py` to store bcrypt password hash
5. Update `models.py` to add password to room creation message
6. Implement password verify endpoint (`verify-password` WS message)
7. Update `transfer.js` to encrypt chunks before send, decrypt after receive
8. Manual test: encrypted 10MB transfer, verify file integrity

**Definition of Done:**
- Crypto tests pass at 100% coverage
- Encrypted transfer produces identical file to unencrypted
- Wrong password correctly rejected
- No password content appears in any server log

---

### Sprint 6 — Deployment

**Goal:** Production deployment via Docker Compose with Nginx and TURN.

**Pre-sprint checklist:**
- [ ] `deployment-doc.md` read fully
- [ ] TURN server provisioned (Coturn or Metered.ca)

**Execution order:**
1. Write `Dockerfile` per `deployment-doc.md §2.1`
2. Write `docker-compose.yml` per `deployment-doc.md §2.2`
3. Write `nginx/nginx.conf` per `deployment-doc.md §3`
4. Configure TURN per `deployment-doc.md §4`
5. Set all environment variables in `.env`
6. Deploy and test on a real VPS
7. Test across different networks (cellular to WiFi)
8. Confirm TURN fallback works

---

## 7. Decision-Making Framework

When you face a decision while implementing, use this hierarchy:

```
1. Is this decision covered by SRS.md? → Follow SRS.md. No exceptions.
2. Is this a business constraint from BRD.md? → Honor it. No exceptions.
3. Is this a development standard from development-guideline.md? → Follow it.
4. Is this covered in the relevant Layer 3 doc? → Follow that doc.
5. Not covered anywhere? → Make the simplest decision that satisfies the requirements.
   Then document what you decided and why in a comment.
```

**Never override `SRS.md` without explicit human instruction.** The message protocol in `SRS.md §4`, the project structure in `SRS.md §1.3`, and the TDD mandate in `SRS.md §6` are non-negotiable.

---

## 8. Prohibited Actions

The following actions are **explicitly prohibited** without explicit human approval:

| Prohibited | Why |
|-----------|-----|
| Using emoji anywhere in the project | Rule 0. No emoji in docs, code comments, commit messages, UI strings, or progress files. Plain text only. |
| Writing more than 60 words for a ticket update | Rule 0. Violates the KISS mandate for progress docs. Cut it. |
| Writing more than 200 words for a sprint summary | Rule 0. Same. |
| Starting sprint implementation before the ticket file is written and reviewed | Violates the sprint kickoff protocol in AGENTS.md §4. |
| Updating progress docs in batches instead of after each ticket | Violates §4. Update immediately after completing each ticket. |
| Placing sprint or progress files outside knowledges/ | Violates the folder layout in AGENTS.md §1. |
| Placing any doc at the project root (other than AGENTS.md) | Violates §1. All docs go in knowledges/ or a subdirectory. |
| Passing file bytes through the server WebSocket | Violates BR-01 and the entire product premise |
| Storing file content server-side in any form | Same as above |
| Adding a user authentication system | Out of scope per BRD.md §7 |
| Adding a database (SQLite, Postgres, etc.) | Not needed; in-memory state is correct per BRD.md §4 BR-01 |
| Hardcoding TURN credentials in JavaScript | Security violation per SRS.md §3.2 |
| Sending the plaintext password to the server | Violates BR-03 |
| Changing the project directory structure | SRS.md §1.3 is canonical |
| Implementing Sprint N+1 features while Sprint N is incomplete | Violates development-guideline.md §3 |
| Writing implementation before writing tests | Violates TDD mandate in SRS.md §6 and development-guideline.md §3 |
| Using Memory Blob (Strategy 1) as the default download without StreamSaver | Violates FR-09 and the 10GB file size target. Strategy 3 must always be tried first. |
| Skipping showBrowserWarning() when Strategy 1 is reached | Violates FR-09 — user must be warned before a RAM-limited download begins |

---

## 9. Code Generation Rules

### 6.1 Always Generate Tests First

For any new Python function or module:
```
# WRONG - implementation first
def generate_room_code() -> str:
    ...

# CORRECT - test first, then implementation
# In test_room_manager.py:
def test_generate_room_code_returns_6_chars():
    code = generate_room_code()
    assert len(code) == 6

def test_generate_room_code_is_alphanumeric():
    code = generate_room_code()
    assert code.isalnum()

def test_generate_room_code_is_uppercase():
    code = generate_room_code()
    assert code == code.upper()

# Then implement generate_room_code() in room_manager.py
```

### 6.2 Module Responsibilities Are Fixed

Do not put logic in the wrong module. The module responsibilities are defined in `SRS.md §1.3`:

| Module | Contains | Does NOT contain |
|--------|----------|-----------------|
| `main.py` | FastAPI app, routes, WS endpoint | Business logic |
| `room_manager.py` | Room state, code gen, expiry | HTTP/WS handling |
| `models.py` | Pydantic schemas only | Logic |
| `config.py` | Settings loading only | Logic |
| `signaling.js` | WebSocket connection | WebRTC logic |
| `peer.js` | RTCPeerConnection | File chunking |
| `transfer.js` | File chunking, reassembly | WebRTC, UI |
| `crypto.js` | Key derivation, encrypt/decrypt | File handling, UI |
| `ui.js` | DOM manipulation | WebRTC, crypto, transfer |

### 6.3 Message Protocol is Canonical

All WebSocket message types are defined in `SRS.md §4`. If you need to add a message type:
1. Add it to `SRS.md §4` first
2. Add its Pydantic model to `models.py`
3. Add the handler to `main.py`
4. Add the client handler to `signaling.js`
5. Write tests for all four steps

### 6.4 Environment Variables

Always load from `config.py`. Never access `os.environ` directly outside `config.py`. See `SRS.md §9` for the full list of environment variables.

---

## 10. Troubleshooting Guide

### Problem: WebSocket connection drops immediately
1. Check `nginx.conf` — verify `Upgrade` and `Connection` headers are proxied  
   → `deployment-doc.md §3.2`
2. Check `main.py` — verify WebSocket endpoint path matches client  
   → `backend-doc.md §3.5`
3. Check CORS settings if frontend is on a different origin  
   → `backend-doc.md §2.4`

### Problem: ICE connection stuck in `checking` state
1. Verify STUN server is reachable: `stun.l.google.com:19302`
2. Check `/api/ice-config` response in browser dev tools  
   → `backend-doc.md §4.2`
3. Check `chrome://webrtc-internals` — look for `srflx` candidates
4. If only `host` candidates appear, STUN is failing — check firewall
5. If on symmetric NAT, TURN is required  
   → `deployment-doc.md §4`

### Problem: DataChannel never opens
1. Verify SDP offer was sent before ICE candidates  
   → `frontend-doc.md §4.3`
2. Verify `setRemoteDescription` is called before `addIceCandidate`  
   → `frontend-doc.md §4.3`
3. Check that DataChannel label matches on both sides  
   → `frontend-doc.md §4.1`

### Problem: File transfer corrupts or crashes browser
1. Check backpressure implementation — `bufferedAmount` threshold  
   → `frontend-doc.md §4.5`
2. Verify chunk index is included in each chunk  
   → `frontend-doc.md §4.4`
3. Verify chunk reassembly uses index not insertion order  
   → `frontend-doc.md §4.6`

### Problem: Encrypted transfer produces wrong file
1. Verify salt is sent in metadata message before any chunks  
   → `SRS.md §4.3`, `frontend-doc.md §5.5`
2. Verify IV is prepended to each chunk (12 bytes prefix)  
   → `frontend-doc.md §5.5`
3. Verify key derivation uses identical parameters on both sides  
   → `frontend-doc.md §5.5` (`crypto.js`)
4. Run `crypto.test.js` — all tests must pass before testing E2E

### Problem: TURN server not working
1. Verify credentials in `.env` are correct  
   → `deployment-doc.md §4.2`
2. Test TURN connectivity: use `webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`
3. Verify TURN port (3478 UDP/TCP) is open in firewall  
   → `deployment-doc.md §4.3`
4. Check Coturn logs: `docker logs coturn`  
   → `deployment-doc.md §4.4`

### Problem: Tests fail after a correct implementation
1. Verify you are running in the correct virtual environment  
   → `development-guideline.md §2`
2. Verify `uv sync` has been run after adding new dependencies
3. Check for async test issues — use `@pytest.mark.asyncio`  
   → `backend-doc.md §6.2`
4. Check for test isolation issues — rooms should be reset between tests  
   → `backend-doc.md §6.3`

---

## 11. Communication Protocol (Human and Agent)

When you (the AI agent) are uncertain, stop and ask. Do not make assumptions on:

- Security-related decisions (encryption, password handling)
- Anything that modifies the WebSocket message protocol in `SRS.md §4`
- Any change to the project directory structure in `SRS.md §1.3`
- Whether a feature is in scope (check `BRD.md §7`)

When reporting a sprint start, state:
1. The sprint ticket file has been created at `knowledges/sprint-tickets/sprint-N-tickets.md`
2. The sprint progress file has been created at `knowledges/sprint-progress/sprint-N-progress.md`
3. Which ticket you are starting first and why (highest priority)
4. Ask the human to review the ticket file before proceeding

When reporting a ticket complete, state:
1. Which ticket ID was completed
2. That the progress file has been updated
3. Which ticket is next

When reporting a sprint complete, state:
1. That the sprint summary has been appended to the progress file
2. That the relevant project understanding docs have been updated
3. What the next sprint is and what it depends on from this sprint

No emoji in any communication or any file the agent creates.

---

## 12. Quick Reference — Document Map

| Question | Read this |
|---------|-----------|
| Where do docs live? | `AGENTS.md §1` (folder layout) |
| How do I start a sprint? | `AGENTS.md §4` (sprint kickoff protocol) |
| Where is the sprint ticket file? | `knowledges/sprint-tickets/sprint-N-tickets.md` |
| Where is the sprint progress file? | `knowledges/sprint-progress/sprint-N-progress.md` |
| Where are the project overview docs? | `knowledges/project-understanding/` |
| What problem are we solving? | `knowledges/BRD.md §2` |
| What are all the features? | `knowledges/Project-Features.md` |
| What does feature X require? | `knowledges/SRS.md §2` (Functional Requirements) |
| What is the WebSocket protocol? | `knowledges/SRS.md §4` |
| What is the project structure? | `knowledges/SRS.md §1.3` |
| How do I set up the backend project? | `knowledges/backend-doc.md §2` |
| How do I implement room management? | `knowledges/backend-doc.md §3` |
| How do I implement the WebSocket relay? | `knowledges/backend-doc.md §3.5` |
| How do I implement RTCPeerConnection? | `knowledges/frontend-doc.md §4` |
| How do I implement file chunking? | `knowledges/frontend-doc.md §4.4` |
| How do I implement backpressure? | `knowledges/frontend-doc.md §4.5` |
| How do I implement encryption? | `knowledges/frontend-doc.md §5.5` |
| How do I write the Dockerfile? | `knowledges/deployment-doc.md §2.1` |
| How do I configure Nginx for WebSocket? | `knowledges/deployment-doc.md §3.2` |
| How do I set up TURN? | `knowledges/deployment-doc.md §4` |
| What are the TDD rules? | `knowledges/development-guideline.md §3` |
| What tools and versions do I use? | `knowledges/development-guideline.md §2` |
| How do I run tests? | `knowledges/development-guideline.md §4` |
