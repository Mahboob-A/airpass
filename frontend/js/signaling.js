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
