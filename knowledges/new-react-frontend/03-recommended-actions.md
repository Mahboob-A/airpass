# React Frontend Migration — Recommended Actions

Priority-ordered action items with implementation guidance.

---

## Phase 1: Fix Critical Bugs (Must-Do)

### 1.1 Fix WebSocket cleanup (BUG-02)
**File:** `src/pages/RoomPage.jsx` line 133  
**Change:** Replace `signalingClient.ws.close()` → `signalingClient.close()`
```diff
-if (signalingClient && signalingClient.ws) signalingClient.ws.close();
+signalingClient?.close();
```

### 1.2 Fix TransferDashboard field names (BUG-03)
**File:** `src/components/TransferDashboard.jsx` line 98  
```diff
-{formatTime(transfer.progressStats.eta)} left • {formatBytes(transfer.progressStats.speed)}/s
+{transfer.progressStats?.humanEta ?? '—'} left • {transfer.progressStats?.humanSpeed ?? '0 B/s'}
```

### 1.3 Fix room creation URL navigation (BUG-01)
**File:** `src/pages/RoomPage.jsx`  
After `room-created` event, update the URL to reflect the real code:
```diff
 signalingClient.on('room-created', (msg) => {
     setRoomInfo(msg.code, msg.url);
     setStatus('waiting');
+    navigate(`/room/${msg.code}`, { replace: true });
 
     pc = new PeerConnection(signalingClient, { role: 'initiator', iceConfig });
```

### 1.4 Fix stale state in binary chunk loop (BUG-04 & BUG-09)
**File:** `src/hooks/useTransferLogic.js` lines 124–162  
Track cumulative bytes/chunks with local variables inside the loop instead of reading from `state` each iteration.

---

## Phase 2: Security & Correctness (High Priority)

### 2.1 Remove password from URL (BUG-05)
**File:** `src/pages/LandingPage.jsx`, `src/store/index.js`  
Add `password` field to `useRoomStore`. Navigate without password in URL:
```diff
-let url = '/room/new?action=create';
-if (createPassword) url += `&password=${encodeURIComponent(createPassword)}`;
-navigate(url);
+useRoomStore.getState().setPassword(createPassword);
+navigate('/room/new?action=create');
```

### 2.2 Add public getter for ICE state (BUG-06)
**File:** `src/core/peer.js`  
```js
get iceConnectionState() {
    return this._pc?.iceConnectionState ?? 'new';
}
```

### 2.3 Replace `window.confirm`/`window.prompt` with React modals
**Files:** `src/hooks/useTransferLogic.js`, `src/pages/RoomPage.jsx`  
Create a modal component and use Zustand or ref-based state to handle confirmation. This improves UX and is consistent with the React architecture.

---

## Phase 3: Code Quality (Medium Priority)

### 3.1 Consolidate `cn()` utility (BUG-07)
Move the `twMerge(clsx(...))` version to `src/lib/utils.js`. Update all imports:
- `FileDropZone.jsx`
- `RoomPage.jsx`
- `ui/index.jsx`

### 3.2 Remove duplicate `formatBytes` (BUG-13)
Delete the local `formatBytes` function from `useTransferLogic.js`. Import from `lib/format.js`.

### 3.3 Add 404 catch-all route (BUG-12)
**File:** `App.jsx`
```jsx
import { Navigate } from 'react-router-dom';
// ...
<Route path="*" element={<Navigate to="/" replace />} />
```

### 3.4 Remove `dummy.test.js` (BUG-11)

### 3.5 Fix `joinCode`/`roomPassword` aliasing confusion (BUG-08)
Remove the confusing alias in `useTransferLogic.js` line 8.

---

## Phase 4: Testing & Polish (Lower Priority)

### 4.1 Add React component tests
Priority test targets:
1. `LandingPage` — form validation, navigation
2. `RoomPage` — connection lifecycle states
3. `useTransferLogic` — control message handling
4. `TransferDashboard` — progress rendering
5. `FileDropZone` — drag/drop events

### 4.2 Add Vite proxy config for local development
Instead of `config.js` origin detection, use Vite's built-in proxy:
```js
// vite.config.js
server: {
    port: 3000,
    proxy: {
        '/api': 'http://localhost:8000',
        '/ws': { target: 'ws://localhost:8000', ws: true },
    }
}
```
This eliminates the need for `BACKEND_ORIGIN` / `WS_ORIGIN` and makes all URLs relative (matching production behavior).

### 4.3 Add `StreamSaver/` service worker files
The `index.html` loads `StreamSaver.min.js` from CDN, but the `mitm.html` and `sw.js` files must be served from the same origin. These need to be placed in `frontend/public/StreamSaver/`.

---

## Summary of Effort

| Phase | Items | Est. Effort |
|---|---|---|
| Phase 1 — Critical | 4 bugs | ~1 hour |
| Phase 2 — Security | 3 items | ~2 hours |
| Phase 3 — Quality | 5 items | ~1 hour |
| Phase 4 — Testing | 3 items | ~4 hours |
| **Total** | **15 items** | **~8 hours** |
