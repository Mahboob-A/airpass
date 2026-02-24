/**
 * File transfer: chunking, sending, receiving, reassembly.
 *
 * Handles all aspects of the file data flow over the WebRTC DataChannel.
 * This module has ZERO dependencies on DOM, WebSocket, or crypto.
 * It is a pure data-processing module, making it fully testable.
 *
 * Key responsibilities:
 * - Split File objects into 64KB ArrayBuffer chunks
 * - Reassemble chunks into a Blob for download
 * - Calculate real-time progress metrics
 *
 * See SRS.md §FR-08 to FR-10 for requirements.
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
 * @param {RTCDataChannel} channel - Open DataChannel
 * @param {File} file - File to send
 * @param {object} options
 * @param {Function} options.onProgress - (bytesSent, totalBytes) => void
 * @param {Function} [options.encryptChunk] - Optional: (ArrayBuffer, index) => Promise<ArrayBuffer>
 * @param {Function} [options.onCancel] - Optional: Returns true if transfer was cancelled
 * @returns {Promise<void>}
 */
export async function sendFile(channel, file, { onProgress, encryptChunk, onCancel }) {
    const chunks = await chunkFile(file)
    const totalChunks = chunks.length
    let bytesSent = 0

    channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD

    for (let i = 0; i < chunks.length; i++) {
        if (onCancel?.()) return

        let chunk = chunks[i]

        if (encryptChunk) {
            chunk = await encryptChunk(chunk, i)
        }

        const indexed = prependChunkIndex(chunk, i)

        if (channel.bufferedAmount > BUFFER_HIGH_THRESHOLD) {
            await waitForBufferDrain(channel)
        }

        channel.send(indexed)
        bytesSent += file.size * (1 / totalChunks)
        onProgress?.(Math.min(bytesSent, file.size), file.size)
    }
}

/**
 * Receive a file chunk message and store it.
 *
 * @param {ArrayBuffer} data - Raw DataChannel message data
 * @param {ArrayBuffer[]} chunkStore - Mutable array to accumulate chunks
 * @param {object} options
 * @param {number} options.totalChunks
 * @param {Function} [options.decryptChunk] - Optional: (ArrayBuffer, index) => Promise<ArrayBuffer>
 * @returns {Promise<{ index: number, received: number, isComplete: boolean }>}
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
 * @returns {{ percent: number, speedBps: number, etaSeconds: number, humanSpeed: string, humanEta: string }}
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

// ── Helpers ─────────────────────────────────────────────

function prependChunkIndex(chunk, index) {
    const payload = new Uint8Array(chunk)
    const buffer = new ArrayBuffer(4 + payload.length)
    const view = new DataView(buffer)
    view.setUint32(0, index, false) // Big-endian
    const out = new Uint8Array(buffer)
    out.set(payload, 4)
    return buffer
}

function extractChunkIndex(buffer) {
    const view = new DataView(buffer)
    const index = view.getUint32(0, false)
    const payload = buffer.slice(4)
    return { index, payload }
}

function waitForBufferDrain(channel) {
    return new Promise(resolve => {
        const handler = () => {
            channel.removeEventListener('bufferedamountlow', handler)
            resolve()
        }
        channel.addEventListener('bufferedamountlow', handler)
    })
}

function formatSpeed(bps) {
    if (bps === 0) return '0 B/s'
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
    const i = Math.floor(Math.log(bps) / Math.log(1024))
    return `${(bps / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
}

function formatEta(seconds) {
    if (!isFinite(seconds)) return 'Calculating...'
    if (seconds < 1) return 'Done'
    if (seconds < 60) return `${Math.ceil(seconds)}s`
    const minutes = Math.floor(seconds / 60)
    const secs = Math.ceil(seconds % 60)
    return `${minutes}m ${secs}s`
}

// ── Download Strategy Cascade ───────────────────────────

/**
 * STRATEGY 3 — Service Worker streaming (PRODUCTION DEFAULT)
 *
 * @param {string} filename
 * @param {number} totalBytes
 * @returns {WritableStreamDefaultWriter | null}
 */
export function createServiceWorkerStream(filename, totalBytes) {
    if (typeof streamSaver === 'undefined') {
        console.warn('[Strategy 3 FAILED] StreamSaver not loaded.')
        return null
    }
    try {
        streamSaver.mitm = '/StreamSaver/mitm.html'
        const fileStream = streamSaver.createWriteStream(filename, { size: totalBytes })
        return fileStream.getWriter()
    } catch (err) {
        console.warn('[Strategy 3 FAILED] StreamSaver error:', err)
        return null
    }
}

/**
 * STRATEGY 2 — showSaveFilePicker (Chrome/Edge only)
 *
 * @param {string} filename
 * @returns {Promise<FileSystemWritableFileStream | null>}
 */
export async function openSaveFilePicker(filename) {
    if (!('showSaveFilePicker' in window)) return null
    // explicitly block on Firefox to prevent silent RAM accumulation
    if (navigator.userAgent.toLowerCase().includes('firefox')) return null

    try {
        const fileHandle = await window.showSaveFilePicker({ suggestedName: filename })
        return await fileHandle.createWritable()
    } catch (err) {
        if (err.name === 'AbortError') return null
        console.warn('[Strategy 2 FAILED]', err)
        return null
    }
}

/**
 * STRATEGY 1 — Memory Blob (Last resort)
 *
 * @param {Blob} blob 
 * @param {string} filename
 */
export function triggerDownloadFromBlob(blob, filename) {
    console.warn('[Strategy 1] Memory Blob download.')
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
