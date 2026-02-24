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
    'waiting': { text: 'Waiting for peer…', class: 'status-waiting' },
    'connecting': { text: 'Connecting…', class: 'status-connecting' },
    'connected': { text: 'Connected', class: 'status-connected' },
    'transferring': { text: 'Transferring…', class: 'status-transferring' },
    'complete': { text: 'Transfer complete ✓', class: 'status-complete' },
    'failed': { text: 'Connection failed', class: 'status-failed' },
    'cancelled': { text: 'Cancelled', class: 'status-cancelled' },
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

    if (state !== 'waiting' && state !== 'connecting') {
        el.classList.remove('hidden')
    }
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

export function showProgressContainer(show) {
    const el = document.getElementById('progress-container')
    if (el) el.classList.toggle('hidden', !show)
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
    document.getElementById('file-type').textContent = meta.mimeType || 'application/octet-stream'
}

/**
 * Wait for the user to accept or reject the file.
 * Returns true if accepted, false if rejected.
 * @returns {Promise<boolean>}
 */
export function waitForFileAcceptance() {
    return new Promise((resolve) => {
        const actions = document.getElementById('file-actions')
        const btnAccept = document.getElementById('btn-accept')
        const btnReject = document.getElementById('btn-reject')

        if (!actions || !btnAccept || !btnReject) {
            // If UI is missing, auto-reject for safety
            resolve(false)
            return
        }

        actions.classList.remove('hidden')

        const cleanup = () => {
            actions.classList.add('hidden')
            btnAccept.removeEventListener('click', onAccept)
            btnReject.removeEventListener('click', onReject)
        }

        const onAccept = () => { cleanup(); resolve(true) }
        const onReject = () => { cleanup(); resolve(false) }

        btnAccept.addEventListener('click', onAccept)
        btnReject.addEventListener('click', onReject)
    })
}

// ── Error Display ────────────────────────────────────────────

/**
 * Show a warning/error modal in the UI using Promisified input.
 * @param {string} title
 * @param {string} message 
 * @param {boolean} showCancel
 * @returns {Promise<boolean>} true if OK, false if Cancelled
 */
export function showModal(title, message, showCancel = false) {
    return new Promise(resolve => {
        const modal = document.getElementById('modal-container')
        document.getElementById('modal-title').textContent = title
        document.getElementById('modal-message').textContent = message

        const btnOk = document.getElementById('btn-modal-ok')
        const btnCancel = document.getElementById('btn-modal-cancel')

        btnCancel.classList.toggle('hidden', !showCancel)
        modal.classList.remove('hidden')

        const clean = () => {
            modal.classList.add('hidden')
            btnOk.removeEventListener('click', onOk)
            btnCancel.removeEventListener('click', onCancel)
        }

        const onOk = () => { clean(); resolve(true) }
        const onCancel = () => { clean(); resolve(false) }

        btnOk.addEventListener('click', onOk)
        btnCancel.addEventListener('click', onCancel)
    })
}

export function askForPassword(title, message) {
    return new Promise(resolve => {
        const modal = document.getElementById('modal-container')
        document.getElementById('modal-title').textContent = title
        document.getElementById('modal-message').textContent = message

        const input = document.getElementById('modal-input')
        input.classList.remove('hidden')
        input.value = ''

        const btnOk = document.getElementById('btn-modal-ok')
        const btnCancel = document.getElementById('btn-modal-cancel')

        btnCancel.classList.remove('hidden')
        modal.classList.remove('hidden')

        const clean = () => {
            modal.classList.add('hidden')
            input.classList.add('hidden')
            btnOk.removeEventListener('click', onOk)
            btnCancel.removeEventListener('click', onCancel)
        }

        const onOk = () => { clean(); resolve(input.value) }
        const onCancel = () => { clean(); resolve(null) }

        btnOk.addEventListener('click', onOk)
        btnCancel.addEventListener('click', onCancel)

        // Allow user to hit Enter
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') onOk()
        })
        input.focus()
    })
}

export function showBrowserWarning(message) {
    return showModal("Memory Warning", message, true)
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function toggleHidden(id, hide) {
    const el = document.getElementById(id)
    if (el) el.classList.toggle('hidden', hide)
}
