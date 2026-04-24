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
        peerConn = new PeerConnection(mockSignaling, { role: 'sender', iceConfig: { iceServers: [] } })
    })

    it('should create RTCPeerConnection with ICE config', () => {
        expect(MockRTCPeerConnection.instance).toBeDefined()
        expect(MockRTCPeerConnection.instance.config).toHaveProperty('iceServers')
    })

    it('should create a Control Channel named "p2p-control"', () => {
        const ch = MockRTCPeerConnection.instance._channels['p2p-control']
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
