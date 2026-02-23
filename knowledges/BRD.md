# BRD — Business Requirements Document
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Status:** Approved for Development  
**Owner:** Product  
**Last Updated:** 2026-02  

> **For AI Agents:** This is the entry-point business document. Read this first to understand *why* this project exists. For technical breakdown of *what* to build, proceed to `SRS.md`. For features detail, read `Project-Features.md`. For how to execute, read `AGENTS.md`.

---

## 1. Executive Summary

P2P Share is a browser-based, peer-to-peer file transfer application that allows two users to exchange files of any size directly between their browsers — without any file ever touching a server. The product's core differentiator is **privacy by architecture**: because files flow directly between browsers via WebRTC DataChannel, no server ever sees, stores, or logs file content. An optional password layer adds end-to-end AES-256-GCM encryption on top of the already-encrypted WebRTC transport.

The product is inspired by tools like `file.pizza`, `toffeeshare.com`, and `webwormhole.io`, but aims to be cleaner, more transparent, and deployable by anyone as a self-hosted instance.

---

## 2. Business Problem

### 2.1 The Privacy Problem with Existing File Sharing

The dominant file sharing paradigm (WeTransfer, Google Drive, Dropbox, email attachments) requires files to be uploaded to a centralized server first, then downloaded by the recipient. This creates multiple privacy and security risks:

- **Server-side storage:** Files are stored on third-party servers for hours or days. They can be subpoenaed, breached, or inspected.
- **Upload/download cost:** Users must upload a file, wait, then the recipient downloads it. The file traverses the internet twice and sits on a server in between.
- **Metadata exposure:** Even "encrypted" cloud services often have metadata access — who sent what to whom, when, file names, sizes.
- **Trust requirement:** Users must trust the service provider not to access their files. This is problematic for sensitive documents (legal, medical, personal).

### 2.2 The Gap Existing P2P Tools Don't Fill

Existing P2P browser tools (FilePizza, ToffeeShare, etc.) address some of these issues but fall short:
- Most require keeping browser tabs open and are not mobile-friendly
- None offer clean, copyable room codes or QR-code entry for mobile
- Transfer speed/progress metering is absent or poor
- None combine password-protected encryption with a clean UX
- Large file support is inconsistent (most crash above 500MB due to memory-based download)

### 2.3 The Opportunity

There is a clear market gap for a **privacy-first, open-source, self-hostable P2P file sharing tool** that is:
- Simple enough for non-technical users (room code, one click to join)
- Trustworthy by design (files never touch the server — verifiable from open source)
- Capable for power users (password encryption, any file size, live speed metrics)
- Deployable by organizations wanting full control (Docker + self-hosted TURN)

---

## 3. Stakeholders

| Role | Interest |
|------|----------|
| **End User (Sender)** | Share files privately without uploading to a third party |
| **End User (Receiver)** | Receive files without needing an account or installation |
| **Privacy-Conscious Individual** | Transfer sensitive files (legal, medical, personal) securely |
| **Developer / Self-Hoster** | Deploy a private instance for their organization or personal use |
| **Organization IT Admin** | Provide internal file sharing without cloud storage risk |

---

## 4. Business Goals

| Goal | Success Metric |
|------|---------------|
| **G1: Zero server-side file storage** | No byte of file content passes through or is stored on the signaling server |
| **G2: Accessible entry UX** | New user can send their first file within 60 seconds, no account required |
| **G3: Large file support** | Support files up to 10GB without browser memory crashes |
| **G4: End-to-end encrypted option** | Password-protected transfers use AES-256-GCM where the key never leaves the client |
| **G5: Self-hostable** | Full deployment via `docker compose up` with no external dependencies except a TURN server |
| **G6: Mobile compatible** | Core functionality works on Chrome for Android and Safari for iOS |

---

## 5. Business Constraints

| Constraint | Impact |
|-----------|--------|
| **No server-side file handling** | Architecture must be purely P2P for file data; server is signaling-only |
| **Browser-only client** | No native app or browser extension. Pure HTML/CSS/JS. |
| **No user accounts** | Anonymous usage. No login, no registration, no cookies tracking identity. |
| **Open source** | Codebase must be transparent and auditable. Privacy claims must be verifiable. |
| **TURN server required for ~15-20% of users** | App must work behind strict NATs; TURN relay is a required infrastructure cost |
| **Peer IP disclosure is inherent to P2P** | WebRTC direct connections require both peers to learn each other's IP addresses. This cannot be avoided without routing through a TURN relay (which defeats P2P for most users). The UI MUST display a clear disclosure notice. An opt-in TURN-only "relay mode" is offered for users who need full IP anonymity. See `Project-Features.md §F-34` and `SRS.md §3.2`. |
| **No database required** | Room state is ephemeral and in-memory only. LMDB, SQLite, Redis and similar persistence layers are explicitly out of scope. See `backend-doc.md §1.2` for the full decision rationale. |

---

## 6. Key Business Requirements

### BR-01: Privacy by Architecture
The signaling server MUST NOT receive, process, store, or log any file content. It processes only WebSocket signaling messages (SDP, ICE candidates, room management JSON). This must be verifiable from the source code.

### BR-02: No Registration
Users MUST be able to send and receive files without creating an account, entering an email, or installing any software. Entry points are a shareable URL and a 6-digit room code.

### BR-03: Optional Password Protection
Users who require additional confidentiality MUST be able to password-protect a transfer. The password MUST be used to derive an AES encryption key client-side. The password MUST NOT be transmitted to the server in any form (not even hashed, except for room-entry verification which uses a separate server-side bcrypt hash).

### BR-04: Universal Joinability
The receiver MUST be able to join a transfer session via:
1. Clicking a shareable URL
2. Entering a 6-digit room code on the home page
3. Scanning a QR code (generated by the sender)

### BR-05: Transparent Progress
Both sender and receiver MUST see real-time transfer progress: percentage complete, current transfer speed (MB/s), total data sent/received, and estimated time remaining.

### BR-06: Self-Hostability
The entire application MUST be deployable on a single VPS using Docker Compose. The deployment MUST NOT require any external cloud services except an optional TURN server (which can also be self-hosted with Coturn).

---

## 7. Out of Scope (Version 1.0)

The following are explicitly NOT in scope for the initial release:

- Multi-file transfers with folder structure preservation
- Resumable transfers (if connection drops, transfer restarts)
- Group transfers (more than 2 peers simultaneously)
- Native mobile applications
- Browser extension
- Peer-to-peer messaging / text chat
- Transfer history or logs
- Rate limiting / abuse prevention (left to reverse proxy layer)
- WebRTC audio/video (this is file-transfer only)

---

## 8. Competitive Landscape

| Tool | P2P | Password | QR Code | Large Files | Open Source | Self-Hostable |
|------|-----|----------|---------|-------------|-------------|---------------|
| WeTransfer | ❌ (server relay) | ❌ | ❌ | 2GB free | ❌ | ❌ |
| FilePizza | ✅ | ❌ | ❌ | ⚠️ memory limit | ✅ | ✅ |
| ToffeeShare | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ |
| Web Wormhole | ✅ | ❌ | ❌ | ✅ streaming | ✅ | ✅ |
| **P2P Share** | ✅ | ✅ | ✅ | ✅ streaming | ✅ | ✅ |

---

## 9. Assumptions

1. Both sender and receiver use a modern browser (Chrome 90+, Firefox 90+, Edge 90+, Safari 15+)
2. At least one party is not behind a symmetric NAT (required for direct P2P; otherwise TURN is used)
3. HTTPS is always used in production (required for WebRTC and Web Crypto API)
4. A TURN server is provisioned and configured before production deployment
5. Users accept that direct P2P connections expose IP addresses to the other peer. The product mitigates this with a clear UI disclosure notice (F-34) and an opt-in TURN-only relay mode — but does not eliminate it without the relay. For most file-sharing use cases (sharing with a known person), IP disclosure is acceptable.
6. Room state does not need to persist across server restarts. Rooms are ephemeral (max 30 minutes). No database is used. If the server restarts, open transfers fail and users create a new room. See `backend-doc.md §1.2` for the full LMDB/database decision.

---

## 10. Document Cross-References

| For more on... | See document |
|----------------|-------------|
| All features with descriptions | `Project-Features.md` |
| Technical requirements and architecture | `SRS.md` |
| How AI agents should work with all docs | `AGENTS.md` |
| Development approach and standards | `development-guideline.md` |
| Backend API design | `backend-doc.md` |
| Frontend implementation | `frontend-doc.md` |
| Deployment and infrastructure | `deployment-doc.md` |
