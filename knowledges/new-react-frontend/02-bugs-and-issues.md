# React Frontend Migration — Bugs & Issues

**Priority Scale:** 🔴 Critical | 🟡 Medium | 🟢 Low

**Status:** ✅ = Fixed | ⚠️ = Partially Fixed | ❌ = Still Needs Work

---

## 🔴 Critical Issues

### BUG-01: Missing `/join/:code` Route — Receiver Can't Join ✅ FIXED

**File:** `App.jsx` (line 10)

**Previous Issue:** When the initiator creates a room, the backend returns a `code`. The URL becomes `/room/new?action=create`, but the `code` in `useParams()` is literally `"new"`. If the user refreshes, the page reconnects with `code = "new"` and `action = "create"`, creating a *new* room.

**Fix Applied:** After `room-created` event, use React Router's `navigate()` to update the URL to `/room/${msg.code}` with `replace: true`.

---

### BUG-02: `RoomPage` Cleanup References Non-existent Property ✅ FIXED

**File:** `RoomPage.jsx` (line 133)

**Previous Issue:** Code referenced `signalingClient.ws.close()` but `SignalingClient` stores the WebSocket as `this._ws` (private).

**Fix Applied:** Uses `signalingClient?.close()` which is the public API.

---

### BUG-03: `TransferDashboard` References Wrong `progressStats` Fields ✅ FIXED

**File:** `TransferDashboard.jsx` (line 98)

**Previous Issue:** Referenced `transfer.progressStats.eta` and `transfer.progressStats.speed` which don't exist.

**Fix Applied:** Uses correct field names `transfer.progressStats.humanEta` and `transfer.progressStats.humanSpeed`.

---

### BUG-04 & BUG-09: Stale State in handleBinaryChunk ✅ FIXED

**File:** `useTransferLogic.js` (lines 124–162)

**Previous Issue:** 
1. The `writer` branch recalculated `state.chunksReceived + 1` inside a while loop without actually updating state between iterations.
2. The `else` (blob fallback) branch had the same stale state issue.

**Fix Applied:** Both branches now use local cumulative variables (`cumulativeBytes`, `cumulativeChunks`, `cumulativeSamples`) that are properly accumulated within the loop.

---

## 🟡 Medium Issues

### BUG-05: Password Exposed in URL Query Parameters ✅ FIXED

**File:** `LandingPage.jsx`, `RoomPage.jsx`, `store/index.js`

**Previous Issue:** Password was passed in URL query parameters, exposing it in browser history.

**Fix Applied:** 
- Create room: Password stored in Zustand via `setPassword()` before navigation
- Join room: Password prompted via `window.prompt()` and sent via WebSocket verification

---

### BUG-06: `useTransferLogic` Accesses Private `_pc` Property ✅ FIXED

**File:** `useTransferLogic.js` (line 224)

**Previous Issue:** Code accessed `peerConn._pc.iceConnectionState` which is a private property.

**Fix Applied:** `PeerConnection` now has a public `iceConnectionState` getter:
```js
get iceConnectionState() {
    return this._pc?.iceConnectionState ?? 'new';
}
```

---

### BUG-07: `cn()` Utility Duplicated ✅ FIXED

**File:** `src/lib/utils.js`, `src/components/ui/index.jsx`

**Previous Issue:** Components imported `cn` from different locations with different implementations.

**Fix Applied:** `lib/utils.js` now uses `twMerge(clsx(...))` implementation. All components import from `lib/utils`.

---

### BUG-08: `useRoomStore.joinCode` Used for Both Room Code and Password ✅ FIXED

**File:** `useTransferLogic.js` (line 8)

**Previous Issue:** `joinCode` was aliased as `roomPassword` causing confusion.

**Fix Applied:** The alias has been removed. Password handling is separate from room code.

---

### BUG-09: Stale State in handleBinaryChunk Writer Branch ✅ FIXED

*(See BUG-04 above — fixed together)*

---

## 🟢 Low Issues

### BUG-10: `selectDownloadStrategy` Warning Threshold Changed from Spec ⚠️ DOCUMENTED

**File:** `transfer.js` (line 287)

**Issue:** Spec uses 1 GB threshold, but React version uses 250 MB (more conservative).

**Decision:** Keep 250 MB threshold as it's safer. Documented as intentional deviation.

---

### BUG-11: `dummy.test.js` Should Be Removed ✅ FIXED

**Issue:** Dummy test file existed.

**Fix Applied:** File was removed during migration.

---

### BUG-12: No 404/Catch-All Route ✅ FIXED

**File:** `App.jsx`

**Fix Applied:** Added catch-all route:
```jsx
<Route path="*" element={<Navigate to="/" replace />} />
```

---

### BUG-13: `formatBytes` Duplicated in Two Files ✅ FIXED

**File:** `useTransferLogic.js`

**Previous Issue:** Local `formatBytes` function existed alongside the canonical version in `lib/format.js`.

**Fix Applied:** Removed local copy and imports from `lib/format.js`.

---

### BUG-14: RoomPage.jsx StrictMode Cleanup ✅ FIXED

**File:** `RoomPage.jsx`

**Issue:** React StrictMode could cause orphan WebSocket connections.

**Fix Applied:** Added `isCancelled` flag to prevent orphan socket creation after unmount.

---

## Summary

| Bug | Priority | Status |
|-----|----------|--------|
| BUG-01: Room URL navigation | 🔴 Critical | ✅ Fixed |
| BUG-02: WebSocket cleanup | 🔴 Critical | ✅ Fixed |
| BUG-03: Wrong progressStats fields | 🔴 Critical | ✅ Fixed |
| BUG-04 & BUG-09: Stale state | 🔴 Critical | ✅ Fixed |
| BUG-05: Password in URL | 🟡 Medium | ✅ Fixed |
| BUG-06: Private _pc access | 🟡 Medium | ✅ Fixed |
| BUG-07: Duplicate cn() | 🟡 Medium | ✅ Fixed |
| BUG-08: joinCode alias | 🟡 Medium | ✅ Fixed |
| BUG-10: Memory limit deviation | 🟢 Low | ⚠️ Documented |
| BUG-11: dummy.test.js | 🟢 Low | ✅ Fixed |
| BUG-12: No 404 route | 🟢 Low | ✅ Fixed |
| BUG-13: Duplicate formatBytes | 🟢 Low | ✅ Fixed |
| BUG-14: StrictMode cleanup | 🟢 Low | ✅ Fixed |

**All bugs have been addressed.** The codebase is now ready for testing.