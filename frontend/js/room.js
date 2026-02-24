/**
 * Room orchestration
 *
 * Ties together SignalingClient, PeerConnection, Transfer logic, and UI.
 * Integrates Web Crypto E2E Encryption for file chunking.
 */
import { SignalingClient } from './signaling.js'
import { PeerConnection } from './peer.js'
import * as transfer from './transfer.js'
import * as ui from './ui.js'
import { generateSalt, deriveKey, encryptChunk, decryptChunk, saltToBase64, saltFromBase64 } from './crypto.js'

let signaling
let peerConn
let isSender = false
let currentFile = null
let receiveState = null  // Holds download stream info for receiver

let roomPassword = ''
let sessionSalt = null
let sessionKey = null

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search)
    const action = params.get('action')
    const joinCode = params.get('code')
    roomPassword = params.get('password') || ''

    if (!action && !joinCode) {
        window.location.href = '/'
        return
    }

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/p2p`
    signaling = new SignalingClient(wsUrl)

    ui.setStatus('connecting')

    signaling.on('open', async () => {
        if (action === 'create') {
            isSender = true
            sessionSalt = generateSalt()
            sessionKey = await deriveKey(roomPassword, sessionSalt)

            const createMsg = { type: 'create-room' }
            if (roomPassword) createMsg.password = roomPassword
            signaling.send(createMsg)
        } else if (joinCode) {
            isSender = false
            signaling.send({ type: 'join-room', code: joinCode })
        }
    })

    signaling.on('error', (err) => {
        ui.setStatus('failed')
        ui.showModal('Error', err.message || 'Connection lost.')
    })

    signaling.on('close', () => {
        // If it wasn't a planned close
        const statusEl = document.getElementById('status')
        if (!statusEl.textContent.includes('complete')) {
            ui.setStatus('failed')
        }
    })

    // ── Incoming Signaling Events ────────────────────────────────────

    signaling.on('room-created', (msg) => {
        ui.showRoomCode(msg.code)
        ui.showShareUrl(msg.url)
        ui.showQrCode(msg.url)
        ui.toggleHidden('room-info', false)
        ui.setStatus('waiting')

        peerConn = new PeerConnection(signaling, { role: 'sender' })
        setupPeerConnection()
        setupDragAndDrop()
    })

    signaling.on('room-joined', async (msg) => {
        ui.toggleHidden('room-info', true)

        if (msg.password_required) {
            const pwd = await ui.askForPassword('Password Required', 'This room is protected by a password.')
            if (!pwd) {
                window.location.href = '/'
                return
            }
            roomPassword = pwd
            signaling.send({ type: 'verify-password', password: pwd })
        } else {
            ui.setStatus('waiting')
            peerConn = new PeerConnection(signaling, { role: 'receiver' })
            setupPeerConnection()
        }
    })

    signaling.on('password-result', (msg) => {
        if (msg.valid) {
            ui.setStatus('waiting')
            peerConn = new PeerConnection(signaling, { role: 'receiver' })
            setupPeerConnection()
        } else {
            ui.showModal('Error', 'Incorrect password.', false).then(() => {
                window.location.href = '/'
            })
        }
    })

    signaling.on('peer-joined', () => {
        ui.setStatus('connecting')
        peerConn.createOffer() // WebRTC initiator (sender) creates offer
    })

    signaling.on('signal', (payload) => {
        peerConn.handleSignal(payload)
    })

    signaling.on('peer-left', () => {
        ui.setStatus('cancelled')
        ui.showModal('Disconnected', 'The other peer left the room.')
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

    peerConn.onDataChannelOpen = () => {
        ui.setStatus('connected')
        if (isSender) {
            ui.toggleHidden('transfer-zone', false)
        }
    }

    peerConn.onDataChannelMessage = async (event) => {
        if (typeof event.data === 'string') {
            await handleControlMessage(JSON.parse(event.data))
        } else {
            // Binary chunk received
            try {
                await handleBinaryChunk(event.data)
            } catch (err) {
                console.error("Failed to decrypt or process chunk:", err)
                ui.setStatus('failed')
                ui.showModal('Decryption Error', 'Failed to decrypt chunk. Password may be incorrect or data was tampered with.')
                peerConn.dataChannel.close()
            }
        }
    }
}

// ── Control Message Handling ─────────────────────────────────────

async function handleControlMessage(msg) {
    if (msg.type === 'file-metadata' && !isSender) {
        // Derive session key
        try {
            sessionSalt = saltFromBase64(msg.salt)
            sessionKey = await deriveKey(roomPassword, sessionSalt)
        } catch (err) {
            ui.showModal('Error', 'Failed to establish encryption session key.')
            peerConn.dataChannel.send(JSON.stringify({ type: 'file-reject' }))
            return
        }

        // Receiver got file info
        ui.toggleHidden('transfer-zone', false)
        ui.showFileInfo(msg)

        // Select download strategy BEFORE accepting (to show RAM warning if necessary)
        const strategy = await transfer.selectDownloadStrategy(msg.name, msg.size)

        if (strategy.showWarning) {
            const proceed = await ui.showBrowserWarning(strategy.warningMessage)
            if (!proceed) {
                peerConn.dataChannel.send(JSON.stringify({ type: 'file-reject' }))
                return
            }
        }

        const accepted = await ui.waitForFileAcceptance()
        if (accepted) {
            receiveState = {
                metadata: msg,
                strategy,
                chunkStore: [],
                chunksReceived: 0,
                bytesReceived: 0,
                startTime: Date.now(),
                speedSamples: []
            }
            ui.setStatus('transferring')
            ui.showProgressContainer(true)
            peerConn.dataChannel.send(JSON.stringify({ type: 'file-accept' }))
        } else {
            peerConn.dataChannel.send(JSON.stringify({ type: 'file-reject' }))
        }
    }
    else if (msg.type === 'file-accept' && isSender) {
        // Receiver accepted, start sending
        ui.setStatus('transferring')
        ui.showProgressContainer(true)

        try {
            const startTime = Date.now()
            const speedSamples = []

            await transfer.sendFile(peerConn.dataChannel, currentFile, {
                encryptChunk: (chunk) => encryptChunk(chunk, sessionKey),
                onProgress: (sent, total) => {
                    speedSamples.push({ bytes: sent, time: Date.now() })
                    if (speedSamples.length > 50) speedSamples.shift()
                    const stats = transfer.calculateProgress(sent, total, startTime, speedSamples)
                    ui.updateProgress(stats)
                }
            })
            ui.setStatus('complete')
        } catch (err) {
            console.error(err)
            ui.setStatus('failed')
            ui.showModal('Upload Error', err.message)
        }
    }
    else if (msg.type === 'file-reject' && isSender) {
        ui.showModal('Rejected', 'The receiver declined the file.')
        currentFile = null
    }
}

// ── Binary Chunk Handling (Receiver) ─────────────────────────────

async function handleBinaryChunk(data) {
    if (!receiveState) return

    const { chunkStore, metadata, strategy } = receiveState

    // We expect the chunks exactly as receiveChunk defines
    const totalChunks = Math.ceil(metadata.size / transfer.CHUNK_SIZE)

    const result = await transfer.receiveChunk(data, chunkStore, {
        totalChunks,
        decryptChunk: (chunk) => decryptChunk(chunk, sessionKey)
    })

    // Process chunk based on strategy
    const rawChunk = chunkStore[result.index]

    // For streams (strategy 2 & 3), we write it immediately and free the memory
    if (strategy.writer) {
        await strategy.writer.write(new Uint8Array(rawChunk))
        chunkStore[result.index] = null // Free memory!
    }

    // Update progress UI
    receiveState.chunksReceived += 1
    receiveState.bytesReceived += rawChunk.byteLength
    receiveState.speedSamples.push({ bytes: receiveState.bytesReceived, time: Date.now() })
    if (receiveState.speedSamples.length > 50) receiveState.speedSamples.shift()

    const stats = transfer.calculateProgress(
        receiveState.bytesReceived,
        metadata.size,
        receiveState.startTime,
        receiveState.speedSamples
    )
    ui.updateProgress(stats)

    // Complete?
    if (receiveState.chunksReceived === totalChunks) {
        ui.setStatus('complete')
        if (strategy.writer) {
            await strategy.writer.close()
        } else if (strategy.type === 'blob') {
            // Memory strategy: combine array of ArrayBuffers into a Blob
            const blob = await transfer.reassembleChunks(chunkStore, totalChunks, metadata.mimeType)
            transfer.triggerDownloadFromBlob(blob, metadata.name)
        }
    }
}

// ── Sender UI & File Selection ───────────────────────────────────

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone')
    const fileInput = document.getElementById('file-input')
    const btnSelect = document.getElementById('btn-select-file')

    btnSelect.addEventListener('click', () => fileInput.click())

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileSelection(e.target.files[0])
    })

    document.body.addEventListener('dragover', e => {
        e.preventDefault()
    })
    document.body.addEventListener('drop', e => {
        e.preventDefault()
    })

    dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-active'))
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'))
    dropZone.addEventListener('dragover', (e) => e.preventDefault())
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault()
        dropZone.classList.remove('drag-active')
        if (e.dataTransfer.files.length) {
            handleFileSelection(e.dataTransfer.files[0])
        }
    })
}

function handleFileSelection(file) {
    if (!peerConn || peerConn._pc.iceConnectionState !== 'connected') {
        ui.showModal('Warning', 'Wait for the peer to connect before selecting a file.')
        return
    }

    currentFile = file
    ui.showFileInfo({ name: file.name, size: file.size, mimeType: file.type })
    ui.toggleHidden('drop-zone', true)

    // Propose transfer to receiver
    peerConn.dataChannel.send(JSON.stringify({
        type: 'file-metadata',
        name: file.name,
        size: file.size,
        mimeType: file.type,
        salt: saltToBase64(sessionSalt)
    }))
}

// Global actions
document.getElementById('btn-leave')?.addEventListener('click', () => {
    window.location.href = '/'
})
