import { useCallback } from 'react';
import { useRoomStore, useTransferStore } from '../store';
import { generateSalt, deriveKey, saltToBase64, saltFromBase64, encryptChunk, decryptChunk } from '../core/crypto';
import { v4 as uuidv4 } from 'uuid';
import * as transferLogic from '../core/transfer';
import { formatBytes } from '../lib/format'; // BUG-13: use canonical copy, not a local duplicate

export function useTransferLogic() {
    // BUG-08: removed confusing `joinCode: roomPassword` alias — joinCode is the room code, not the password
    const { peerConn, setStatus } = useRoomStore();
    const { addTransfer, updateTransfer, removeTransfer, updateGlobalStats, transfers } = useTransferStore();

    // Note: roomPassword is conceptually different from joinCode but we stored it in the original `roomPassword` var.
    // Actually, we need to pass the password down. In RoomPage, password is searchParams.get('password'). 
    // We can add password to the room store.

    const handleControlMessage = useCallback(async (msg, password) => {
        if (msg.type === 'file-metadata') {
            const { id, name, size, mimeType, salt } = msg;

            let sessionKey = null;
            if (salt) {
                const storePassword = useRoomStore.getState().password;
                let currentPass = password || storePassword;

                // If it's a password-protected file but we don't have the password
                if (!currentPass) {
                    currentPass = window.prompt(`File "${name}" is encrypted. Please enter the room password to decrypt it:`);
                    if (!currentPass) {
                        peerConn.controlChannel.send(JSON.stringify({ type: 'file-reject', id }));
                        return;
                    }
                }

                try {
                    const sessionSalt = saltFromBase64(salt);
                    sessionKey = await deriveKey(currentPass, sessionSalt);
                } catch (err) {
                    console.error('Failed to establish encryption session key.', err);
                    alert(`Failed to decrypt ${name}. Incorrect password.`);
                    peerConn.controlChannel.send(JSON.stringify({ type: 'file-reject', id }));
                    return;
                }
            }

            addTransfer(id, {
                role: 'receiving',
                metadata: { id, name, size, mimeType },
                status: 'Waiting',
                strategy: null,
                sessionKey,
                chunkStore: [],
                chunksReceived: 0,
                bytesReceived: 0,
                startTime: 0,
                speedSamples: []
            });

            // Automatically assume we ask for acceptance via UI, but for now let's auto-accept 
            // (or we can add state 'Pending Accept' and wait for user, but to keep it simple let's auto accept and stream)

            const proceed = window.confirm(`Accept file: ${name} (${formatBytes(size)})?`);
            if (proceed) {
                const strategy = await transferLogic.selectDownloadStrategy(name, size);

                if (strategy.showWarning) {
                    const warnProceed = window.confirm(strategy.warningMessage);
                    if (!warnProceed) {
                        updateTransfer(id, { status: 'Rejected' });
                        peerConn.controlChannel.send(JSON.stringify({ type: 'file-reject', id }));
                        return;
                    }
                }

                updateTransfer(id, { strategy, startTime: Date.now(), status: 'Transferring...' });
                peerConn.controlChannel.send(JSON.stringify({ type: 'file-accept', id }));
            } else {
                updateTransfer(id, { status: 'Rejected' });
                peerConn.controlChannel.send(JSON.stringify({ type: 'file-reject', id }));
            }
        }
        else if (msg.type === 'file-accept') {
            const id = msg.id;
            const state = useTransferStore.getState().transfers[id];
            if (!state || !state.file) return;

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
    }, [peerConn, addTransfer, updateTransfer]);


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
            const chunksReceived = state.chunksReceived + 1;
            const rawChunk = chunkStore[result.index];
            const newBytesReceived = state.bytesReceived + rawChunk.byteLength;

            const speedSamples = [...state.speedSamples, { bytes: newBytesReceived, time: Date.now() }];
            if (speedSamples.length > 50) speedSamples.shift();

            const stats = transferLogic.calculateProgress(newBytesReceived, metadata.size, state.startTime, speedSamples);

            updateTransfer(id, {
                bytesReceived: newBytesReceived,
                chunksReceived,
                speedSamples,
                progressStats: stats
            });

            _updateGlobalMetrics();

            if (chunksReceived === totalChunks) {
                updateTransfer(id, { status: 'Done' });
                const blob = await transferLogic.reassembleChunks(chunkStore, totalChunks, metadata.mimeType);
                transferLogic.triggerDownloadFromBlob(blob, metadata.name);
            }
        }
    }, [updateTransfer]);

    const attachPeerHandlers = useCallback((pc, password) => {
        pc.onConnectionStateChange = (state) => {
            if (state === 'connected') {
                setStatus('connected');
            } else if (state === 'disconnected' || state === 'failed') {
                setStatus('failed');
            }
        };

        pc.onControlChannelOpen = () => {
            setStatus('connected');
        };

        pc.onControlMessage = async (event) => {
            if (typeof event.data === 'string') {
                await handleControlMessage(JSON.parse(event.data), password);
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


    const handleFileSelection = useCallback(async (files, password) => {
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
    }, [peerConn, addTransfer]);


    const cancelTransfer = useCallback((id) => {
        const state = useTransferStore.getState().transfers[id];
        if (state) {
            updateTransfer(id, { status: 'Cancelled', cancelled: true });
            peerConn?.controlChannel?.send(JSON.stringify({ type: 'transfer-cancelled', id }));
        }
    }, [peerConn, updateTransfer]);

    return { attachPeerHandlers, handleFileSelection, cancelTransfer };
}

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


