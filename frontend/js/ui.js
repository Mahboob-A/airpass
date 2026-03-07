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

    const retryContainer = document.getElementById('retry-container')
    if (retryContainer) {
        retryContainer.classList.toggle('hidden', state !== 'failed')
    }
}
// ── Transfer Queues ────────────────────────────────────────────

/**
 * Add a new file item to either the Sending or Receiving queue.
 * @param {string} id - Unique transfer ID
 * @param {object} metadata - File metadata (name, size, type)
 * @param {'sending'|'receiving'} role 
 */
export function addQueueItem(id, metadata, role = 'sending') {
    const listId = role === 'sending' ? 'sending-list' : 'receiving-list'
    const list = document.getElementById(listId)
    if (!list) return

    const iconClass = role === 'sending' ? 'sending' : 'receiving'
    const iconChar = role === 'sending' ? '↑' : '↓'

    // For receivers, show a download button initially. Senders start 'Awaiting'.
    const actionHtml = role === 'receiving'
        ? `<div class="queue-item-actions" id="actions-${id}">
         <button id="btn-accept-${id}" class="btn primary">Download</button>
         <button id="btn-cancel-${id}" class="btn danger" style="flex:1">Cancel</button>
       </div>`
        : `<div class="queue-item-actions" id="actions-${id}">
         <button id="btn-cancel-${id}" class="btn danger" style="flex:1">Cancel</button>
       </div>`

    const html = `
    <div class="queue-item" id="queue-item-${id}">
        <div class="queue-item-header">
            <div class="queue-item-icon ${iconClass}">${iconChar}</div>
            <div class="queue-item-details">
                <div class="queue-item-name" title="${metadata.name}">${metadata.name}</div>
                <div class="queue-item-meta">
                    <span>${formatBytes(metadata.size)}</span>
                    <span class="queue-item-status-text" id="status-text-${id}">Awaiting</span>
                </div>
                <div class="queue-item-progress-wrap">
                    <div class="queue-item-progress-bar">
                        <div class="queue-item-progress-fill" id="progress-fill-${id}" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        </div>
        ${actionHtml}
    </div>
`
    list.insertAdjacentHTML('beforeend', html)
}

/**
 * Update the transfer progress display for a specific queue item.
 * @param {string} id 
 * @param {object} progress 
 */
export function updateQueueItemProgress(id, progress) {
    const fill = document.getElementById(`progress-fill-${id}`)
    const statusText = document.getElementById(`status-text-${id}`)

    if (fill) fill.style.width = `${progress.percent}%`
    if (statusText && progress.percent < 100) {
        statusText.textContent = `${progress.percent.toFixed(0)}% • ${progress.humanSpeed}`
    }
}

/**
 * Update the text status of a queue item.
 * @param {string} id 
 * @param {string} status 
 */
export function updateQueueItemStatus(id, status) {
    const statusText = document.getElementById(`status-text-${id}`)
    if (!statusText) return

    statusText.textContent = status
    const lower = status.toLowerCase()
    if (lower === 'done') {
        statusText.className = 'queue-item-status-text done'
        const fill = document.getElementById(`progress-fill-${id}`)
        if (fill) fill.style.width = '100%'
        const actions = document.getElementById(`actions-${id}`)
        if (actions) actions.classList.add('hidden')
    } else if (lower.includes('reject') || lower.includes('fail') || lower.includes('cancel') || lower.includes('error')) {
        statusText.className = 'queue-item-status-text failed'
        const actions = document.getElementById(`actions-${id}`)
        if (actions) actions.classList.add('hidden')
    }
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
 * Set the descriptive text under the room code.
 * @param {string} text 
 */
export function setRoomHelpText(text) {
    const el = document.getElementById('room-help-text')
    if (el) el.textContent = text
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

/**
 * Download the QR code as a PNG image file.
 * Extracts the canvas rendered by qrcode.js and triggers a download.
 */
export function downloadQrPng() {
    const container = document.getElementById('qr-container')
    if (!container) return
    const canvas = container.querySelector('canvas')
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = 'airpass-qr.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}

// ── File Acceptance ──────────────────────────────────────────

/**
 * Wait for the user to click the download button on a queue item.
 * Auto-hides the button once clicked.
 * @param {string} id 
 * @returns {Promise<boolean>}
 */
export function waitForQueueItemAcceptance(id) {
    return new Promise((resolve) => {
        const btn = document.getElementById(`btn-accept-${id}`)
        const actions = document.getElementById(`actions-${id}`)

        if (!btn) return resolve(false)

        btn.onclick = () => {
            if (actions) actions.classList.add('hidden')
            resolve(true)
        }
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

/**
 * Show or update the room expiry countdown notice.
 * @param {number} remainingSeconds - Seconds remaining, or 0 if expired
 */
export function showExpiryNotice(remainingSeconds) {
    const el = document.getElementById('expiry-notice')
    const textEl = document.getElementById('expiry-text')
    if (!el || !textEl) return

    el.classList.remove('hidden')

    if (remainingSeconds <= 0) {
        textEl.textContent = 'Room expired -- active transfers continue'
        el.classList.remove('expiry-urgent')
        el.classList.add('expiry-expired')
        return
    }

    const min = Math.floor(remainingSeconds / 60)
    const sec = remainingSeconds % 60
    textEl.textContent = `Room expires in ${min}:${sec.toString().padStart(2, '0')}`

    if (remainingSeconds <= 300) {
        el.classList.add('expiry-urgent')
    } else {
        el.classList.remove('expiry-urgent')
    }
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

/**
 * Update the global transfer statistics.
 * @param {object} stats - { totalSent, totalReceived, uploadSpeed, downloadSpeed }
 */
export function updateGlobalStats(stats) {
    const container = document.getElementById('global-stats')
    if (container && container.classList.contains('hidden')) {
        container.classList.remove('hidden')
    }

    const sentEl = document.getElementById('stat-total-sent')
    const recEl = document.getElementById('stat-total-received')
    const upEl = document.getElementById('stat-upload-speed')
    const downEl = document.getElementById('stat-download-speed')

    if (sentEl) sentEl.textContent = formatBytes(stats.totalSent)
    if (recEl) recEl.textContent = formatBytes(stats.totalReceived)
    if (upEl) upEl.textContent = formatSpeed(stats.uploadSpeed)
    if (downEl) downEl.textContent = formatSpeed(stats.downloadSpeed)
}

function formatSpeed(bps) {
    if (bps === 0) return '0 B/s'
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
    const i = Math.floor(Math.log(bps) / Math.log(1024))
    return `${(bps / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
}
