/**
 * Tests for the SignalingClient WebSocket wrapper.
 * 
 * Uses mock WebSocket — no real server needed.
 * See SRS.md §4 for the message protocol being tested.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock WebSocket
class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

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
