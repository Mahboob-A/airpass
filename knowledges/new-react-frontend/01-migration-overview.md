# React Frontend Migration — Overview & Architecture Report

**Date:** 2026-03-13  
**Scope:** Migration from vanilla HTML/CSS/JS to React (Vite + Tailwind v4 + Zustand)

---

## 1. Project Structure Comparison

| Original (Vanilla) | New (React) | Notes |
|---|---|---|
| `index.html` | `src/pages/LandingPage.jsx` | Create room + Join room on one page |
| `room.html` | `src/pages/RoomPage.jsx` | Unified sender/receiver in one page |
| `join.html` | **MISSING** | No separate join page — see §3.1 |
| `js/signaling.js` | `src/core/signaling.js` | ✅ Faithful port |
| `js/peer.js` | `src/core/peer.js` | ✅ Faithful port with improvements |
| `js/transfer.js` | `src/core/transfer.js` | ✅ Faithful port; download strategies included |
| `js/crypto.js` | `src/core/crypto.js` | ✅ Identical — no changes |
| `js/ui.js` | React components | DOM manipulation replaced by component state |
| `css/style.css` | `src/index.css` + Tailwind | Custom styles replaced by Tailwind utilities |
| — | `src/core/config.js` | **NEW** — Environment-aware origin detection |
| — | `src/store/index.js` | **NEW** — Zustand state management |
| — | `src/hooks/useTransferLogic.js` | **NEW** — Transfer orchestration hook |
| — | `src/components/ui/index.jsx` | **NEW** — Reusable UI primitives |
| — | `src/components/FileDropZone.jsx` | **NEW** — Drag-and-drop file selector |
| — | `src/components/TransferDashboard.jsx` | **NEW** — Transfer progress dashboard |
| — | `src/lib/format.js` | **NEW** — `formatBytes`, `formatTime` utilities |

---

## 2. Tech Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | React | 19.2.4 |
| Build Tool | Vite | 8.0.0 |
| Styling | Tailwind CSS v4 | 4.2.1 |
| State Management | Zustand | 5.0.11 |
| Routing | React Router DOM | 7.13.1 |
| Animation | Framer Motion | 12.36.0 |
| Icons | Lucide React | 0.577.0 |
| QR Codes | qrcode.react | 4.2.0 |
| ID Generation | uuid | 13.0.0 |
| Testing | Vitest + jsdom | latest |

---

## 3. Test Results

All **40 tests** pass across **5 test files**:

| File | Tests | Status |
|---|---|---|
| `dummy.test.js` | 1 | ✅ |
| `signaling.test.js` | 6 | ✅ |
| `peer.test.js` | 5 | ✅ |
| `transfer.test.js` | 10 | ✅ |
| `crypto.test.js` | 9 | ✅ |

> **Missing:** No React component tests. No tests for `useTransferLogic`, `LandingPage`, `RoomPage`, stores, or UI components.

---

## 4. Architectural Decisions

### 4.1 Good decisions
- **Core modules untouched.** `signaling.js`, `peer.js`, `transfer.js`, and `crypto.js` are near-verbatim copies of the spec, preserving all security and protocol logic.
- **Zustand for state.** Separating `useRoomStore` and `useTransferStore` prevents chunk-level re-renders from cascading to the entire room UI.
- **`config.js` for environment detection.** Cleanly handles dev (port 3000) vs production (same-origin) without hardcoded URLs.
- **StreamSaver.js** is loaded via CDN in `index.html` `<head>`, matching the spec exactly.
- **Pre-negotiated Control Channel** (`negotiated: true, id: 0`) matches the spec's recommendation for instant channel readiness.
- **`binaryType = 'arraybuffer'`** set on incoming transfer channels — important detail not in the original spec.

### 4.2 Design changes from spec
- **Single `RoomPage` for both sender and receiver** (vs separate `room.html` and `join.html`). This is a reasonable simplification for React SPA routing.
- **`window.confirm()` / `window.prompt()`** used instead of proper React modals for accept/reject/password. Functional but UX-poor.
- **Password passed as URL query parameter** (`?password=...`). See security issue below.

---

## 5. Summary

The migration is **structurally sound** — core WebRTC, transfer, and crypto logic is preserved. The main gaps are in the **React layer**: routing, cleanup, state field mismatches, and several code-level bugs detailed in the next report.
