# Project-Features.md — Feature Catalogue
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Status:** Approved for Development  

> **For AI Agents:** This document is the definitive list of every user-facing and system-level feature in P2P Share. Use it as a checklist during development to ensure nothing is forgotten. Each feature maps to one or more functional requirements in `SRS.md`. For business rationale behind each feature, see `BRD.md`. For implementation details, consult `backend-doc.md`, `frontend-doc.md`, or `deployment-doc.md` as indicated.

---

## How to Read This Document

Each feature entry contains:
- **What it is** — plain English description
- **Why it exists** — the user need it addresses
- **Sprint** — which development sprint introduces it (see `SRS.md §7`)
- **SRS Ref** — the functional requirement it satisfies
- **Implementation pointer** — which doc to read for implementation

---

## Feature Group 1: Room & Session Management

---

### F-01: One-Click Room Creation

**What it is:** A single "Create Room" button on the home page that instantly creates a transfer session. No forms to fill, no account required.

**Why it exists:** Reduces friction to zero for the sender. The fastest path from "I want to share a file" to "I have a link I can send" must be one click.

**Sprint:** S1  
**SRS Ref:** FR-01  
**Implementation:** `backend-doc.md §3.1` (server), `frontend-doc.md §3.1` (client)

---

### F-02: 6-Digit Room Code

**What it is:** Every room is assigned a short, human-readable 6-character alphanumeric code (e.g., `X7K2P9`). The code is displayed prominently on the sender's screen and can be shared verbally, via text message, or any channel.

**Why it exists:** URLs are cumbersome to share verbally or type on a phone. A 6-digit code can be read aloud or texted in seconds. Designed for the scenario: "I'm in the same room as you — just type this code."

**Sprint:** S1  
**SRS Ref:** FR-01, FR-03  
**Implementation:** `backend-doc.md §3.2` (code generation), `frontend-doc.md §3.2` (display)

---

### F-03: Shareable Room URL

**What it is:** After room creation, a full URL is generated (e.g., `https://yourapp.com/join/X7K2P9`) that the receiver can click to join instantly. The URL contains the room code so no additional input is needed.

**Why it exists:** Sharing a URL via messaging app, email, or chat is the most common digital sharing pattern. Clicking a link is zero-effort for the receiver.

**Sprint:** S1  
**SRS Ref:** FR-01, FR-02  
**Implementation:** `frontend-doc.md §3.3`

---

### F-04: QR Code for Mobile Entry

**What it is:** The sender's room page displays a QR code that encodes the shareable room URL. The receiver can point their phone camera at it to join instantly — no typing required.

**Why it exists:** When the sender is on a desktop and the receiver is on a phone, scanning a QR code is faster than any other entry method. Eliminates the need to type a URL or code on mobile.

**Sprint:** S4  
**SRS Ref:** FR-14  
**Implementation:** `frontend-doc.md §5.1` — uses `qrcode.js` CDN, client-side only

---

### F-05: Join by Code (Home Page)

**What it is:** A text input field on the home page where the receiver types the 6-digit code and clicks "Join". Case-insensitive. Auto-formats to uppercase as the user types.

**Why it exists:** Complements the URL and QR code entry methods. Essential when the receiver received the code verbally or via a channel that doesn't support clickable links.

**Sprint:** S4  
**SRS Ref:** FR-02, FR-15  
**Implementation:** `frontend-doc.md §5.2`

---

### F-06: Join by URL (Auto-Entry)

**What it is:** When the receiver navigates to a room URL (e.g., `/join/X7K2P9`), the app automatically extracts the code and initiates the join — no interaction required beyond opening the link.

**Why it exists:** The click-a-link experience should be frictionless. The receiver should not have to do anything after clicking.

**Sprint:** S4  
**SRS Ref:** FR-02, FR-15  
**Implementation:** `frontend-doc.md §5.3`

---

### F-07: Room Expiry

**What it is:** Rooms automatically expire 30 minutes after creation or immediately when both peers disconnect, whichever comes first. Expired rooms are removed from memory.

**Why it exists:** Prevents memory leaks and stale state accumulation on the server. A room has no purpose after both peers have disconnected.

**Sprint:** S1  
**SRS Ref:** FR-01  
**Implementation:** `backend-doc.md §3.4`

---

## Feature Group 2: WebRTC Connection

---

### F-08: Automatic P2P Connection

**What it is:** Once both peers are in the room, the WebRTC connection is established automatically — no additional user action required. The system performs SDP offer/answer and ICE negotiation transparently.

**Why it exists:** Connection setup is a technical detail the user should never see or think about. It should just work.

**Sprint:** S2  
**SRS Ref:** FR-04, FR-05, FR-06  
**Implementation:** `frontend-doc.md §4` — `peer.js` handles all RTCPeerConnection logic

---

### F-09: STUN-Based NAT Traversal

**What it is:** The client-side ICE agent queries a STUN server (`stun.l.google.com:19302`) to discover the peer's public IP:port. This enables direct P2P for approximately 80-85% of connections.

**Why it exists:** Most users are behind NAT (home routers). Without STUN, peers can't find each other's public address.

**Sprint:** S2  
**SRS Ref:** FR-06  
**Implementation:** `frontend-doc.md §4.2`, ICE config returned by `/api/ice-config`

---

### F-10: TURN Relay Fallback

**What it is:** For the ~15-20% of connections where direct P2P is impossible (symmetric NAT, strict firewalls), the ICE agent falls back to routing data through a TURN relay server.

**Why it exists:** Without TURN, a significant minority of users would get hard failures. Reliability across all network types is a core requirement.

**Sprint:** S6  
**SRS Ref:** NFR §3.3  
**Implementation:** `deployment-doc.md §4` — Coturn self-hosted configuration

---

### F-11: Trickle ICE

**What it is:** ICE candidates are sent to the signaling server as they are discovered (not waiting for gathering to complete). This reduces connection setup time by running SDP exchange and ICE gathering in parallel.

**Why it exists:** The standard approach of waiting for full ICE gathering before sending the SDP adds hundreds of milliseconds of unnecessary latency to connection setup.

**Sprint:** S2  
**SRS Ref:** FR-06  
**Implementation:** `frontend-doc.md §4.3`

---

### F-12: Connection Status Display

**What it is:** A visible status indicator showing the current connection state: `Waiting for peer` → `Connecting…` → `Connected` → `Transferring` → `Complete` → `Failed`.

**Why it exists:** WebRTC connection setup takes 0.5–3 seconds. Users need feedback that something is happening. A stuck "Connecting…" state that transitions to a clear "Failed — try again" message is essential for usability.

**Sprint:** S2  
**SRS Ref:** FR-16  
**Implementation:** `frontend-doc.md §6.1`

---

## Feature Group 3: File Transfer

---

### F-13: Drag-and-Drop File Selection

**What it is:** The sender can drag a file onto the room page to select it for transfer. A file picker dialog is also available as a fallback.

**Why it exists:** Drag-and-drop is the most natural way to "hand over" a file. It mirrors the mental model of physical transfer.

**Sprint:** S3  
**SRS Ref:** FR-07  
**Implementation:** `frontend-doc.md §3.4`

---

### F-14: File Preview Before Transfer

**What it is:** Before any data is sent, the receiver sees a "File ready" card showing: filename, file size (human-readable, e.g., "23.4 MB"), file type icon, and Accept/Reject buttons.

**Why it exists:** The receiver must consent to receiving a file. They should know what they're about to receive before their browser starts downloading it. This is especially important for unexpected transfers.

**Sprint:** S3  
**SRS Ref:** FR-07  
**Implementation:** `frontend-doc.md §3.5` — metadata sent via DataChannel before any chunks

---

### F-15: Chunked File Transfer

**What it is:** Files are split into 64KB chunks and sent sequentially over the WebRTC DataChannel. The DataChannel is configured for reliable, ordered delivery.

**Why it exists:** WebRTC DataChannel cannot send a file as one large binary blob — there are buffer size limits. Chunking enables transfer of files of any size and enables progress tracking.

**Sprint:** S3  
**SRS Ref:** FR-08  
**Implementation:** `frontend-doc.md §4.4` — `transfer.js`

---

### F-16: Backpressure Management

**What it is:** The sender monitors `RTCDataChannel.bufferedAmount`. If the send buffer exceeds 16MB, the sender pauses sending chunks. It resumes when the buffer drains below 1MB. Uses the `bufferedAmountLowThreshold` event.

**Why it exists:** Without backpressure, the sender can flood the DataChannel send buffer, causing memory growth and eventual browser crashes — especially on large files. This is the most common cause of file transfer failures in naive implementations.

**Sprint:** S3  
**SRS Ref:** FR-08  
**Implementation:** `frontend-doc.md §4.5`

---

### F-17: Real-Time Progress Bar

**What it is:** A progress bar that fills as chunks are delivered. Displayed on both sender and receiver sides.

**Why it exists:** Visual feedback during transfer. Users need to know something is happening and roughly how long to wait.

**Sprint:** S3  
**SRS Ref:** FR-10  
**Implementation:** `frontend-doc.md §6.2`

---

### F-18: Live Transfer Speed Meter

**What it is:** A real-time display of the current transfer speed in human-readable format (e.g., "12.4 MB/s"). Computed over a 1-second rolling window.

**Why it exists:** Transfer speed tells the user whether the connection is healthy and helps estimate completion time. It also surfaces problems — a speed that drops to near-zero signals a connection issue.

**Sprint:** S3  
**SRS Ref:** FR-10  
**Implementation:** `frontend-doc.md §6.3`

---

### F-19: Estimated Time Remaining

**What it is:** A countdown showing approximately how long the transfer will take to complete, based on current speed and remaining bytes. Updates every second.

**Why it exists:** "2 minutes remaining" is far more useful than a percentage alone. Users need to decide whether to wait at their computer or walk away.

**Sprint:** S3  
**SRS Ref:** FR-10  
**Implementation:** `frontend-doc.md §6.3`

---

### F-20: Total Data Transferred Counter

**What it is:** A running total showing bytes sent/received in human-readable format (e.g., "47.2 MB of 200 MB").

**Why it exists:** Confirms the transfer is progressing and gives absolute context to the progress bar.

**Sprint:** S3  
**SRS Ref:** FR-10  
**Implementation:** `frontend-doc.md §6.2`

---

### F-21: Automatic File Download (Streaming-to-Disk)

**What it is:** When all chunks have been received and (if encrypted) decrypted, the browser automatically triggers a file download with the original filename. The implementation uses a **fixed three-strategy cascade** — Strategy 3 (Service Worker) is always tried first on every browser without exception.

| Priority | Strategy | RAM | Browsers | On failure |
|----------|----------|-----|----------|-----------|
| **1st — always** | Service Worker / StreamSaver.js | None ✅ | All ✅ | → Strategy 2 |
| **2nd — fallback** | `showSaveFilePicker` | None ✅ | Chrome/Edge (skipped on Firefox — silently uses RAM) | → Strategy 1 |
| **3rd — last resort** | Memory Blob | Full file 🔴 | All ✅ | Show user warning |

**User warning on Strategy 1:** When the cascade reaches Memory Blob, a blocking UI warning appears before transfer begins: *"Your browser doesn't support memory-efficient file downloads. For files over 1 GB, please use Chrome."* The user can confirm (proceed, ~1GB cap) or cancel and switch browsers.

**Why it exists:** Naïve memory-based download crashes browsers above ~1–2GB. Service Worker streaming via StreamSaver.js is required to hit the 10GB target and works on all modern browsers — it is not a Chrome-only feature.

**Sprint:** S3 onwards — StreamSaver.js CDN script must be in `join.html` from Sprint 3. There is no planned "upgrade path" — Strategy 3 is the default from the first working build.  
**SRS Ref:** FR-09, NFR §3.1  
**Implementation:** `frontend-doc.md §4.7` — full code for all three strategies, `selectDownloadStrategy()`, and `showBrowserWarning()` in `ui.js`

---

## Feature Group 4: Privacy & Security

---

### F-22: Zero Server File Storage

**What it is:** An architectural guarantee: the FastAPI server only processes WebSocket signaling messages (small JSON payloads). It never receives, stores, buffers, logs, or has any access to file content.

**Why it exists:** This is the core privacy promise of the product. Verifiable from the source code. Cannot be accidentally broken if the architecture is correct.

**Sprint:** S1 (architectural)  
**SRS Ref:** BR-01, NFR §3.2  
**Implementation:** `backend-doc.md §1` — the WebSocket endpoint is a pure relay

---

### F-23: Mandatory DTLS Encryption (Transport Layer)

**What it is:** All WebRTC DataChannel communication is encrypted via DTLS (Datagram Transport Layer Security) — this is built into the WebRTC standard and cannot be disabled. No configuration required.

**Why it exists:** Protects all file data from network eavesdroppers on the path between the two peers. Even the ISP cannot read the transferred file.

**Sprint:** S2 (inherent to WebRTC)  
**SRS Ref:** NFR §3.2  
**Implementation:** Automatic — no code required

---

### F-24: Optional Password Protection (Room Entry)

**What it is:** The sender can optionally set a password when creating a room. The receiver must enter the correct password before seeing the file metadata or connecting to the DataChannel. The server stores only a bcrypt hash of the password.

**Why it exists:** Prevents unauthorized access to a room if the URL or code leaks. The server-side bcrypt check is a "room entry guard" — it is not the encryption key.

**Sprint:** S5  
**SRS Ref:** FR-11  
**Implementation:** `backend-doc.md §5.1`, `frontend-doc.md §5.4`

---

### F-25: End-to-End File Encryption (AES-256-GCM)

**What it is:** When a password is set, each 64KB chunk is encrypted client-side with AES-256-GCM before being sent over the DataChannel. The encryption key is derived from the password using PBKDF2 (100,000 iterations). A unique random IV is used per chunk.

**Why it exists:** Even though DTLS protects the WebRTC transport, there is a scenario where the TURN relay server routes all traffic. In that case, if the TURN server is compromised, file bytes are visible. AES-GCM encryption ensures that even a compromised TURN server cannot read file content. Also protects against a compromised DTLS implementation.

**Sprint:** S5  
**SRS Ref:** FR-12, FR-13  
**Implementation:** `frontend-doc.md §5.5` — `crypto.js`

---

### F-26: Password Never Sent to Server

**What it is:** The actual password entered by the user is never transmitted to the server. For server-side room entry verification, the server stores a bcrypt hash (set at room creation). For encryption, the key is derived entirely client-side using Web Crypto API.

**Why it exists:** The server should not be trusted with the password. This is the "zero knowledge" design: the server can verify room entry (via bcrypt comparison) without ever knowing the plaintext password.

**Sprint:** S5  
**SRS Ref:** FR-12, BR-03  
**Implementation:** `frontend-doc.md §5.5`, `backend-doc.md §5.1`

---

### F-34: Peer IP Disclosure Notice

**What it is:** A persistent, clearly visible notice on both the sender and receiver screens stating that the connection is direct peer-to-peer and that the other party can see their IP address. Example text: *"🔗 Direct connection — the other party can see your IP address."* An optional "Use relay only" toggle routes all WebRTC traffic through TURN to hide peer IPs (at the cost of speed and server bandwidth).

**Why it exists:** WebRTC P2P connections are inherently transparent about IP addresses — each peer must learn the other's IP to establish a direct connection. This is not a bug or a security flaw; it is how the protocol works. However, users have a reasonable expectation to know this before connecting. Not disclosing it would be dishonest for a privacy-first product.

The "Use relay only" TURN-only mode is an advanced opt-in for users who need maximum anonymity (e.g., activist use, medical file sharing). It routes everything through the TURN server, hiding peer IPs from each other, at the cost of server bandwidth and some speed.

**Sprint:** S4 (notice UI) / S6 (TURN-only toggle, requires TURN server)  
**SRS Ref:** SRS §3.2 (Peer IP disclosure row)  
**Implementation:** `frontend-doc.md §6` (`ui.js` — notice banner), `frontend-doc.md §4.2` (`peer.js` — TURN-only ICE config option)

---

## Feature Group 5: User Experience

---

### F-27: No Account Required

**What it is:** Zero registration, login, or email required. Open the app, create a room, share the link. Done.

**Why it exists:** Account requirements create friction and trust issues. Privacy-focused users are often reluctant to create accounts. Anonymous usage is a core product principle.

**Sprint:** S1 (architectural)  
**SRS Ref:** BR-02  
**Implementation:** No authentication system is built.

---

### F-28: Clean Minimal UI

**What it is:** A focused, distraction-free interface. Three screens: Home (create/join), Sender view (room code, QR, file selection), Receiver view (file info card, progress). No advertisements, banners, or unnecessary UI elements.

**Why it exists:** Privacy-conscious users are often technically sophisticated and have low tolerance for cluttered UIs. The design communicates trustworthiness.

**Sprint:** S3 (polished in S4)  
**SRS Ref:** FR-15, FR-16  
**Implementation:** `frontend-doc.md §6` — `ui.js`, `style.css`

---

### F-29: Transfer Cancel

**What it is:** Both sender and receiver can cancel an in-progress transfer at any time. The other peer is notified via a DataChannel message and the connection is cleaned up gracefully.

**Why it exists:** Mistakes happen. A user may select the wrong file. The receiver may want to decline mid-transfer. Graceful cancellation is essential for a production-quality tool.

**Sprint:** S3  
**SRS Ref:** FR-09 (control messages)  
**Implementation:** `frontend-doc.md §4.7`

---

### F-30: Mobile-Responsive Design

**What it is:** The UI adapts to small screen sizes. All interactive elements are touch-friendly (minimum 44px tap targets). QR scanning works on mobile cameras.

**Why it exists:** The receiver joining via QR code is by definition on a mobile device. The receiver experience must be fully functional on mobile.

**Sprint:** S4  
**SRS Ref:** BRD §9 (G6)  
**Implementation:** `frontend-doc.md §6.5`

---

## Feature Group 6: Infrastructure & Deployment

---

### F-31: Single-Command Deployment

**What it is:** The entire application (FastAPI backend + Nginx) deploys with `docker compose up -d`. No manual steps beyond setting environment variables.

**Why it exists:** Self-hostability is a core value proposition. Technical users should be able to run their own private instance easily.

**Sprint:** S6  
**SRS Ref:** BRD §9 (G5)  
**Implementation:** `deployment-doc.md §2`

---

### F-32: Environment-Based Configuration

**What it is:** All sensitive configuration (TURN credentials, secret keys, settings) is loaded from environment variables or a `.env` file. No secrets are hardcoded.

**Why it exists:** Prevents secrets from being accidentally committed to version control. Enables easy configuration across development, staging, and production environments.

**Sprint:** S1  
**SRS Ref:** SRS §9  
**Implementation:** `backend-doc.md §2.3`, `deployment-doc.md §3`

---

### F-33: ICE Server Config Endpoint

**What it is:** The client fetches STUN/TURN server URLs and credentials from a `/api/ice-config` endpoint rather than having them hardcoded in JavaScript. The server generates short-lived TURN credentials if using Metered.ca or Coturn's REST API.

**Why it exists:** TURN credentials must never be hardcoded in client-side JavaScript (they would be publicly visible). Serving them from the backend allows credential rotation and per-session credentials.

**Sprint:** S2 (STUN only), S6 (TURN added)  
**SRS Ref:** SRS §5  
**Implementation:** `backend-doc.md §4.2`, `frontend-doc.md §4.2`

---

## Feature Summary Table

| # | Feature | Sprint | Group |
|---|---------|--------|-------|
| F-01 | One-Click Room Creation | S1 | Room Mgmt |
| F-02 | 6-Digit Room Code | S1 | Room Mgmt |
| F-03 | Shareable Room URL | S1 | Room Mgmt |
| F-04 | QR Code for Mobile Entry | S4 | Room Mgmt |
| F-05 | Join by Code | S4 | Room Mgmt |
| F-06 | Join by URL (Auto-Entry) | S4 | Room Mgmt |
| F-07 | Room Expiry | S1 | Room Mgmt |
| F-08 | Automatic P2P Connection | S2 | WebRTC |
| F-09 | STUN-Based NAT Traversal | S2 | WebRTC |
| F-10 | TURN Relay Fallback | S6 | WebRTC |
| F-11 | Trickle ICE | S2 | WebRTC |
| F-12 | Connection Status Display | S2 | WebRTC |
| F-13 | Drag-and-Drop File Selection | S3 | Transfer |
| F-14 | File Preview Before Transfer | S3 | Transfer |
| F-15 | Chunked File Transfer | S3 | Transfer |
| F-16 | Backpressure Management | S3 | Transfer |
| F-17 | Real-Time Progress Bar | S3 | Transfer |
| F-18 | Live Transfer Speed Meter | S3 | Transfer |
| F-19 | Estimated Time Remaining | S3 | Transfer |
| F-20 | Total Data Transferred Counter | S3 | Transfer |
| F-21 | Automatic File Download (Streaming-to-Disk) | S3+ | Transfer |
| F-22 | Zero Server File Storage | S1 | Privacy |
| F-23 | Mandatory DTLS Encryption | S2 | Privacy |
| F-24 | Password Protection (Room Entry) | S5 | Privacy |
| F-25 | End-to-End File Encryption | S5 | Privacy |
| F-26 | Password Never Sent to Server | S5 | Privacy |
| F-34 | Peer IP Disclosure Notice | S4/S6 | Privacy |
| F-27 | No Account Required | S1 | UX |
| F-28 | Clean Minimal UI | S3 | UX |
| F-29 | Transfer Cancel | S3 | UX |
| F-30 | Mobile-Responsive Design | S4 | UX |
| F-31 | Single-Command Deployment | S6 | Infra |
| F-32 | Environment-Based Config | S1 | Infra |
| F-33 | ICE Server Config Endpoint | S2/S6 | Infra |

---

## Document Cross-References

| For more on... | See document |
|----------------|-------------|
| Why these features exist (business case) | `BRD.md` |
| Formal requirements for each feature | `SRS.md` |
| Backend implementation of each feature | `backend-doc.md` |
| Frontend implementation of each feature | `frontend-doc.md` |
| Infrastructure features (F-31, F-32, F-33) | `deployment-doc.md` |
| AI agent execution guidance | `AGENTS.md` |
