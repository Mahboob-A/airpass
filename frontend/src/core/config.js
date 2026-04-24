/**
 * Environment-aware configuration.
 *
 * In production, Nginx proxies /api and /ws to the backend on the same origin.
 * In local development, the Vite dev server proxies these requests to localhost:8000.
 * Therefore, all URLs can be relative.
 *
 * @module config
 */

/**
 * HTTP origin for backend API calls.
 * Empty string forces relative URLs.
 */
export const BACKEND_ORIGIN = ''

/**
 * WebSocket origin for signaling server.
 * Uses the correct protocol (ws/wss) relative to the current host.
 */
export const WS_ORIGIN = (() => {
    const wsProt = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProt}//${window.location.host}`
})()
