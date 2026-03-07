/**
 * Environment-aware configuration.
 *
 * In production, Nginx proxies /api/* and /ws/* to the backend on the same
 * origin, so relative URLs work. In local development the frontend runs on
 * a different port (e.g. 3000) than the backend (8000), so requests to
 * relative paths hit the static file server instead of FastAPI.
 *
 * This module detects the environment and exports the correct origins.
 *
 * @module config
 */

const BACKEND_PORT = '8000'
const DEV_SERVER_PORTS = ['3000', '5500', '8080']

function isLocalDev() {
    const h = window.location.hostname
    return (h === 'localhost' || h === '127.0.0.1' || h === '::1') &&
        DEV_SERVER_PORTS.includes(window.location.port)
}

/**
 * HTTP origin for backend API calls.
 * Empty string in production (same-origin relative URLs).
 * 'http://localhost:8000' in local development.
 */
export const BACKEND_ORIGIN = isLocalDev()
    ? `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`
    : ''

/**
 * WebSocket origin for signaling server.
 * Uses the correct protocol (ws/wss) and port.
 */
export const WS_ORIGIN = (() => {
    const wsProt = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (isLocalDev()) {
        return `${wsProt}//${window.location.hostname}:${BACKEND_PORT}`
    }
    return `${wsProt}//${window.location.host}`
})()
