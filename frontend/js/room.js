/**
 * Room orchestration
 *
 * Ties together SignalingClient, PeerConnection, Transfer logic, and UI.
 * Integrates Web Crypto E2E Encryption for file chunking.
 */
import { WS_ORIGIN } from './config.js'
import { SignalingClient } from './signaling.js'
import { PeerConnection, fetchIceConfig } from './peer.js'
import * as transfer from './transfer.js'
import * as ui from './ui.js'
import { generateSalt, deriveKey, encryptChunk, decryptChunk, saltToBase64, saltFromBase64 } from './crypto.js'

let signaling
let peerConn
let isInitiator = false
let roomPassword = ''
let iceConfig = null
let expiryInterval = null
let roomExpired = false

const ROOM_EXPIRY_MS = 30 * 60 * 1000
const EXPIRY_WARN_AT_MS = 10 * 60 * 1000

// Replace singleton state with a Map of active transfers
// Map keys: transferId (UUID)
// Map values: { role, file, metadata, strategy, chunkStore, speedSamples... }
const activeTransfers = new Map()

const uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search)
    const action = params.get('action')
    const joinCode = params.get('code')
    roomPassword = params.get('password') || ''

    if (!action && !joinCode) {
        window.location.href = '/'
        return
    }

    ui.setStatus('connecting')

    // Fetch ICE config BEFORE opening the WebSocket so that all event
    // handlers are registered synchronously after the constructor.
    // Otherwise the 'open' event can fire during the await and be missed.
    iceConfig = await fetchIceConfig()

    const wsUrl = `${WS_ORIGIN}/ws/p2p`
    signaling = new SignalingClient(wsUrl)

    signaling.on('open', async () => {
        if (action === 'create') {
            isInitiator = true
            const createMsg = { type: 'create-room' }
            if (roomPassword) createMsg.password = roomPassword
            signaling.send(createMsg)
        } else if (joinCode) {
            isInitiator = false
            signaling.send({ type: 'join-room', code: joinCode })
        }
    })

    signaling.on('error', (err) => {
        if (err.code === 'ROOM_NOT_FOUND') {
            _handleRoomExpiry()
            return
        }
        ui.setStatus('failed')
        ui.showModal('Error', err.message || 'Connection lost.')
    })

    signaling.on('close', () => {
        if (roomExpired) return
        const statusEl = document.getElementById('status')
        if (statusEl.textContent.includes('complete')) return
        const pcState = peerConn?._pc?.iceConnectionState
        if (pcState === 'connected' || pcState === 'completed') return
        ui.setStatus('failed')
    })

    signaling.on('room-created', (msg) => {
        ui.showRoomCode(msg.code)
        ui.showShareUrl(msg.url)
        ui.showQrCode(msg.url)
        ui.toggleHidden('room-info', false)
        ui.setStatus('waiting')

        peerConn = new PeerConnection(signaling, { role: 'initiator', iceConfig: getEffectiveIceConfig() })
        setupPeerConnection()
        setupDragAndDrop()
        startExpiryTimer()
        _updateRelayToggleVisibility()
    })

    signaling.on('room-joined', async (msg) => {
        const currentUrl = window.location.href.split('?')[0] + '?code=' + joinCode
        ui.showRoomCode(joinCode)
        ui.showShareUrl(currentUrl)
        ui.setRoomHelpText('Connected. Waiting for peer...')
        ui.toggleHidden('room-info', false)
        ui.toggleHidden('qr-wrapper', true)

        startExpiryTimer()
        _updateRelayToggleVisibility()

        if (msg.passwordRequired) {
            const pwd = await ui.askForPassword('Password Required', 'This room is protected by a password.')
            if (!pwd) {
                window.location.href = '/'
                return
            }
            roomPassword = pwd
            signaling.send({ type: 'verify-password', password: pwd })
        } else {
            ui.setStatus('waiting')
            peerConn = new PeerConnection(signaling, { role: 'responder', iceConfig: getEffectiveIceConfig() })
            setupPeerConnection()
            setupDragAndDrop()
        }
    })

    signaling.on('password-result', (msg) => {
        if (msg.valid) {
            ui.setStatus('waiting')
            peerConn = new PeerConnection(signaling, { role: 'responder', iceConfig: getEffectiveIceConfig() })
            setupPeerConnection()
            setupDragAndDrop()
        } else {
            ui.showModal('Error', 'Incorrect password.', false).then(() => {
                window.location.href = '/'
            })
        }
    })

    signaling.on('peer-joined', () => {
        ui.setStatus('connecting')
        peerConn.createOffer()
    })

    signaling.on('signal', (payload) => {
        peerConn.handleSignal(payload)
    })

    signaling.on('peer-left', () => {
        ui.setStatus('cancelled')
        ui.showModal('Disconnected', 'The other peer left the room.', false).then(() => {
            window.location.href = '/'
        })
        peerConn?.close()
    })
})

function setupPeerConnection() {
    peerConn.onConnectionStateChange = (state) => {
        if (state === 'connected') {
            ui.setStatus('connected')
        } else if (state === 'disconnected' || state === 'failed') {
            ui.setStatus('failed')
        }
    }

    peerConn.onControlChannelOpen = () => {
        ui.setStatus('connected')
        ui.toggleHidden('ip-notice', false)
        ui.toggleHidden('transfer-zone', false)
        ui.toggleHidden('queues-container', false)
        const relayToggle = document.getElementById('relay-only')
        if (relayToggle) relayToggle.disabled = true
    }

    peerConn.onControlMessage = async (event) => {
        if (typeof event.data === 'string') {
            await handleControlMessage(JSON.parse(event.data))
        }
    }

    // When the sender opens a dynamic channel, the receiver gets it here:
    peerConn.onTransferChannelOpen = (transferId, channel) => {
        const state = activeTransfers.get(transferId)
        if (!state) return

        channel.onmessage = async (event) => {
            try {
                await handleBinaryChunk(transferId, event.data)
            } catch (err) {
                console.error("Failed to decrypt or process chunk:", err)
                ui.updateQueueItemStatus(transferId, 'Decryption Error')
                channel.close()
            }
        }
    }
}

// ── Control Message Handling ─────────────────────────────────────

async function handleControlMessage(msg) {
    if (msg.type === 'file-metadata') {
        const { id, name, size, mimeType, salt } = msg

        let sessionKey = null
        if (salt && roomPassword) {
            try {
                const sessionSalt = saltFromBase64(salt)
                sessionKey = await deriveKey(roomPassword, sessionSalt)
            } catch (err) {
                ui.showModal('Error', 'Failed to establish encryption session key.')
                peerConn.controlChannel.send(JSON.stringify({ type: 'file-reject', id }))
                return
            }
        }

        ui.addQueueItem(id, { name, size, mimeType }, 'receiving')

        const state = {
            role: 'receiving',
            metadata: msg,
            strategy: null,
            sessionKey,
            chunkStore: [],
            chunksReceived: 0,
            bytesReceived: 0,
            startTime: 0,
            speedSamples: []
        }
        activeTransfers.set(id, state)

        const autoDownload = document.getElementById('auto-download')?.checked

        let accepted = false
        _bindCancelButton(id)

        if (autoDownload) {
            const actions = document.getElementById(`actions-${id}`)
            if (actions) actions.classList.add('hidden')
            accepted = true
        } else {
            accepted = await ui.waitForQueueItemAcceptance(id)
        }

        if (accepted) {
            const strategy = await transfer.selectDownloadStrategy(name, size)

            if (strategy.showWarning) {
                const proceed = await ui.showBrowserWarning(strategy.warningMessage)
                if (!proceed) {
                    ui.updateQueueItemStatus(id, 'Rejected')
                    peerConn.controlChannel.send(JSON.stringify({ type: 'file-reject', id }))
                    return
                }
            }

            state.strategy = strategy
            state.startTime = Date.now()

            ui.updateQueueItemStatus(id, 'Transferring...')
            peerConn.controlChannel.send(JSON.stringify({ type: 'file-accept', id }))
        } else {
            ui.updateQueueItemStatus(id, 'Rejected')
            peerConn.controlChannel.send(JSON.stringify({ type: 'file-reject', id }))
        }
    }
    else if (msg.type === 'file-accept') {
        const id = msg.id
        const state = activeTransfers.get(id)
        if (!state || !state.file) return

        ui.updateQueueItemStatus(id, 'Transferring...')
        state.startTime = Date.now()

        // Sender creates the dynamic channel!
        const channel = peerConn.createTransferChannel(id)

        channel.onopen = async () => {
            try {
                await transfer.sendFile(channel, state.file, {
                    encryptChunk: state.sessionKey ? (chunk) => encryptChunk(chunk, state.sessionKey) : null,
                    onCancel: () => state.cancelled,
                    onProgress: (sent, total) => {
                        state.bytesSent = sent
                        state.speedSamples.push({ bytes: sent, time: Date.now() })
                        if (state.speedSamples.length > 50) state.speedSamples.shift()
                        const stats = transfer.calculateProgress(sent, total, state.startTime, state.speedSamples)
                        ui.updateQueueItemProgress(id, stats)
                        _updateGlobalMetrics()
                    }
                })
                ui.updateQueueItemStatus(id, 'Done')
            } catch (err) {
                console.error(err)
                ui.updateQueueItemStatus(id, 'Upload Error')
            }
        }
    }
    else if (msg.type === 'file-reject') {
        ui.updateQueueItemStatus(msg.id, 'Rejected')
    }
    else if (msg.type === 'transfer-cancelled') {
        const id = msg.id
        const state = activeTransfers.get(id)
        if (state) {
            state.cancelled = true
            ui.updateQueueItemStatus(id, 'Cancelled')
            activeTransfers.delete(id)
        }
    }
}

// ── Binary Chunk Handling (Receiver) ─────────────────────────────

async function handleBinaryChunk(id, data) {
    const state = activeTransfers.get(id)
    if (!state) return

    const { chunkStore, metadata, strategy, sessionKey } = state

    const totalChunks = Math.ceil(metadata.size / transfer.CHUNK_SIZE)

    const result = await transfer.receiveChunk(data, chunkStore, {
        totalChunks,
        decryptChunk: sessionKey ? (chunk) => decryptChunk(chunk, sessionKey) : null
    })

    // Sequential Write Logic for StreamSaver / File System
    if (strategy.writer) {
        if (state.nextChunkToWrite === undefined) state.nextChunkToWrite = 0;

        // Try writing any sequential chunks we have buffered
        while (chunkStore[state.nextChunkToWrite]) {
            const rawChunk = chunkStore[state.nextChunkToWrite]

            try {
                // Await the write to apply backpressure to the browser's SCTP buffer
                await strategy.writer.write(new Uint8Array(rawChunk))
            } catch (err) {
                console.error('Data writing error:', err)
                ui.updateQueueItemStatus(id, 'Write Error')
                return
            }

            state.bytesReceived += rawChunk.byteLength
            chunkStore[state.nextChunkToWrite] = null // Free memory
            state.nextChunkToWrite++
            state.chunksReceived++

            // Progress Update inside sequential write loop
            state.speedSamples.push({ bytes: state.bytesReceived, time: Date.now() })
            if (state.speedSamples.length > 50) state.speedSamples.shift()

            const stats = transfer.calculateProgress(
                state.bytesReceived,
                metadata.size,
                state.startTime,
                state.speedSamples
            )
            ui.updateQueueItemProgress(id, stats)
            _updateGlobalMetrics()

            if (state.chunksReceived === totalChunks) {
                ui.updateQueueItemStatus(id, 'Done')
                await strategy.writer.close().catch(console.error)
            }
        }
    } else {
        // Blob fallback (in-memory)
        state.chunksReceived++
        const rawChunk = chunkStore[result.index]
        state.bytesReceived += rawChunk.byteLength
        state.speedSamples.push({ bytes: state.bytesReceived, time: Date.now() })
        if (state.speedSamples.length > 50) state.speedSamples.shift()

        const stats = transfer.calculateProgress(
            state.bytesReceived,
            metadata.size,
            state.startTime,
            state.speedSamples
        )
        ui.updateQueueItemProgress(id, stats)
        _updateGlobalMetrics()

        if (state.chunksReceived === totalChunks) {
            ui.updateQueueItemStatus(id, 'Done')
            const blob = await transfer.reassembleChunks(chunkStore, totalChunks, metadata.mimeType)
            transfer.triggerDownloadFromBlob(blob, metadata.name)
        }
    }
}

// ── Sender UI & File Selection ───────────────────────────────────

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone')
    const fileInput = document.getElementById('file-input')

    // Handle button clicks in case previous listeners detached
    // HTML has onclick="document.getElementById('file-input').click()"

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            for (let file of e.target.files) {
                handleFileSelection(file)
            }
        }
    })

    document.body.addEventListener('dragover', e => e.preventDefault())
    document.body.addEventListener('drop', e => e.preventDefault())

    dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-active'))
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'))
    dropZone.addEventListener('dragover', (e) => e.preventDefault())
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault()
        dropZone.classList.remove('drag-active')
        if (e.dataTransfer.files.length) {
            for (let file of e.dataTransfer.files) {
                handleFileSelection(file)
            }
        }
    })
}

async function handleFileSelection(file) {
    if (!peerConn || (peerConn._pc.iceConnectionState !== 'connected' && peerConn._pc.iceConnectionState !== 'completed')) {
        ui.showModal('Warning', 'Wait for the peer to connect before selecting a file.')
        return
    }

    const id = uuidv4()
    let sessionSalt = null
    let sessionKey = null

    if (roomPassword) {
        sessionSalt = generateSalt()
        sessionKey = await deriveKey(roomPassword, sessionSalt)
    }

    activeTransfers.set(id, {
        role: 'sending',
        file,
        sessionKey,
        speedSamples: [],
        startTime: 0
    })

    ui.addQueueItem(id, { name: file.name, size: file.size, mimeType: file.type }, 'sending')
    _bindCancelButton(id)

    peerConn.controlChannel.send(JSON.stringify({
        type: 'file-metadata',
        id,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        salt: sessionSalt ? saltToBase64(sessionSalt) : null
    }))
}

function _bindCancelButton(id) {
    const btn = document.getElementById(`btn-cancel-${id}`)
    if (!btn) return
    btn.addEventListener('click', () => {
        const state = activeTransfers.get(id)
        if (state) {
            state.cancelled = true
            activeTransfers.delete(id)
        }
        ui.updateQueueItemStatus(id, 'Cancelled')
        peerConn?.controlChannel?.send(JSON.stringify({ type: 'transfer-cancelled', id }))
    })
}

// Global actions
document.getElementById('btn-leave')?.addEventListener('click', () => {
    window.location.href = '/'
})

document.getElementById('btn-retry')?.addEventListener('click', () => {
    window.location.reload()
})

document.getElementById('btn-save-qr')?.addEventListener('click', () => {
    ui.downloadQrPng()
})

document.getElementById('relay-only')?.addEventListener('change', (e) => {
    if (e.target.checked && !_hasTurnServer()) {
        e.target.checked = false
        ui.showModal('TURN Required', 'Relay-only mode requires a TURN server, but none is configured.')
        return
    }
    if (!peerConn) return
    const pcState = peerConn._pc?.iceConnectionState
    if (pcState === 'connected' || pcState === 'completed') {
        e.target.checked = !e.target.checked
        ui.showModal('Cannot Change', 'Relay mode cannot be changed during an active connection.')
        return
    }
    peerConn.close()
    peerConn = new PeerConnection(signaling, { role: isInitiator ? 'initiator' : 'responder', iceConfig: getEffectiveIceConfig() })
    setupPeerConnection()
})

// ── Helper Functions ─────────────────────────────────────────────

function _hasTurnServer() {
    return iceConfig?.iceServers?.some(s => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls]
        return urls.some(u => u.startsWith('turn:') || u.startsWith('turns:'))
    }) ?? false
}

function getEffectiveIceConfig() {
    const relayOnly = document.getElementById('relay-only')?.checked
    if (!relayOnly || !iceConfig || !_hasTurnServer()) return iceConfig
    return { ...iceConfig, iceTransportPolicy: 'relay' }
}

function _updateRelayToggleVisibility() {
    const container = document.getElementById('relay-toggle-container')
    if (container && !_hasTurnServer()) {
        container.classList.add('hidden')
    }
}

function startExpiryTimer() {
    // Timer starts from client connect time, not server room creation time.
    // A responder joining late may see a slightly optimistic countdown.
    const startTime = Date.now()
    expiryInterval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = ROOM_EXPIRY_MS - elapsed
        if (remaining <= 0) {
            clearInterval(expiryInterval)
            ui.showExpiryNotice(0)
            return
        }
        if (remaining <= EXPIRY_WARN_AT_MS) {
            ui.showExpiryNotice(Math.ceil(remaining / 1000))
        }
    }, 1000)
}

function _handleRoomExpiry() {
    roomExpired = true
    if (expiryInterval) clearInterval(expiryInterval)
    ui.showExpiryNotice(0)
    const pcState = peerConn?._pc?.iceConnectionState
    if (pcState === 'connected' || pcState === 'completed') {
        ui.showModal('Room Expired', 'The signaling room has expired. Active P2P transfers will continue, but new connections are not possible.')
    } else {
        ui.setStatus('failed')
        ui.showModal('Room Expired', 'The room has expired. Please create a new room.', false).then(() => {
            window.location.href = '/'
        })
    }
}

// ── Global Stats Tracking ────────────────────────────────────────

function _updateGlobalMetrics() {
    let totalSent = 0
    let totalReceived = 0
    let uploadSpeed = 0
    let downloadSpeed = 0

    const now = Date.now()
    const windowMs = 1000

    for (const [, state] of activeTransfers.entries()) {
        if (state.role === 'sending') {
            totalSent += (state.bytesSent || 0)
            const recentSamples = state.speedSamples.filter(s => now - s.time < windowMs)
            if (recentSamples.length > 1) {
                uploadSpeed += Math.max(0, recentSamples[recentSamples.length - 1].bytes - recentSamples[0].bytes)
            }
        } else {
            totalReceived += (state.bytesReceived || 0)
            const recentSamples = state.speedSamples.filter(s => now - s.time < windowMs)
            if (recentSamples.length > 1) {
                downloadSpeed += Math.max(0, recentSamples[recentSamples.length - 1].bytes - recentSamples[0].bytes)
            }
        }
    }

    ui.updateGlobalStats({
        totalSent,
        totalReceived,
        uploadSpeed,
        downloadSpeed
    })
}
