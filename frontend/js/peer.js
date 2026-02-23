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

const DATA_CHANNEL_LABEL = 'file-transfer'

export class PeerConnection {
    /**
     * @param {import('./signaling.js').SignalingClient} signaling
     * @param {{ role: 'sender' | 'receiver', iceConfig?: object }} options
     */
    constructor(signaling, { role, iceConfig = null }) {
        this._signaling = signaling
        this._role = role
        this._pc = null
        this._dataChannel = null
        this._remoteDescriptionSet = false
        this._iceCandidateQueue = []    // Queue for candidates arriving early

        // Callbacks — set by the caller (room.js / join.js orchestration)
        this.onDataChannelOpen = null         // () => void
        this.onDataChannelMessage = null      // (event) => void
        this.onConnectionStateChange = null   // (state: string) => void

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

        // Sender creates the DataChannel
        if (this._role === 'sender') {
            this._dataChannel = this._pc.createDataChannel(DATA_CHANNEL_LABEL, {
                ordered: true,
                // maxRetransmits: null → reliable delivery (unlimited retransmits)
                // This is critical for file transfer integrity
            })
            this._setupDataChannelHandlers(this._dataChannel)
        }

        // Receiver receives the DataChannel
        this._pc.ondatachannel = (event) => {
            if (event.channel.label === DATA_CHANNEL_LABEL) {
                this._dataChannel = event.channel
                this._setupDataChannelHandlers(this._dataChannel)
            }
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
