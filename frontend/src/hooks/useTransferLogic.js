import { useCallback } from 'react';
import { useRoomStore, useTransferStore } from '../store';
import { generateSalt, deriveKey, saltToBase64, saltFromBase64, encryptChunk, decryptChunk } from '../core/crypto';
import { v4 as uuidv4 } from 'uuid';
import * as transferLogic from '../core/transfer';
import { formatBytes } from '../lib/format'; // BUG-13: use canonical copy, not a local duplicate

export function useTransferLogic() {
    // BUG-08: removed confusing `joinCode: roomPassword` alias — joinCode is the room code, not the password
    // FIX-B: Do NOT destructure peerConn here — that captures a stale closure value captured at
    // render time. Always read it from the store at call time via useRoomStore.getState().peerConn.
    const { setStatus } = useRoomStore();
    const { addTransfer, updateTransfer, removeTransfer, updateGlobalStats, transfers } = useTransferStore();

    // ── Accept / Reject (called from RoomPage modal buttons) ──────────────────

    /**
     * Called when the receiving user clicks Accept on the file-offer modal.
     * Runs selectDownloadStrategy, updates status, and sends file-accept to the sender.
     *
     * @param {string} id - Transfer ID from the pending file-metadata message
     */
    const acceptTransfer = useCallback(async (id) => {
        // FIX-B: read peerConn from store at call time, not from stale closure
        const peerConn = useRoomStore.getState().peerConn;
        const state = useTransferStore.getState().transfers[id];
        if (!state || !peerConn) return;

        const { metadata } = state;

        const strategy = await transferLogic.selectDownloadStrategy(metadata.name, metadata.size);

        if (strategy.showWarning) {
            // Strategy 3 (StreamSaver) failed — blob fallback with RAM warning.
            // We cannot use window.confirm here for the same blocking-dialog reason.
            // The warning is shown inline; proceed as requested by spec (user already
            // chose to accept, so we proceed with a console warning).
            console.warn('[Strategy 1] RAM-limited download. File size:', formatBytes(metadata.size));
        }

        updateTransfer(id, { strategy, startTime: Date.now(), status: 'Transferring...' });
        peerConn.controlChannel.send(JSON.stringify({ type: 'file-accept', id }));
    }, [updateTransfer]);

    /**
     * Called when the receiving user clicks Reject (or closes) the file-offer modal.
     *
     * @param {string} id - Transfer ID
     */
    const rejectTransfer = useCallback((id) => {
        // FIX-B: read peerConn from store at call time
        const peerConn = useRoomStore.getState().peerConn;
        updateTransfer(id, { status: 'Rejected' });
        peerConn?.controlChannel?.send(JSON.stringify({ type: 'file-reject', id }));
    }, [updateTransfer]);


    // ── Control message handler ───────────────────────────────────────────────

    /**
     * Handle a control message from the peer's DataChannel.
     *
     * FIX-A: The old implementation called window.confirm() here for file-offer
     * accept/reject. window.confirm is a blocking browser dialog that Chrome
     * auto-dismisses to false when the tab is not focused — causing every incoming
     * file to be silently rejected from the other peer's perspective.
     *
     * The new design:
     *   file-metadata → set status 'Pending' → call onFileOffer(id, name, size)
     *   RoomPage shows a modal → user clicks Accept or Reject
     *   Accept → acceptTransfer(id) → sends file-accept
     *   Reject → rejectTransfer(id) → sends file-reject
     *
     * @param {object} msg - Parsed control message
     * @param {string} password - Room password (for encrypted transfers)
     * @param {Function} onFileOffer - Callback: (id, name, size) => void
     *   Called when a file-metadata message arrives so RoomPage can show the modal.
     */
    const handleControlMessage = useCallback(async (msg, password, onFileOffer) => {
        if (msg.type === 'file-metadata') {
            const { id, name, size, mimeType, salt } = msg;

            let sessionKey = null;
            if (salt) {
                const storePassword = useRoomStore.getState().password;
                let currentPass = password || storePassword;

                // If it's a password-protected file but we don't have the password,
                // reject immediately — the user should have been prompted on room join.
                if (!currentPass) {
                    console.error('Encrypted file received but no password available. Rejecting.');
                    // FIX-B: read peerConn from store at call time
                    const peerConn = useRoomStore.getState().peerConn;
                    peerConn?.controlChannel?.send(JSON.stringify({ type: 'file-reject', id }));
                    return;
                }

                try {
                    const sessionSalt = saltFromBase64(salt);
                    sessionKey = await deriveKey(currentPass, sessionSalt);
                } catch (err) {
                    console.error('Failed to establish encryption session key.', err);
                    const peerConn = useRoomStore.getState().peerConn;
                    peerConn?.controlChannel?.send(JSON.stringify({ type: 'file-reject', id }));
                    return;
                }
            }

            // FIX-A: Set status to 'Pending' (not 'Waiting') and delegate the
            // accept/reject decision to the React UI via onFileOffer callback.
            // Do NOT call window.confirm here.
            addTransfer(id, {
                role: 'receiving',
                metadata: { id, name, size, mimeType },
                status: 'Pending',
                strategy: null,
                sessionKey,
                chunkStore: [],
                chunksReceived: 0,
                bytesReceived: 0,
                startTime: 0,
                speedSamples: []
            });

            // Signal RoomPage to show the file-offer confirmation modal.
            onFileOffer?.(id, name, size);
        }
        else if (msg.type === 'file-accept') {
            const id = msg.id;
            const state = useTransferStore.getState().transfers[id];
            if (!state || !state.file) return;

            // FIX-B: read peerConn from store at call time, not stale closure
            const peerConn = useRoomStore.getState().peerConn;

            updateTransfer(id, { status: 'Transferring...', startTime: Date.now() });

            const channel = peerConn.createTransferChannel(id);

            channel.onopen = async () => {
                try {
                    await transferLogic.sendFile(channel, state.file, {
                        encryptChunk: state.sessionKey ? (chunk) => encryptChunk(chunk, state.sessionKey) : null,
                        onCancel: () => useTransferStore.getState().transfers[id]?.cancelled,
                        onProgress: (sent, total) => {
                            const currentTransfers = useTransferStore.getState().transfers;
                            const currentState = currentTransfers[id];
                            if (!currentState) return;

                            const speedSamples = [...currentState.speedSamples, { bytes: sent, time: Date.now() }];
                            if (speedSamples.length > 50) speedSamples.shift();

                            const stats = transferLogic.calculateProgress(sent, total, currentState.startTime, speedSamples);

                            updateTransfer(id, { bytesSent: sent, progressStats: stats, speedSamples });
                            _updateGlobalMetrics();
                        }
                    });
                    updateTransfer(id, { status: 'Done' });
                } catch (err) {
                    console.error(err);
                    updateTransfer(id, { status: 'Upload Error' });
                }
            };
        }
        else if (msg.type === 'file-reject') {
            updateTransfer(msg.id, { status: 'Rejected' });
        }
        else if (msg.type === 'transfer-cancelled') {
            updateTransfer(msg.id, { status: 'Cancelled', cancelled: true });
        }
    }, [addTransfer, updateTransfer]);
    // FIX-B: peerConn intentionally NOT in the dependency array —
    // it is always read fresh from the store at call time.


    // ── Binary chunk handler ──────────────────────────────────────────────────

    const handleBinaryChunk = useCallback(async (id, data) => {
        const state = useTransferStore.getState().transfers[id];
        if (!state) return;

        const { chunkStore, metadata, strategy, sessionKey } = state;
        const totalChunks = Math.ceil(metadata.size / transferLogic.CHUNK_SIZE);

        const result = await transferLogic.receiveChunk(data, chunkStore, {
            totalChunks,
            decryptChunk: sessionKey ? (chunk) => decryptChunk(chunk, sessionKey) : null
        });

        if (strategy.writer) {
            let nextChunkToWrite = state.nextChunkToWrite || 0;
            // BUG-04 + BUG-09 fix: use LOCAL cumulative variables instead of re-reading stale
            // state on every iteration. state.bytesReceived / state.chunksReceived never update
            // inside the loop because Zustand state is read once before the loop starts.
            let cumulativeBytes = state.bytesReceived;
            let cumulativeChunks = state.chunksReceived;
            let cumulativeSamples = [...state.speedSamples];

            while (chunkStore[nextChunkToWrite]) {
                const rawChunk = chunkStore[nextChunkToWrite];

                try {
                    await strategy.writer.write(new Uint8Array(rawChunk));
                } catch (err) {
                    console.error('Data writing error:', err);
                    updateTransfer(id, { status: 'Write Error' });
                    return;
                }

                cumulativeBytes += rawChunk.byteLength;
                cumulativeChunks += 1;
                chunkStore[nextChunkToWrite] = null;
                nextChunkToWrite++;

                cumulativeSamples = [...cumulativeSamples, { bytes: cumulativeBytes, time: Date.now() }];
                if (cumulativeSamples.length > 50) cumulativeSamples.shift();

                const stats = transferLogic.calculateProgress(
                    cumulativeBytes,
                    metadata.size,
                    state.startTime,
                    cumulativeSamples
                );

                updateTransfer(id, {
                    nextChunkToWrite,
                    bytesReceived: cumulativeBytes,
                    chunksReceived: cumulativeChunks,
                    speedSamples: cumulativeSamples,
                    progressStats: stats
                });

                _updateGlobalMetrics();

                if (cumulativeChunks === totalChunks) {
                    updateTransfer(id, { status: 'Done' });
                    await strategy.writer.close().catch(console.error);
                }
            }
        } else {
            // BUG-04 & BUG-09 fix: use local cumulative variables like the writer branch does
            let cumulativeBytes = state.bytesReceived;
            let cumulativeChunks = state.chunksReceived;
            let cumulativeSamples = [...state.speedSamples];

            const rawChunk = chunkStore[result.index];
            cumulativeBytes += rawChunk.byteLength;
            cumulativeChunks += 1;

            cumulativeSamples = [...cumulativeSamples, { bytes: cumulativeBytes, time: Date.now() }];
            if (cumulativeSamples.length > 50) cumulativeSamples.shift();

            const stats = transferLogic.calculateProgress(cumulativeBytes, metadata.size, state.startTime, cumulativeSamples);

            updateTransfer(id, {
                bytesReceived: cumulativeBytes,
                chunksReceived: cumulativeChunks,
                speedSamples: cumulativeSamples,
                progressStats: stats
            });

            _updateGlobalMetrics();

            if (cumulativeChunks === totalChunks) {
                updateTransfer(id, { status: 'Done' });
                const blob = await transferLogic.reassembleChunks(chunkStore, totalChunks, metadata.mimeType);
                transferLogic.triggerDownloadFromBlob(blob, metadata.name);
            }
        }
    }, [updateTransfer]);


    // ── Peer handler attachment ───────────────────────────────────────────────

    /**
     * Attach all DataChannel and connection-state handlers to a PeerConnection.
     *
     * @param {import('../core/peer').PeerConnection} pc
     * @param {string} password - Room password (may be empty string)
     * @param {Function} onFileOffer - (id, name, size) => void — called to show modal
     */
    const attachPeerHandlers = useCallback((pc, password, onFileOffer) => {
        pc.onConnectionStateChange = (connectionState) => {
            // FIX: onConnectionStateChange receives the state string, not the event object
            if (connectionState === 'connected') {
                setStatus('connected');
            } else if (connectionState === 'disconnected' || connectionState === 'failed') {
                setStatus('failed');
            }
        };

        pc.onControlChannelOpen = () => {
            setStatus('connected');
        };

        pc.onControlMessage = async (event) => {
            if (typeof event.data === 'string') {
                // FIX-A: pass onFileOffer so handleControlMessage can signal the UI
                // instead of using window.confirm
                await handleControlMessage(JSON.parse(event.data), password, onFileOffer);
            }
        };

        pc.onTransferChannelOpen = (transferId, channel) => {
            channel.onmessage = async (event) => {
                try {
                    await handleBinaryChunk(transferId, event.data);
                } catch (err) {
                    console.error("Failed to process chunk:", err);
                    updateTransfer(transferId, { status: 'Decryption Error' });
                    channel.close();
                }
            };
        };
    }, [handleControlMessage, handleBinaryChunk, setStatus, updateTransfer]);


    // ── File selection (sender side) ──────────────────────────────────────────

    const handleFileSelection = useCallback(async (files, password) => {
        // FIX-B: read peerConn from store at call time
        const peerConn = useRoomStore.getState().peerConn;
        if (!peerConn || (peerConn.iceConnectionState !== 'connected' && peerConn.iceConnectionState !== 'completed')) {
            alert('Wait for the peer to connect before selecting a file.');
            return;
        }

        for (let file of files) {
            const id = uuidv4();
            let sessionSalt = null;
            let sessionKey = null;

            if (password) {
                sessionSalt = generateSalt();
                sessionKey = await deriveKey(password, sessionSalt);
            }

            addTransfer(id, {
                role: 'sending',
                file,
                metadata: { id, name: file.name, size: file.size, mimeType: file.type },
                status: 'Waiting',
                sessionKey,
                speedSamples: [],
                startTime: 0,
                bytesSent: 0
            });

            peerConn.controlChannel.send(JSON.stringify({
                type: 'file-metadata',
                id,
                name: file.name,
                size: file.size,
                mimeType: file.type,
                salt: sessionSalt ? saltToBase64(sessionSalt) : null
            }));
        }
    }, [addTransfer]);


    // ── Cancel ────────────────────────────────────────────────────────────────

    const cancelTransfer = useCallback((id) => {
        // FIX-B: read peerConn from store at call time
        const peerConn = useRoomStore.getState().peerConn;
        const state = useTransferStore.getState().transfers[id];
        if (state) {
            updateTransfer(id, { status: 'Cancelled', cancelled: true });
            peerConn?.controlChannel?.send(JSON.stringify({ type: 'transfer-cancelled', id }));
        }
    }, [updateTransfer]);

    return { attachPeerHandlers, handleFileSelection, cancelTransfer, acceptTransfer, rejectTransfer };
}


// ── Module-level helpers ──────────────────────────────────────────────────────

function _updateGlobalMetrics() {
    let totalSent = 0;
    let totalReceived = 0;
    let uploadSpeed = 0;
    let downloadSpeed = 0;

    const now = Date.now();
    const windowMs = 1000;

    const transfers = useTransferStore.getState().transfers;

    for (const [id, state] of Object.entries(transfers)) {
        if (state.role === 'sending') {
            totalSent += (state.bytesSent || 0);
            const recentSamples = (state.speedSamples || []).filter(s => now - s.time < windowMs);
            if (recentSamples.length > 1) {
                uploadSpeed += Math.max(0, recentSamples[recentSamples.length - 1].bytes - recentSamples[0].bytes);
            }
        } else {
            totalReceived += (state.bytesReceived || 0);
            const recentSamples = (state.speedSamples || []).filter(s => now - s.time < windowMs);
            if (recentSamples.length > 1) {
                downloadSpeed += Math.max(0, recentSamples[recentSamples.length - 1].bytes - recentSamples[0].bytes);
            }
        }
    }

    useTransferStore.getState().updateGlobalStats({
        totalSent,
        totalReceived,
        uploadSpeed,
        downloadSpeed
    });
}
