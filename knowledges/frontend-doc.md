# frontend-doc.md — Frontend Implementation Mastery Guide
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Domain:** Frontend (Vanilla HTML/CSS/JS, WebRTC, Web Crypto API)  
**Role:** Mastery document — step-by-step implementation guide for the entire frontend.

> **For AI Agents:** This is the Layer 3 mastery document for the frontend. Before reading this, you must have read `BRD.md` (why), `SRS.md` (what and architecture), `Project-Features.md` (all 33 features), and `AGENTS.md` (orchestration). The backend signaling APIs this frontend calls are fully specified in `backend-doc.md`. For deployment context (serving static files, HTTPS), see `deployment-doc.md`. Follow section order — it matches sprint order.

---

## 1. Frontend Architecture Overview

### 1.1 Technology philosophy

The frontend is **vanilla HTML, CSS, and JavaScript** — no React, no Vue, no bundler. This is an intentional choice:

- **Auditable by anyone.** Users can view-source and verify no tracking code exists.
- **Zero build step.** Open `index.html` in a browser and it works.
- **Minimal attack surface.** No npm supply chain risk in user-facing code.
- **ES2020+ modules.** Each JS file is a native ES module (`type="module"`). Import/export works natively.

The only external dependency used at runtime is `qrcode.js` loaded from a CDN.

### 1.2 File responsibilities

| File | Single Responsibility |
|------|----------------------|
| `index.html` | Home page: create room button, code entry form |
| `room.html` | Sender view: room code display, QR code, file picker, progress |
| `join.html` | Receiver view: connecting, password entry, file accept/reject, progress |
| `js/signaling.js` | WebSocket lifecycle: connect, send, receive, reconnect, event emitter |
| `js/peer.js` | RTCPeerConnection: offer, answer, ICE, DataChannel creation and lifecycle |
| `js/transfer.js` | File chunking, backpressure, reassembly, progress math |
| `js/crypto.js` | PBKDF2 key derivation, AES-GCM encrypt/decrypt, salt generation |
| `js/ui.js` | All DOM manipulation, status updates, progress rendering, QR display |
| `css/style.css` | All styles — no framework, no utility classes |

> **For AI Agents:** The module boundary is strict. `peer.js` never touches the DOM. `transfer.js` never touches WebSocket. `crypto.js` has zero DOM or network dependencies. See `SRS.md §1.3`.

### 1.3 HTML file relationships

```
index.html
├── "Create Room" → POST to /api (create room) → redirect to room.html?roomId=xxx
└── "Join by code" → validate /api/room/{code} → redirect to join.html?code=xxx

room.html
├── Loads: signaling.js, peer.js, transfer.js, ui.js
├── Creates WebSocket (signaling.js)
├── Creates RTCPeerConnection when peer joins (peer.js)
└── Sends file chunks (transfer.js)

join.html
├── Loads: signaling.js, peer.js, transfer.js, crypto.js, ui.js
├── Joins WebSocket room (signaling.js)
├── Receives RTCPeerConnection connection (peer.js)
└── Receives file chunks, triggers download (transfer.js)
```

---

## 2. Project Setup (Sprint 2 Start)

### 2.1 Create directory structure

```bash
mkdir -p p2p-share/frontend/js
mkdir -p p2p-share/frontend/css

# Create all JS files as empty modules
touch p2p-share/frontend/js/signaling.js
touch p2p-share/frontend/js/peer.js
touch p2p-share/frontend/js/transfer.js
touch p2p-share/frontend/js/crypto.js
touch p2p-share/frontend/js/ui.js
touch p2p-share/frontend/css/style.css

# Initialize for testing only
cd p2p-share/frontend
npm init -y
npm install --save-dev vitest
```

### 2.2 `package.json` for testing

```json
{
  "name": "p2p-share-frontend",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "latest"
  }
}
```

### 2.3 `vitest.config.js`

```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',   // simulate browser environment
    globals: true,
  },
})
```

### 2.4 Development server

```bash
# From project root
cd p2p-share/frontend
python3 -m http.server 3000
# Access at http://localhost:3000
```

> **Note:** WebRTC and Web Crypto APIs require either `localhost` or HTTPS. Plain HTTP on a real hostname will fail. See `development-guideline.md §9.3` for HTTPS local dev setup.

---

## 3. Implementation: `js/signaling.js`

### 3.1 TDD — write tests first

Create `frontend/js/signaling.test.js`:

```javascript
/**
 * Tests for the SignalingClient WebSocket wrapper.
 * 
 * Uses mock WebSocket — no real server needed.
 * See SRS.md §4 for the message protocol being tested.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url
    this.readyState = 0  // CONNECTING
    this.sent = []
    MockWebSocket.instance = this
  }
  send(data) { this.sent.push(JSON.parse(data)) }
  close() { this.readyState = 3 }
  simulateOpen() {
    this.readyState = 1
    this.onopen?.()
  }
  simulateMessage(data) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
  simulateClose() {
    this.readyState = 3
    this.onclose?.({ code: 1000 })
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

describe('SignalingClient', () => {
  let client

  beforeEach(async () => {
    const { SignalingClient } = await import('./signaling.js')
    client = new SignalingClient('ws://localhost:8000/ws/test-room')
  })

  it('should connect to the provided URL', () => {
    expect(MockWebSocket.instance.url).toBe('ws://localhost:8000/ws/test-room')
  })

  it('should emit "open" when WebSocket connects', () => {
    const handler = vi.fn()
    client.on('open', handler)
    MockWebSocket.instance.simulateOpen()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('should send JSON-encoded messages', () => {
    MockWebSocket.instance.simulateOpen()
    client.send({ type: 'create-room' })
    expect(MockWebSocket.instance.sent).toContainEqual({ type: 'create-room' })
  })

  it('should emit typed events for incoming messages', () => {
    const handler = vi.fn()
    client.on('room-created', handler)
    MockWebSocket.instance.simulateOpen()
    MockWebSocket.instance.simulateMessage({
      type: 'room-created',
      roomId: 'abc',
      code: 'X7K2P9',
      url: 'https://example.com/join/X7K2P9'
    })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ code: 'X7K2P9' }))
  })

  it('should emit "signal" for signal messages with payload', () => {
    const handler = vi.fn()
    client.on('signal', handler)
    MockWebSocket.instance.simulateOpen()
    MockWebSocket.instance.simulateMessage({
      type: 'signal',
      payload: { type: 'offer', sdp: 'v=0...' }
    })
    expect(handler).toHaveBeenCalledWith({ type: 'offer', sdp: 'v=0...' })
  })

  it('should queue messages sent before connection is open', () => {
    // Send before open
    client.send({ type: 'create-room' })
    expect(MockWebSocket.instance.sent).toHaveLength(0)  // not sent yet
    MockWebSocket.instance.simulateOpen()
    expect(MockWebSocket.instance.sent).toHaveLength(1)  // flushed after open
  })

  it('should emit "close" when connection closes', () => {
    const handler = vi.fn()
    client.on('close', handler)
    MockWebSocket.instance.simulateOpen()
    MockWebSocket.instance.simulateClose()
    expect(handler).toHaveBeenCalledOnce()
  })
})
```

### 3.2 Implement `js/signaling.js`

```javascript
/**
 * WebSocket signaling client.
 *
 * Wraps the browser WebSocket API with:
 * - Typed event emission (one event per message type)
 * - Message queuing before connection is open
 * - Clean send/close API
 *
 * The server-side counterpart is backend-doc.md §6.
 * The message protocol is defined in SRS.md §4.
 *
 * @module signaling
 */

export class SignalingClient {
  /**
   * @param {string} url - WebSocket URL (e.g. wss://example.com/ws/room-id)
   */
  constructor(url) {
    this._handlers = new Map()   // type → [callback, ...]
    this._queue = []             // messages queued before open
    this._ws = null
    this._connect(url)
  }

  /**
   * Register an event handler.
   * Event names match message `type` values from SRS.md §4.
   * Special events: "open", "close", "error"
   *
   * @param {string} event - Message type or lifecycle event
   * @param {Function} handler - Callback function
   * @returns {this} for chaining
   */
  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, [])
    }
    this._handlers.get(event).push(handler)
    return this
  }

  /**
   * Remove an event handler.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const handlers = this._handlers.get(event) ?? []
    this._handlers.set(event, handlers.filter(h => h !== handler))
  }

  /**
   * Send a JSON message to the signaling server.
   * If the connection is not yet open, the message is queued.
   *
   * @param {object} data - Message object (must include `type` field)
   */
  send(data) {
    const serialized = JSON.stringify(data)
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(serialized)
    } else {
      this._queue.push(serialized)
    }
  }

  /**
   * Close the WebSocket connection cleanly.
   */
  close() {
    this._ws?.close(1000, 'Client closed')
  }

  // ── Private ─────────────────────────────────────────────

  _connect(url) {
    this._ws = new WebSocket(url)

    this._ws.onopen = () => {
      // Flush queued messages
      while (this._queue.length > 0) {
        this._ws.send(this._queue.shift())
      }
      this._emit('open')
    }

    this._ws.onmessage = (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        console.error('SignalingClient: received non-JSON message', event.data)
        return
      }

      const type = data.type
      if (!type) return

      // For signal messages, emit the payload directly (not the wrapper)
      if (type === 'signal') {
        this._emit('signal', data.payload)
      } else {
        this._emit(type, data)
      }
    }

    this._ws.onerror = (event) => {
      this._emit('error', event)
    }

    this._ws.onclose = (event) => {
      this._emit('close', event)
    }
  }

  _emit(event, data) {
    const handlers = this._handlers.get(event) ?? []
    handlers.forEach(handler => {
      try {
        handler(data)
      } catch (err) {
        console.error(`SignalingClient: error in "${event}" handler:`, err)
      }
    })
  }
}

/**
 * Create a signaling client connected to the backend.
 *
 * @param {string} roomId - The room UUID (for /ws/{roomId} endpoint)
 * @returns {SignalingClient}
 */
export function createSignalingClient(roomId) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${location.host}/ws/${roomId}`
  return new SignalingClient(url)
}
```

---

## 4. Implementation: `js/peer.js`

### 4.1 TDD — write tests first

Create `frontend/js/peer.test.js`:

```javascript
/**
 * Tests for WebRTC peer connection management.
 * 
 * RTCPeerConnection is mocked since it's not available in jsdom.
 * Tests focus on the orchestration logic: offer/answer flow,
 * ICE candidate handling, and DataChannel lifecycle.
 * 
 * See SRS.md §2.2 for WebRTC signaling requirements.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock RTCPeerConnection
class MockRTCPeerConnection {
  constructor(config) {
    this.config = config
    this.localDescription = null
    this.remoteDescription = null
    this._channels = {}
    this.iceConnectionState = 'new'
    MockRTCPeerConnection.instance = this
  }
  async createOffer() { return { type: 'offer', sdp: 'mock-sdp' } }
  async createAnswer() { return { type: 'answer', sdp: 'mock-answer-sdp' } }
  async setLocalDescription(desc) { this.localDescription = desc }
  async setRemoteDescription(desc) { this.remoteDescription = desc }
  async addIceCandidate(c) { this._lastCandidate = c }
  createDataChannel(label, opts) {
    const ch = { label, opts, readyState: 'connecting', send: vi.fn() }
    this._channels[label] = ch
    return ch
  }
  close() { this.closed = true }
}

vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)

describe('PeerConnection - Initiator (Sender)', () => {
  let mockSignaling, peerConn

  beforeEach(async () => {
    mockSignaling = { send: vi.fn(), on: vi.fn() }
    const { PeerConnection } = await import('./peer.js')
    peerConn = new PeerConnection(mockSignaling, { role: 'sender' })
  })

  it('should create RTCPeerConnection with ICE config', () => {
    expect(MockRTCPeerConnection.instance).toBeDefined()
    expect(MockRTCPeerConnection.instance.config).toHaveProperty('iceServers')
  })

  it('should create a DataChannel named "file-transfer"', () => {
    const ch = MockRTCPeerConnection.instance._channels['file-transfer']
    expect(ch).toBeDefined()
  })

  it('should send offer via signaling when createOffer is called', async () => {
    await peerConn.createOffer()
    expect(mockSignaling.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'signal', payload: expect.objectContaining({ type: 'offer' }) })
    )
  })

  it('should set remote description when answer is received', async () => {
    await peerConn.createOffer()
    await peerConn.handleSignal({ type: 'answer', sdp: 'mock-answer' })
    expect(MockRTCPeerConnection.instance.remoteDescription).toEqual(
      expect.objectContaining({ type: 'answer' })
    )
  })

  it('should queue ICE candidates received before remote description', async () => {
    const candidate = { candidate: 'candidate:...', sdpMid: '0' }
    // Receive candidate BEFORE setRemoteDescription
    await peerConn.handleSignal({ type: 'candidate', candidate })
    // Should be queued, not immediately added
    expect(MockRTCPeerConnection.instance._lastCandidate).toBeUndefined()
    // After setting remote description, queue should flush
    await peerConn.handleSignal({ type: 'answer', sdp: 'mock-answer' })
    expect(MockRTCPeerConnection.instance._lastCandidate).toEqual(candidate)
  })
})
```

### 4.2 Implement `js/peer.js`

```javascript
/**
 * WebRTC PeerConnection manager.
 *
 * Handles the complete WebRTC lifecycle for both sender and receiver:
 * - RTCPeerConnection creation with ICE server config
 * - SDP offer/answer exchange via the signaling channel
 * - ICE candidate gathering and relay (Trickle ICE)
 * - ICE candidate queuing (candidates may arrive before setRemoteDescription)
 * - DataChannel creation (sender) and reception (receiver)
 *
 * ICE config is fetched from /api/ice-config (never hardcoded).
 * See backend-doc.md §6.2 (/api/ice-config endpoint).
 * See SRS.md §2.2 for signaling requirements.
 * See frontend-doc.md §4 for implementation rationale.
 *
 * @module peer
 */

const CONTROL_CHANNEL_LABEL = 'p2p-control'

export class PeerConnection {
  /**
   * @param {import('./signaling.js').SignalingClient} signaling
   * @param {{ role: 'initiator' | 'responder', iceConfig?: object }} options
   */
  constructor(signaling, { role, iceConfig = null }) {
    this._signaling = signaling
    this._role = role
    this._pc = null
    this._controlChannel = null
    this._remoteDescriptionSet = false
    this._iceCandidateQueue = []    // Queue for candidates arriving early

    // Callbacks — set by the caller (room.js orchestration)
    this.onControlChannelOpen = null         // () => void
    this.onControlMessage = null             // (event) => void
    this.onTransferChannelOpen = null        // (transferId, channel) => void
    this.onConnectionStateChange = null      // (state: string) => void

    this._init(iceConfig)
  }

  // ── Public API ───────────────────────────────────────────

  /**
   * Fetch ICE config from server and initialize the RTCPeerConnection.
   * Must be called before createOffer() or before handling an incoming offer.
   *
   * @param {object|null} iceConfig - Pre-fetched config, or null to fetch now
   */
  async _init(iceConfig = null) {
    if (!iceConfig) {
      iceConfig = await fetchIceConfig()
    }

    this._pc = new RTCPeerConnection(iceConfig)

    // CRITICAL: Both peers independently allocate the Control Channel.
    // Using `negotiated: true, id: 0` guarantees the channel is ready on both
    // ends instantly, bypassing the `ondatachannel` listener race conditions.
    this._controlChannel = this._pc.createDataChannel(CONTROL_CHANNEL_LABEL, {
      ordered: true,
      negotiated: true,
      id: 0
    })
    this._setupControlChannelHandlers(this._controlChannel)

    // Listen for new dynamic DataChannels (used strictly for individual file chunks)
    // Backpressure for concurrent channels relies on the browser's SCTP stack 
    // respecting the `bufferedAmountLowThreshold` on each channel.
    this._pc.ondatachannel = (event) => {
      const transferId = event.channel.label
      this.onTransferChannelOpen?.(transferId, event.channel)
    }

    // Trickle ICE: send candidates as they are discovered
    // See SRS.md §FR-06 and HPBN study guide for why Trickle ICE matters
    this._pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._signaling.send({
          type: 'signal',
          payload: { type: 'candidate', candidate: event.candidate }
        })
      }
    }

    // Connection state monitoring
    this._pc.oniceconnectionstatechange = () => {
      const state = this._pc.iceConnectionState
      this.onConnectionStateChange?.(state)
      if (state === 'failed') {
        this._attemptIceRestart()
      }
    }
  }

  /**
   * Create and send an SDP offer (called by sender after peer joins).
   * Sets local description and sends offer via signaling channel.
   */
  async createOffer() {
    const offer = await this._pc.createOffer()
    await this._pc.setLocalDescription(offer)
    this._signaling.send({
      type: 'signal',
      payload: { type: 'offer', sdp: offer.sdp }
    })
  }

  /**
   * Handle an incoming signal from the other peer.
   * Routes to the appropriate handler based on signal type.
   *
   * CRITICAL: ICE candidates that arrive before setRemoteDescription
   * must be queued and flushed afterward. This is a common bug source.
   * See AGENTS.md §7 troubleshooting guide.
   *
   * @param {object} payload - The signal payload (offer, answer, or candidate)
   */
  async handleSignal(payload) {
    if (payload.type === 'offer') {
      await this._handleOffer(payload)
    } else if (payload.type === 'answer') {
      await this._handleAnswer(payload)
    } else if (payload.type === 'candidate') {
      await this._handleIceCandidate(payload.candidate)
    }
  }

  /**
   * Get the DataChannel. Returns null if not yet open.
   * @returns {RTCDataChannel|null}
   */
  get dataChannel() {
    return this._dataChannel
  }

  /**
   * Close the peer connection and data channel.
   */
  close() {
    this._dataChannel?.close()
    this._pc?.close()
  }

  // ── Private handlers ─────────────────────────────────────

  async _handleOffer(payload) {
    await this._pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
    this._remoteDescriptionSet = true
    await this._flushIceCandidateQueue()

    const answer = await this._pc.createAnswer()
    await this._pc.setLocalDescription(answer)
    this._signaling.send({
      type: 'signal',
      payload: { type: 'answer', sdp: answer.sdp }
    })
  }

  async _handleAnswer(payload) {
    await this._pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
    this._remoteDescriptionSet = true
    await this._flushIceCandidateQueue()
  }

  async _handleIceCandidate(candidate) {
    if (!this._remoteDescriptionSet) {
      // Queue the candidate — remote description not set yet
      // This is the correct handling per WebRTC spec
      this._iceCandidateQueue.push(candidate)
      return
    }
    try {
      await this._pc.addIceCandidate(candidate)
    } catch (err) {
      // Benign: can happen when connection is already established
      console.debug('PeerConnection: addIceCandidate error (usually benign):', err)
    }
  }

  async _flushIceCandidateQueue() {
    while (this._iceCandidateQueue.length > 0) {
      const candidate = this._iceCandidateQueue.shift()
      try {
        await this._pc.addIceCandidate(candidate)
      } catch (err) {
        console.debug('PeerConnection: flushing candidate error:', err)
      }
    }
  }

  _setupDataChannelHandlers(channel) {
    channel.onopen = () => {
      this.onDataChannelOpen?.()
    }
    channel.onmessage = (event) => {
      this.onDataChannelMessage?.(event)
    }
    channel.onerror = (event) => {
      console.error('DataChannel error:', event)
    }
    channel.onclose = () => {
      console.debug('DataChannel closed')
    }
  }

  _attemptIceRestart() {
    console.warn('ICE connection failed — attempting ICE restart')
    // ICE restart re-initiates ICE gathering with new credentials
    this._pc.restartIce()
    this.createOffer()
  }
}

/**
 * Fetch the ICE server configuration from the backend.
 * TURN credentials are provisioned server-side — never hardcoded here.
 *
 * @returns {Promise<RTCConfiguration>}
 */
export async function fetchIceConfig() {
  try {
    const resp = await fetch('/api/ice-config')
    if (!resp.ok) throw new Error(`ICE config fetch failed: ${resp.status}`)
    return await resp.json()
  } catch (err) {
    console.warn('Could not fetch ICE config, using STUN-only fallback:', err)
    // Fallback: STUN only. TURN will not work. ~15-20% of users may fail.
    return {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    }
  }
}
```

---

## 5. Implementation: `js/transfer.js`

### 5.1 TDD — write tests first

Create `frontend/js/transfer.test.js`:

```javascript
/**
 * Tests for file chunking, reassembly, and progress calculation.
 * 
 * This is the most complex frontend module. Every public function
 * must have tests. Coverage requirement: 90%.
 * See SRS.md §2.3 FR-07 through FR-10 for requirements.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chunkFile, reassembleChunks, calculateProgress, CHUNK_SIZE } from './transfer.js'

describe('chunkFile', () => {
  it('should return correct number of chunks for exact multiple', async () => {
    const file = new File([new Uint8Array(CHUNK_SIZE * 3)], 'test.bin')
    const chunks = await chunkFile(file)
    expect(chunks).toHaveLength(3)
  })

  it('should return correct number of chunks with remainder', async () => {
    const file = new File([new Uint8Array(CHUNK_SIZE + 100)], 'test.bin')
    const chunks = await chunkFile(file)
    expect(chunks).toHaveLength(2)
  })

  it('should handle small files (less than one chunk)', async () => {
    const file = new File([new Uint8Array(1000)], 'tiny.bin')
    const chunks = await chunkFile(file)
    expect(chunks).toHaveLength(1)
  })

  it('should produce ArrayBuffer chunks', async () => {
    const file = new File([new Uint8Array(100)], 'test.bin')
    const chunks = await chunkFile(file)
    expect(chunks[0]).toBeInstanceOf(ArrayBuffer)
  })

  it('should preserve all bytes (lossless chunking)', async () => {
    const data = new Uint8Array(1000).map((_, i) => i % 256)
    const file = new File([data], 'test.bin')
    const chunks = await chunkFile(file)
    const reassembled = new Uint8Array(await reassembleChunks(chunks, chunks.length))
    for (let i = 0; i < data.length; i++) {
      expect(reassembled[i]).toBe(data[i])
    }
  })
})

describe('reassembleChunks', () => {
  it('should produce a Blob from chunk array', async () => {
    const chunks = [new ArrayBuffer(100), new ArrayBuffer(100)]
    const blob = await reassembleChunks(chunks, 2)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBe(200)
  })
})

describe('calculateProgress', () => {
  it('should return 0% at start', () => {
    const p = calculateProgress(0, 1000, Date.now() - 1000, [])
    expect(p.percent).toBe(0)
  })

  it('should return 100% when all bytes received', () => {
    const p = calculateProgress(1000, 1000, Date.now() - 1000, [])
    expect(p.percent).toBe(100)
  })

  it('should calculate speed in bytes per second', () => {
    const startTime = Date.now() - 2000  // 2 seconds ago
    const speedSamples = [{ bytes: 500000, time: Date.now() - 1000 }]
    const p = calculateProgress(1000000, 5000000, startTime, speedSamples)
    // Speed should be approximately 500 KB/s
    expect(p.speedBps).toBeGreaterThan(400000)
    expect(p.speedBps).toBeLessThan(600000)
  })

  it('should estimate time remaining', () => {
    const p = calculateProgress(500000, 1000000, Date.now() - 1000, [
      { bytes: 500000, time: Date.now() - 1000 }
    ])
    // 500KB done, 500KB remaining at 500KB/s ≈ 1 second
    expect(p.etaSeconds).toBeGreaterThan(0)
    expect(p.etaSeconds).toBeLessThan(5)
  })
})
```

### 5.2 Implement `js/transfer.js`

```javascript
/**
 * File transfer: chunking, sending, receiving, reassembly.
 *
 * Handles all aspects of the file data flow over the WebRTC DataChannel.
 * This module has ZERO dependencies on DOM, WebSocket, or crypto.
 * It is a pure data-processing module, making it fully testable.
 *
 * Key responsibilities:
 * - Split File objects into 64KB ArrayBuffer chunks
 * - Send chunks with backpressure (bufferedAmount monitoring)
 * - Receive and index chunks by sequence number
 * - Reassemble chunks into a Blob for download
 * - Calculate real-time progress metrics
 *
 * See SRS.md §FR-08 to FR-10 for requirements.
 * See AGENTS.md §7 for backpressure troubleshooting.
 *
 * @module transfer
 */

/** Chunk size: 64KB. Recommended max for WebRTC DataChannel. */
export const CHUNK_SIZE = 65536

/** Pause sending when buffer exceeds this threshold (16MB) */
const BUFFER_HIGH_THRESHOLD = 16 * 1024 * 1024

/** Resume sending when buffer drops below this threshold (1MB) */
const BUFFER_LOW_THRESHOLD = 1 * 1024 * 1024

/**
 * Split a File into an array of ArrayBuffer chunks.
 *
 * @param {File} file
 * @returns {Promise<ArrayBuffer[]>}
 */
export async function chunkFile(file) {
  const chunks = []
  let offset = 0

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE)
    const buffer = await slice.arrayBuffer()
    chunks.push(buffer)
    offset += CHUNK_SIZE
  }

  return chunks
}

/**
 * Reassemble an ordered array of ArrayBuffer chunks into a Blob.
 *
 * @param {ArrayBuffer[]} chunks - Ordered array indexed from 0
 * @param {number} totalChunks - Expected total (for validation)
 * @param {string} mimeType - MIME type for the resulting Blob
 * @returns {Promise<Blob>}
 */
export async function reassembleChunks(chunks, totalChunks, mimeType = 'application/octet-stream') {
  if (chunks.length !== totalChunks) {
    throw new Error(`Expected ${totalChunks} chunks, got ${chunks.length}`)
  }
  return new Blob(chunks, { type: mimeType })
}

/**
 * Send a file over a WebRTC DataChannel with backpressure management.
 *
 * CRITICAL: Without backpressure, the browser can run out of memory
 * on large files. This function pauses sending when the DataChannel
 * send buffer is full and resumes when it drains.
 *
 * @param {RTCDataChannel} channel - Open DataChannel
 * @param {File} file - File to send
 * @param {object} options
 * @param {Function} options.onProgress - (bytesent, totalBytes) => void
 * @param {Function} [options.encryptChunk] - Optional: (ArrayBuffer, index) => Promise<ArrayBuffer>
 * @param {Function} options.onCancel - Returns true if transfer was cancelled
 * @returns {Promise<void>}
 */
export async function sendFile(channel, file, { onProgress, encryptChunk, onCancel }) {
  const chunks = await chunkFile(file)
  const totalChunks = chunks.length
  let bytesSent = 0

  // Set the low-water mark for backpressure
  channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD

  for (let i = 0; i < chunks.length; i++) {
    if (onCancel?.()) return

    let chunk = chunks[i]

    // Encrypt if a crypto function was provided
    if (encryptChunk) {
      chunk = await encryptChunk(chunk, i)
    }

    // Prepend 4-byte chunk index (Uint32, big-endian)
    const indexed = prependChunkIndex(chunk, i)

    // Backpressure: wait if buffer is too full
    if (channel.bufferedAmount > BUFFER_HIGH_THRESHOLD) {
      await waitForBufferDrain(channel)
    }

    channel.send(indexed)
    bytesSent += file.size * (1 / totalChunks)  // approximate
    onProgress?.(Math.min(bytesSent, file.size), file.size)
  }
}

/**
 * Receive a file chunk message and store it.
 *
 * Call this from DataChannel.onmessage for binary messages.
 * Returns progress info after each chunk.
 *
 * @param {ArrayBuffer} data - Raw DataChannel message data
 * @param {ArrayBuffer[]} chunkStore - Mutable array to accumulate chunks
 * @param {object} options
 * @param {Function} [options.decryptChunk] - Optional: (ArrayBuffer, index) => Promise<ArrayBuffer>
 * @returns {Promise<{ index: number, isComplete: boolean }>}
 */
export async function receiveChunk(data, chunkStore, { totalChunks, decryptChunk }) {
  const { index, payload } = extractChunkIndex(data)

  let chunk = payload
  if (decryptChunk) {
    chunk = await decryptChunk(payload, index)
  }

  chunkStore[index] = chunk

  const received = chunkStore.filter(Boolean).length
  return {
    index,
    received,
    isComplete: received === totalChunks,
  }
}

/**
 * Calculate real-time transfer progress metrics.
 *
 * @param {number} bytesTransferred - Total bytes transferred so far
 * @param {number} totalBytes - Total file size in bytes
 * @param {number} startTime - Transfer start timestamp (Date.now())
 * @param {Array<{bytes: number, time: number}>} speedSamples - Rolling window samples
 * @returns {{ percent: number, speedBps: number, etaSeconds: number, humanSpeed: string }}
 */
export function calculateProgress(bytesTransferred, totalBytes, startTime, speedSamples) {
  const percent = totalBytes === 0 ? 0 : Math.min(100, (bytesTransferred / totalBytes) * 100)

  // Calculate speed from rolling window (last 1 second)
  const now = Date.now()
  const windowMs = 1000
  const recentSamples = speedSamples.filter(s => now - s.time < windowMs)
  const windowBytes = recentSamples.reduce((sum, s) => sum + s.bytes, 0)
  const speedBps = windowBytes  // bytes per second (window is 1s)

  // ETA calculation
  const remaining = totalBytes - bytesTransferred
  const etaSeconds = speedBps > 0 ? remaining / speedBps : Infinity

  return {
    percent: Math.round(percent * 10) / 10,
    speedBps,
    etaSeconds,
    humanSpeed: formatSpeed(speedBps),
    humanEta: formatEta(etaSeconds),
  }
}

### 4.7 — Large File Download: Three-Strategy Cascade

> **This is the most architecturally significant frontend decision.** Read before implementing `join.html`. See `SRS.md §FR-09` for the formal requirement and `SRS.md §NFR-3.1` for the 10GB target.

**The core problem:** The browser has no native API to "save a file chunk by chunk as it arrives." You must choose an approach that fits memory, compatibility, and UX constraints.

#### Strategy priority (fixed — do not change this order)

```
Always try first  →  Strategy 3: Service Worker / StreamSaver.js
  If S3 fails     →  Strategy 2: showSaveFilePicker (Chrome/Edge only, skip Firefox)
  If S2 fails     →  Strategy 1: Memory Blob + user warning UI
```

**Strategy 3 is the unconditional default for ALL browsers in production.** It is not "a Chrome thing" or "an advanced option." StreamSaver.js works on Chrome, Firefox, Edge, and Safari 15+. It must be loaded via CDN in `join.html` — if it loads successfully, it is always used.

| Strategy | RAM usage | Disk copies | Browser support | What happens if it fails |
|----------|-----------|-------------|-----------------|--------------------------|
| **3: Service Worker / StreamSaver.js** | None ✅ | 1 ✅ | All browsers ✅ | Falls back to Strategy 2 |
| **2: showSaveFilePicker** | None ✅ | 1 ✅ | Chrome/Edge only ⚠️ (skipped on Firefox — see below) | Falls back to Strategy 1 |
| **1: Memory Blob** | Full file in RAM 🔴 | 1 | All browsers ✅ | Shows user warning — hard cap ~1GB |

**Why Strategy 2 is skipped on Firefox:** Firefox has `showSaveFilePicker` in the API surface but its implementation silently falls back to accumulating the file in browser memory — no error is thrown, no warning is given. The user believes streaming is happening but RAM is filling up. This is a worse outcome than Strategy 1 which at least shows a warning. Strategy 2 is therefore explicitly blocked on Firefox user agents.

**Why OPFS is not a strategy:** OPFS stores the full file in the browser's sandboxed private storage first, then the user downloads from there — two full copies of the file on disk at the same time. Unacceptable for users with limited storage on large files.

**Sprint 3 MVP note:** StreamSaver.js must be added to `join.html` from Sprint 3 onwards. There is no "upgrade later" path — Strategy 3 must be the default from the first working build.

#### User-facing warning when Strategy 1 is reached

When Strategy 3 and Strategy 2 both fail (i.e., StreamSaver.js is not loaded AND the browser is Firefox or `showSaveFilePicker` is absent), the UI MUST show a visible, non-dismissible banner:

```
⚠️  Your browser doesn't support memory-efficient file downloads.
    Files larger than 1 GB may fail or crash your browser tab.
    For large file transfers, please use Chrome.
    You can continue — files under 1 GB should transfer fine.
```

This message is rendered by `ui.js showBrowserWarning()` — see §7. It appears before the transfer begins so the user can choose to switch browsers.

#### Setup required for Strategy 3

Before Strategy 3 will activate, these three things must be in place:

```html
<!-- 1. Add to join.html <head> — load StreamSaver from CDN -->
<script src="https://cdn.jsdelivr.net/npm/streamsaver@2.0.6/StreamSaver.min.js"></script>
```

```bash
# 2. Copy the Service Worker files into frontend/
# Download from: https://github.com/jimmywarting/StreamSaver.js/tree/master/
cp mitm.html frontend/StreamSaver/mitm.html
cp sw.js     frontend/StreamSaver/sw.js
```

```javascript
// 3. In selectDownloadStrategy(), configure the mitm path (already in code below)
streamSaver.mitm = '/StreamSaver/mitm.html'
```

The Service Worker (`sw.js`) must be served from the same origin as the app. Nginx serves the `frontend/` directory statically — no additional backend config is needed. See `deployment-doc.md §3.1`.

#### Implementation code

```javascript
/**
 * STRATEGY 3 — Service Worker streaming (PRODUCTION DEFAULT — always try first)
 *
 * Pipes DataChannel chunks through a ReadableStream served by a Service Worker.
 * The browser's native download manager writes each chunk directly to disk as it
 * arrives — no RAM accumulation, no intermediate disk copy, no file size limit.
 *
 * Works on: Chrome, Firefox, Edge, Safari 15+.
 * Requires: StreamSaver.js CDN script + mitm.html + sw.js in frontend/StreamSaver/
 *
 * USAGE (in join.html chunk receive loop):
 *   const writer = createServiceWorkerStream(filename, totalBytes)
 *   // per chunk: await writer.write(new Uint8Array(decryptedChunk))
 *   // on complete: await writer.close()
 *   // on cancel:  writer.abort()
 *
 * @param {string} filename
 * @param {number} totalBytes - Total file size in bytes (used for download progress)
 * @returns {WritableStreamDefaultWriter | null} null if StreamSaver.js not loaded
 */
export function createServiceWorkerStream(filename, totalBytes) {
  if (typeof streamSaver === 'undefined') {
    console.warn('[Strategy 3 FAILED] StreamSaver not loaded. Check CDN script tag in join.html.')
    return null
  }
  try {
    streamSaver.mitm = '/StreamSaver/mitm.html'
    const fileStream = streamSaver.createWriteStream(filename, { size: totalBytes })
    console.info('[Strategy 3] Service Worker streaming active — no RAM limit.')
    return fileStream.getWriter()
  } catch (err) {
    console.warn('[Strategy 3 FAILED] StreamSaver error:', err)
    return null
  }
}

/**
 * STRATEGY 2 — showSaveFilePicker (fallback for Chrome/Edge if Strategy 3 fails)
 *
 * Streams directly to a user-chosen file location. No RAM accumulation.
 * Only reached if StreamSaver.js failed to load.
 *
 * NEVER used on Firefox: Firefox's showSaveFilePicker silently accumulates
 * the file in memory with no error. This is worse than Strategy 1 which at
 * least warns the user. Firefox is explicitly blocked here.
 *
 * @param {string} filename
 * @returns {Promise<FileSystemWritableFileStream | null>} null if unsupported or user cancels
 */
export async function openSaveFilePicker(filename) {
  if (!('showSaveFilePicker' in window)) {
    console.warn('[Strategy 2 FAILED] showSaveFilePicker not available in this browser.')
    return null
  }
  try {
    const fileHandle = await window.showSaveFilePicker({ suggestedName: filename })
    const writer = await fileHandle.createWritable()
    console.info('[Strategy 2] showSaveFilePicker active (Chrome/Edge).')
    return writer
  } catch (err) {
    if (err.name === 'AbortError') {
      console.info('[Strategy 2] User cancelled save dialog.')
      return null
    }
    console.warn('[Strategy 2 FAILED]', err)
    return null
  }
}

/**
 * STRATEGY 1 — Memory Blob (last resort — always shows user warning)
 *
 * Accumulates ALL file chunks in RAM as a Blob, then triggers download on completion.
 * Hard browser limit: ~1–2GB depending on available RAM. Chrome tabs are killed
 * by the OS when they exceed the memory limit.
 *
 * When this strategy is selected, ALWAYS call ui.showBrowserWarning() BEFORE
 * accepting the transfer so the user can switch to Chrome if needed.
 *
 * @param {Blob} blob - Fully assembled Blob (call AFTER all chunks received)
 * @param {string} filename
 */
export function triggerDownloadFromBlob(blob, filename) {
  console.warn('[Strategy 1] Memory Blob download. File is fully in RAM.')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/**
 * Strategy selector — the single entry point for all download strategy logic.
 *
 * Call this BEFORE the DataChannel opens (before accepting the transfer),
 * so the user sees any browser warning before committing to receive.
 *
 * Cascade order (fixed — do not change):
 *   1. Strategy 3: Service Worker / StreamSaver.js → all browsers, no RAM limit
 *   2. Strategy 2: showSaveFilePicker → Chrome/Edge only (Firefox explicitly blocked)
 *   3. Strategy 1: Memory Blob → last resort, user warning shown, ~1GB cap
 *
 * @param {string} filename
 * @param {number} totalBytes - Total file size in bytes
 * @returns {Promise<{
 *   type: 'stream-saver' | 'file-picker' | 'blob',
 *   writer: WritableStreamDefaultWriter | null,
 *   showWarning: boolean,
 *   warningMessage: string | null
 * }>}
 */
export async function selectDownloadStrategy(filename, totalBytes) {

  // ── Strategy 3: Service Worker (always try first, every browser) ──────────
  const swWriter = createServiceWorkerStream(filename, totalBytes)
  if (swWriter) {
    return { type: 'stream-saver', writer: swWriter, showWarning: false, warningMessage: null }
  }

  // ── Strategy 2: showSaveFilePicker (Chrome/Edge fallback only) ────────────
  // Explicitly skip on Firefox — its implementation silently uses memory,
  // which is worse than Strategy 1 because the user gets no warning.
  const isFirefox = /Firefox\/\d/i.test(navigator.userAgent)
  if (!isFirefox) {
    const pickerWriter = await openSaveFilePicker(filename)
    if (pickerWriter) {
      return { type: 'file-picker', writer: pickerWriter, showWarning: false, warningMessage: null }
    }
  }

  // ── Strategy 1: Memory Blob (last resort — ALWAYS warn the user) ──────────
  // Determine whether the file is likely too large for in-memory download
  const ONE_GB = 1 * 1024 * 1024 * 1024
  const fileSizeMB = Math.round(totalBytes / 1024 / 1024)
  const isLarge = totalBytes > ONE_GB

  const warningMessage = isLarge
    ? `⚠️ Your browser doesn't support memory-efficient file downloads, and this file is ${fileSizeMB} MB — it may crash your browser tab.\n\nFor large file transfers, please use Chrome.\n\nYou can cancel now or proceed at your own risk.`
    : `⚠️ Your browser doesn't support memory-efficient file downloads. Files over 1 GB may fail or crash your browser tab.\n\nFor large file transfers, please use Chrome.\n\nThis file is ${fileSizeMB} MB — it should transfer fine.`

  console.warn(`[Strategy 1] Memory Blob fallback. File: ${fileSizeMB}MB. Large: ${isLarge}.`)

  return {
    type: 'blob',
    writer: null,          // Strategy 1 has no writer — use triggerDownloadFromBlob() at end
    showWarning: true,     // Caller MUST show warningMessage before starting transfer
    warningMessage,
  }
}
```

> **For AI Agents:** When implementing `join.html`:
> 1. Call `selectDownloadStrategy(filename, totalBytes)` when file metadata arrives (before `transfer-accepted` is sent)
> 2. If `result.showWarning === true`, call `ui.showBrowserWarning(result.warningMessage)` and wait for user confirmation before proceeding
> 3. If `result.type === 'blob'`, accumulate chunks in an array; call `triggerDownloadFromBlob(blob, filename)` on completion
> 4. If `result.type === 'stream-saver'` or `'file-picker'`, pipe each chunk: `await result.writer.write(new Uint8Array(chunk))`; call `result.writer.close()` on completion
> 5. See `SRS.md §FR-09` for the formal requirement. See `ui.js` for `showBrowserWarning()`.



// ── Helpers ──────────────────────────────────────────────────

/**
 * Prepend a 4-byte chunk index to an ArrayBuffer.
 * Format: [4-byte Uint32 index][chunk data]
 *
 * @param {ArrayBuffer} chunk
 * @param {number} index
 * @returns {ArrayBuffer}
 */
export function prependChunkIndex(chunk, index) {
  const result = new ArrayBuffer(4 + chunk.byteLength)
  const view = new DataView(result)
  view.setUint32(0, index, false)  // big-endian
  new Uint8Array(result, 4).set(new Uint8Array(chunk))
  return result
}

/**
 * Extract the chunk index from a received ArrayBuffer.
 * @param {ArrayBuffer} data
 * @returns {{ index: number, payload: ArrayBuffer }}
 */
export function extractChunkIndex(data) {
  const view = new DataView(data)
  const index = view.getUint32(0, false)
  const payload = data.slice(4)
  return { index, payload }
}

/**
 * Wait for the DataChannel buffer to drain below BUFFER_LOW_THRESHOLD.
 * Uses the bufferedamountlow event.
 *
 * @param {RTCDataChannel} channel
 * @returns {Promise<void>}
 */
function waitForBufferDrain(channel) {
  return new Promise(resolve => {
    channel.onbufferedamountlow = () => {
      channel.onbufferedamountlow = null
      resolve()
    }
  })
}

function formatSpeed(bps) {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
}

function formatEta(seconds) {
  if (!isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}
```

---

## 6. Implementation: `js/crypto.js`

### 6.1 TDD — write tests first (100% coverage required)

Create `frontend/js/crypto.test.js`:

```javascript
/**
 * Tests for Web Crypto key derivation and AES-GCM encryption.
 *
 * COVERAGE REQUIREMENT: 100% — encryption is safety-critical.
 * See SRS.md §6.4 and development-guideline.md §3.3.
 * See SRS.md §FR-12 and FR-13 for encryption requirements.
 */
import { describe, it, expect } from 'vitest'
import {
  generateSalt,
  deriveKey,
  encryptChunk,
  decryptChunk,
  SALT_LENGTH,
  IV_LENGTH,
} from './crypto.js'

describe('generateSalt', () => {
  it('should return a Uint8Array of SALT_LENGTH bytes', () => {
    const salt = generateSalt()
    expect(salt).toBeInstanceOf(Uint8Array)
    expect(salt.length).toBe(SALT_LENGTH)
  })

  it('should return different values each call', () => {
    const a = generateSalt()
    const b = generateSalt()
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })
})

describe('deriveKey', () => {
  it('should return a CryptoKey', async () => {
    const salt = generateSalt()
    const key = await deriveKey('test-password', salt)
    expect(key).toHaveProperty('type')
    expect(key.type).toBe('secret')
  })

  it('should produce the same key from the same password and salt', async () => {
    const salt = generateSalt()
    const key1 = await deriveKey('same-password', salt)
    const key2 = await deriveKey('same-password', salt)
    // Export and compare
    const raw1 = await crypto.subtle.exportKey('raw', key1)
    const raw2 = await crypto.subtle.exportKey('raw', key2)
    expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2))
  })

  it('should produce different keys for different passwords', async () => {
    const salt = generateSalt()
    const key1 = await deriveKey('password-one', salt)
    const key2 = await deriveKey('password-two', salt)
    const raw1 = await crypto.subtle.exportKey('raw', key1)
    const raw2 = await crypto.subtle.exportKey('raw', key2)
    expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2))
  })

  it('should produce different keys for different salts', async () => {
    const key1 = await deriveKey('password', generateSalt())
    const key2 = await deriveKey('password', generateSalt())
    const raw1 = await crypto.subtle.exportKey('raw', key1)
    const raw2 = await crypto.subtle.exportKey('raw', key2)
    expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2))
  })
})

describe('encryptChunk / decryptChunk', () => {
  it('should produce output larger than input (IV overhead)', async () => {
    const salt = generateSalt()
    const key = await deriveKey('password', salt)
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]).buffer
    const ciphertext = await encryptChunk(plaintext, key)
    expect(ciphertext.byteLength).toBeGreaterThan(plaintext.byteLength)
  })

  it('should prepend a 12-byte IV', async () => {
    const salt = generateSalt()
    const key = await deriveKey('password', salt)
    const plaintext = new Uint8Array(100).buffer
    const ciphertext = await encryptChunk(plaintext, key)
    // IV is the first IV_LENGTH bytes
    expect(ciphertext.byteLength).toBe(IV_LENGTH + 100 + 16)  // +16 for GCM auth tag
  })

  it('should decrypt to original plaintext', async () => {
    const salt = generateSalt()
    const key = await deriveKey('password', salt)
    const original = new Uint8Array([10, 20, 30, 40, 50])
    const encrypted = await encryptChunk(original.buffer, key)
    const decrypted = await decryptChunk(encrypted, key)
    expect(new Uint8Array(decrypted)).toEqual(original)
  })

  it('should fail to decrypt with wrong key', async () => {
    const salt = generateSalt()
    const key1 = await deriveKey('correct-password', salt)
    const key2 = await deriveKey('wrong-password', salt)
    const plaintext = new Uint8Array([1, 2, 3]).buffer
    const encrypted = await encryptChunk(plaintext, key1)
    await expect(decryptChunk(encrypted, key2)).rejects.toThrow()
  })

  it('should produce different ciphertext for same plaintext (random IV)', async () => {
    const salt = generateSalt()
    const key = await deriveKey('password', salt)
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]).buffer
    const c1 = await encryptChunk(plaintext, key)
    const c2 = await encryptChunk(plaintext, key)
    expect(new Uint8Array(c1)).not.toEqual(new Uint8Array(c2))
  })
})
```

### 6.2 Implement `js/crypto.js`

```javascript
/**
 * Client-side encryption using the Web Crypto API.
 *
 * Provides AES-256-GCM encryption for file chunks using a key
 * derived from a user password via PBKDF2.
 *
 * Security design:
 * - Password is never sent to the server (not even hashed)
 * - Key is derived client-side: PBKDF2(password, salt, 100000, SHA-256) → AES-256
 * - Each chunk uses a unique 12-byte random IV (prevents ciphertext analysis)
 * - IV is prepended to the ciphertext: [12-byte IV][ciphertext + 16-byte GCM tag]
 * - The salt is generated by the sender and included in the file metadata message
 *   (sent via DataChannel, not through the server)
 *
 * See SRS.md §FR-12, FR-13 for requirements.
 * See BRD.md §BR-03 for the password privacy requirement.
 * See frontend-doc.md §6.2 for integration in transfer.js.
 *
 * @module crypto
 */

export const SALT_LENGTH = 16    // bytes
export const IV_LENGTH = 12      // bytes (AES-GCM standard)
const KEY_LENGTH = 256           // bits (AES-256)
const PBKDF2_ITERATIONS = 100000

/**
 * Generate a random salt for key derivation.
 * The sender generates this and includes it in the file metadata message.
 *
 * @returns {Uint8Array} 16 random bytes
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
}

/**
 * Derive an AES-256-GCM key from a password using PBKDF2.
 *
 * This function uses 100,000 PBKDF2 iterations with SHA-256.
 * Calling this with the same password + salt always produces the same key.
 * This is how sender and receiver derive the same key without sharing it.
 *
 * @param {string} password - User-provided password
 * @param {Uint8Array} salt - Random salt (generated by sender, shared in metadata)
 * @returns {Promise<CryptoKey>} AES-GCM key ready for encrypt/decrypt
 */
export async function deriveKey(password, salt) {
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)

  // Step 1: Import the raw password as a key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  // Step 2: Derive the AES-GCM key via PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true,        // exportable (needed for testing)
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt an ArrayBuffer chunk using AES-256-GCM.
 *
 * Output format: [12-byte IV][AES-GCM ciphertext + 16-byte auth tag]
 * Total overhead: 28 bytes per chunk (IV + GCM tag)
 *
 * @param {ArrayBuffer} plaintext - Raw chunk data
 * @param {CryptoKey} key - Derived AES-GCM key
 * @returns {Promise<ArrayBuffer>} Encrypted data with prepended IV
 */
export async function encryptChunk(plaintext, key) {
  // Generate a unique IV for each chunk — NEVER reuse IVs with the same key
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )

  // Prepend IV: [12 bytes IV][ciphertext]
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), IV_LENGTH)
  return result.buffer
}

/**
 * Decrypt an ArrayBuffer chunk using AES-256-GCM.
 *
 * Expects the same format as encryptChunk output:
 * [12-byte IV][AES-GCM ciphertext + 16-byte auth tag]
 *
 * Throws DOMException if decryption fails (wrong key or tampered data).
 *
 * @param {ArrayBuffer} data - Encrypted chunk with prepended IV
 * @param {CryptoKey} key - Derived AES-GCM key
 * @returns {Promise<ArrayBuffer>} Decrypted plaintext
 */
export async function decryptChunk(data, key) {
  const dataView = new Uint8Array(data)

  // Extract IV from the first 12 bytes
  const iv = dataView.slice(0, IV_LENGTH)
  const ciphertext = dataView.slice(IV_LENGTH).buffer

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
}

/**
 * Convert a Uint8Array salt to a Base64 string for transmission in JSON.
 * @param {Uint8Array} salt
 * @returns {string}
 */
export function saltToBase64(salt) {
  return btoa(String.fromCharCode(...salt))
}

/**
 * Convert a Base64 string back to a Uint8Array salt.
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function saltFromBase64(b64) {
  return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)))
}
```

---

## 7. Implementation: `js/ui.js`

`ui.js` has no unit tests (it manipulates the DOM), but it must be organized cleanly.

```javascript
/**
 * All DOM manipulation and UI rendering.
 *
 * This module has ZERO business logic.
 * It only reads from and writes to the DOM.
 * It accepts data from transfer.js, peer.js, and signaling.js
 * and renders it to the screen.
 *
 * @module ui
 */

// ── Connection Status ────────────────────────────────────────

const STATUS_LABELS = {
  'waiting':     { text: 'Waiting for peer…',   class: 'status-waiting' },
  'connecting':  { text: 'Connecting…',          class: 'status-connecting' },
  'connected':   { text: 'Connected',            class: 'status-connected' },
  'transferring':{ text: 'Transferring…',        class: 'status-transferring' },
  'complete':    { text: 'Transfer complete ✓',  class: 'status-complete' },
  'failed':      { text: 'Connection failed',    class: 'status-failed' },
  'cancelled':   { text: 'Cancelled',            class: 'status-cancelled' },
}

/**
 * Update the connection status indicator.
 * @param {'waiting'|'connecting'|'connected'|'transferring'|'complete'|'failed'|'cancelled'} state
 */
export function setStatus(state) {
  const el = document.getElementById('status')
  if (!el) return
  const config = STATUS_LABELS[state] ?? { text: state, class: 'status-unknown' }
  el.textContent = config.text
  el.className = `status ${config.class}`
}

// ── Progress ─────────────────────────────────────────────────

/**
 * Update the transfer progress display.
 * @param {{ percent: number, humanSpeed: string, humanEta: string, bytesTransferred: number, totalBytes: number }} progress
 */
export function updateProgress(progress) {
  const bar = document.getElementById('progress-bar')
  const pct = document.getElementById('progress-percent')
  const speed = document.getElementById('transfer-speed')
  const eta = document.getElementById('transfer-eta')
  const bytes = document.getElementById('bytes-transferred')

  if (bar) bar.style.width = `${progress.percent}%`
  if (pct) pct.textContent = `${progress.percent.toFixed(1)}%`
  if (speed) speed.textContent = progress.humanSpeed
  if (eta) eta.textContent = progress.humanEta
  if (bytes) bytes.textContent = `${formatBytes(progress.bytesTransferred)} of ${formatBytes(progress.totalBytes)}`
}

// ── Room Info ────────────────────────────────────────────────

/**
 * Display the room code prominently.
 * @param {string} code
 */
export function showRoomCode(code) {
  const el = document.getElementById('room-code')
  if (el) el.textContent = code
}

/**
 * Display the shareable URL.
 * @param {string} url
 */
export function showShareUrl(url) {
  const el = document.getElementById('share-url')
  if (el) {
    el.textContent = url
    el.href = url
  }
}

// ── QR Code ──────────────────────────────────────────────────

/**
 * Generate and display a QR code for the shareable URL.
 * Uses qrcode.js loaded from CDN.
 *
 * @param {string} url
 */
export function showQrCode(url) {
  const container = document.getElementById('qr-container')
  if (!container) return
  container.innerHTML = ''
  // qrcode.js global — loaded via CDN in room.html
  if (typeof QRCode !== 'undefined') {
    new QRCode(container, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
    })
  }
}

// ── File Info ────────────────────────────────────────────────

/**
 * Display the incoming file metadata card (receiver side).
 * @param {{ name: string, size: number, mimeType: string }} meta
 */
export function showFileInfo(meta) {
  const card = document.getElementById('file-info-card')
  if (!card) return
  card.classList.remove('hidden')
  document.getElementById('file-name').textContent = meta.name
  document.getElementById('file-size').textContent = formatBytes(meta.size)
  document.getElementById('file-type').textContent = meta.mimeType
}

/**
 * Show/hide the accept/reject buttons.
 * @param {boolean} show
 */
export function showFileActions(show) {
  const el = document.getElementById('file-actions')
  if (el) el.classList.toggle('hidden', !show)
}

// ── Error Display ────────────────────────────────────────────

/**
 * Show an error message in the UI.
 * @param {string} message
 */
export function showError(message) {
  const el = document.getElementById('error-message')
  if (el) {
    el.textContent = message
    el.classList.remove('hidden')
  }
  setStatus('failed')
}

/**
 * Clear any displayed error.
 */
export function clearError() {
  const el = document.getElementById('error-message')
  if (el) {
    el.textContent = ''
    el.classList.add('hidden')
  }
}

/**
 * Show the browser capability warning when Strategy 1 (Memory Blob) is selected.
 *
 * Called by join.html BEFORE accepting the transfer when selectDownloadStrategy()
 * returns { showWarning: true }. The user must acknowledge before transfer starts.
 *
 * The warning element in join.html must have id="browser-warning" and contain:
 *   - A message area (id="browser-warning-message")
 *   - A "Continue anyway" button (id="browser-warning-confirm")
 *   - A "Cancel" button (id="browser-warning-cancel")
 *
 * Returns a Promise that resolves true (user confirmed) or false (user cancelled).
 *
 * @param {string} message - Warning message from selectDownloadStrategy()
 * @returns {Promise<boolean>} true = user confirmed, false = user cancelled
 */
export function showBrowserWarning(message) {
  return new Promise((resolve) => {
    const banner = document.getElementById('browser-warning')
    const msgEl = document.getElementById('browser-warning-message')
    const confirmBtn = document.getElementById('browser-warning-confirm')
    const cancelBtn = document.getElementById('browser-warning-cancel')

    if (!banner || !msgEl) {
      // If the DOM elements aren't present, log and let the transfer proceed
      console.warn('browser-warning element missing from join.html')
      resolve(true)
      return
    }

    msgEl.textContent = message
    banner.classList.remove('hidden')

    const onConfirm = () => {
      banner.classList.add('hidden')
      confirmBtn.removeEventListener('click', onConfirm)
      cancelBtn.removeEventListener('click', onCancel)
      resolve(true)
    }

    const onCancel = () => {
      banner.classList.add('hidden')
      confirmBtn.removeEventListener('click', onConfirm)
      cancelBtn.removeEventListener('click', onCancel)
      resolve(false)
    }

    confirmBtn.addEventListener('click', onConfirm)
    cancelBtn.addEventListener('click', onCancel)
  })
}

/**
 * Hide the browser warning banner.
 */
export function hideBrowserWarning() {
  const banner = document.getElementById('browser-warning')
  if (banner) banner.classList.add('hidden')
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Format bytes as a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
```

---

## 8. HTML Pages

### 8.1 `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P2P Share — Private File Transfer</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main class="home-container">
    <header>
      <h1>P2P Share</h1>
      <p class="tagline">Send files directly — no server storage, no account needed.</p>
    </header>

    <section class="create-section">
      <button id="create-room-btn" class="btn btn-primary btn-lg">
        Create Transfer Room
      </button>
      <p class="privacy-note">🔒 Files never touch our server</p>
    </section>

    <div class="divider">or join an existing room</div>

    <section class="join-section">
      <input
        id="code-input"
        type="text"
        placeholder="Enter 6-digit code"
        maxlength="6"
        autocomplete="off"
        autocapitalize="characters"
      >
      <button id="join-btn" class="btn btn-secondary">Join</button>
      <p id="join-error" class="error-text hidden"></p>
    </section>
  </main>

  <script type="module">
    // Auto-join if URL contains ?code= param
    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    if (code) {
      document.getElementById('code-input').value = code.toUpperCase()
    }

    document.getElementById('create-room-btn').addEventListener('click', async () => {
      const btn = document.getElementById('create-room-btn')
      btn.disabled = true
      btn.textContent = 'Creating…'
      // Room creation happens via WebSocket in room.html
      // Navigate to room.html which will open the WebSocket and create the room
      window.location.href = '/room.html'
    })

    document.getElementById('join-btn').addEventListener('click', async () => {
      const code = document.getElementById('code-input').value.trim().toUpperCase()
      if (code.length !== 6) {
        document.getElementById('join-error').textContent = 'Code must be 6 characters'
        document.getElementById('join-error').classList.remove('hidden')
        return
      }
      // Validate code exists before navigating
      const resp = await fetch(`/api/room/${code}`)
      if (!resp.ok) {
        document.getElementById('join-error').textContent = 'Room not found or expired'
        document.getElementById('join-error').classList.remove('hidden')
        return
      }
      window.location.href = `/join.html?code=${code}`
    })

    // Auto-format code input to uppercase
    document.getElementById('code-input').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    })
  </script>
</body>
</html>
```

---

## 9. Running and Verifying the Frontend

### 9.1 Run frontend tests
```bash
cd p2p-share/frontend
npx vitest run --reporter=verbose
```

### 9.2 Manual end-to-end test checklist

```
[ ] Open http://localhost:3000/index.html in Chrome
[ ] Click "Create Transfer Room"
[ ] Copy the 6-digit code shown on room.html
[ ] Open second tab: http://localhost:3000/index.html
[ ] Enter the code and click "Join"
[ ] Status in first tab changes to "Connected"
[ ] Drag a test file onto the sender page
[ ] Accept the transfer in the receiver tab
[ ] Verify progress bar moves in both tabs
[ ] Verify file downloads automatically in receiver tab
[ ] Verify downloaded file is byte-identical to original
```

---

## 10. Document Cross-References

| For more on... | See document |
|----------------|-------------|
| Why no server-side file handling | `BRD.md §BR-01` |
| WebRTC signaling protocol | `SRS.md §2.2` |
| DataChannel message protocol | `SRS.md §4.3` |
| Encryption requirements | `SRS.md §FR-12, FR-13` |
| Backend signaling APIs being called | `backend-doc.md §6` |
| ICE config endpoint | `backend-doc.md §6.2` |
| Serving static files in production | `deployment-doc.md §3.1` |
| HTTPS requirement for WebRTC/Web Crypto | `deployment-doc.md §3.3` |
| TDD coverage requirements | `SRS.md §6.4` and `development-guideline.md §3.3` |
| Sprint execution guide | `AGENTS.md §3` |
| Backpressure troubleshooting | `AGENTS.md §7` |
