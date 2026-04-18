# React Frontend Migration — Bugs & Issues

**Priority Scale:** 🔴 Critical | 🟡 Medium | 🟢 Low

---

## 🔴 Critical Issues

### BUG-01: Missing `/join/:code` Route — Receiver Can't Join

**File:** `App.jsx` (line 10)

The router only defines:
```jsx
<Route path="/" element={<LandingPage />} />
<Route path="/room/:code" element={<RoomPage />} />
```

But `LandingPage.handleJoinRoom()` navigates to `/room/${code}` which opens `RoomPage`. The problem is that `RoomPage` checks `searchParams.get('action')` — when joining, `action` is `null` (not `'create'`), so `isInitiator = false`. However, the `code` param is `'new'` when creating (`/room/new?action=create`) vs an actual code when joining (`/room/XYZABC`).

**The actual bug:** When the initiator creates a room, the backend returns a `code`. The URL becomes `/room/new?action=create`, but the `code` in `useParams()` is literally `"new"`. On the `room-created` event, `setRoomInfo(msg.code, msg.url)` sets the correct code in the store — but the URL still shows `/room/new`. If the user refreshes, the page reconnects with `code = "new"` and `action = "create"`, creating a *new* room.

**Fix:** After `room-created`, navigate to `/room/${msg.code}` to update the URL, or use a dedicated `/create` route.

---

### BUG-02: `RoomPage` Cleanup References Non-existent Property

**File:** `RoomPage.jsx` (line 133)

```js
if (signalingClient && signalingClient.ws) signalingClient.ws.close();
```

`SignalingClient` stores the WebSocket as `this._ws` (private), not `this.ws`. This cleanup code never actually closes the WebSocket.

**Fix:** Use `signalingClient.close()` which is the public API:
```js
signalingClient?.close();
```

---

### BUG-03: `TransferDashboard` References Wrong `progressStats` Fields

**File:** `TransferDashboard.jsx` (line 98)

```jsx
{formatTime(transfer.progressStats.eta)} left • {formatBytes(transfer.progressStats.speed)}/s
```

But `calculateProgress()` in `transfer.js` returns `{ humanSpeed, humanEta, etaSeconds, speedBps }` — there is no `.eta` or `.speed` field. This will render `undefined left • undefined/s`.

**Fix:** Use the correct field names:
```jsx
{transfer.progressStats.humanEta} left • {transfer.progressStats.humanSpeed}
```
Or use `etaSeconds`/`speedBps` with formatters:
```jsx
{formatTime(transfer.progressStats.etaSeconds)} left • {formatBytes(transfer.progressStats.speedBps)}/s
```

---

### BUG-04: `receiveChunk` Missing `totalChunks` from Return Value

**File:** `transfer.js` (lines 111–122)

The original spec's `receiveChunk` returns `{ index, received, isComplete }`. The React version returns only `{ index }`:
```js
return { index }
```

The `received` and `isComplete` fields are gone. The `handleBinaryChunk` in `useTransferLogic.js` manually counts chunks instead — but for the `writer` branch (lines 124–162), it recalculates `state.chunksReceived + 1` **inside a while loop** without actually updating state between iterations. The `state.chunksReceived` and `state.bytesReceived` will be stale during the loop, causing **incorrect progress tracking for out-of-order chunks**.

**Fix:** Either restore `received`/`isComplete` to `receiveChunk`, or fix the stale state issue by accumulating locally within the loop.

---

## 🟡 Medium Issues

### BUG-05: Password Exposed in URL Query Parameters

**File:** `LandingPage.jsx` (line 18)

```js
let url = '/room/new?action=create';
if (createPassword) url += `&password=${encodeURIComponent(createPassword)}`;
```

The password appears in the browser URL bar, browser history, and any analytics. The spec explicitly states: *"Password is never sent to the server (not even hashed)"*

**Fix:** Store the password in Zustand state and pass it via store, not URL params. The `RoomPage` already has access to the store.

---

### BUG-06: `useTransferLogic` Accesses Private `_pc` Property

**File:** `useTransferLogic.js` (line 224)

```js
if (!peerConn || (peerConn._pc.iceConnectionState !== 'connected' && ...))
```

This accesses the private `_pc` field of `PeerConnection`. If the class is refactored, this will break silently.

**Fix:** Add a public getter to `PeerConnection`:
```js
get iceConnectionState() {
    return this._pc?.iceConnectionState ?? 'new';
}
```

---

### BUG-07: `cn()` Utility Duplicated

- `src/lib/utils.js` — simple `filter(Boolean).join(' ')` version
- `src/components/ui/index.jsx` — full `twMerge(clsx(...))` version

Components import from different locations. `FileDropZone.jsx` uses `lib/utils` (no merge), `ui/index.jsx` uses `clsx + twMerge` (proper merge).

**Fix:** Delete `src/lib/utils.js` and import from `src/components/ui/index.jsx` everywhere. Or better: move `cn` to `lib/utils.js` with the `twMerge(clsx(...))` implementation and import it from there.

---

### BUG-08: `useRoomStore.joinCode` Used for Both Room Code and Password

**File:** `useTransferLogic.js` (line 8)

```js
const { peerConn, joinCode: roomPassword, ... } = useRoomStore();
```

`joinCode` in the store is set to `msg.code` (the 6-char room code), but it's aliased as `roomPassword`. This is never actually used since `password` is passed down as a function argument, but the naming confusion could cause bugs during maintenance.

**Fix:** Don't alias `joinCode` as `roomPassword`. If a password field is needed, add it to the store explicitly.

---

### BUG-09: Stale `state` in `handleBinaryChunk` Writer Branch

**File:** `useTransferLogic.js` (lines 124–162)

Inside the `while` loop, `state` is read once before the loop but modified throughout:
```js
const newBytesReceived = state.bytesReceived + rawChunk.byteLength;
...
const chunksReceived = state.chunksReceived + 1;
```

After the first iteration, `state.bytesReceived` and `state.chunksReceived` are still the original values. Each iteration adds the same base values plus one chunk, **not** cumulative values.

**Fix:** Track cumulative values locally:
```js
let cumulativeBytes = state.bytesReceived;
let cumulativeChunks = state.chunksReceived;

while (chunkStore[nextChunkToWrite]) {
    cumulativeBytes += rawChunk.byteLength;
    cumulativeChunks++;
    // ... use cumulativeBytes and cumulativeChunks
}
```

---

## 🟢 Low Issues

### BUG-10: `selectDownloadStrategy` Warning Threshold Changed from Spec

**File:** `transfer.js` (line 287)

The spec uses 1 GB as the warning threshold for Strategy 1 (Memory Blob). The React version uses 250 MB:
```js
const mbLimit = 250 * 1024 * 1024; // 250 MB
```

This is actually more conservative (arguably better), but it deviates from the spec. The warning message also differs from the spec's wording.

**Impact:** Low — more conservative is safer. But should be documented if intentional.

---

### BUG-11: `dummy.test.js` Should Be Removed

A test file that only asserts `true === true` doesn't provide value and adds noise to the test output.

---

### BUG-12: No 404/Catch-All Route

**File:** `App.jsx`

Invalid URLs render a blank page. Should add a catch-all route:
```jsx
<Route path="*" element={<Navigate to="/" />} />
```

---

### BUG-13: `formatBytes` Duplicated in Two Files

`formatBytes` exists in both:
- `src/lib/format.js`
- `src/hooks/useTransferLogic.js` (local function, line 308)

**Fix:** Remove the local copy from `useTransferLogic.js` and import from `lib/format.js`.
