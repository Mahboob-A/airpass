import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useRoomStore, useTransferStore } from '../store';
import { WS_ORIGIN } from '../core/config';
import { SignalingClient } from '../core/signaling';
import { PeerConnection, fetchIceConfig } from '../core/peer';
import { useTransferLogic } from '../hooks/useTransferLogic';
import { Card, Button } from '../components/ui';
import { FileDropZone } from '../components/FileDropZone';
import { TransferDashboard } from '../components/TransferDashboard';
import { Loader2, Copy, QrCode, ShieldAlert, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '../lib/utils';

export function RoomPage() {
    const { code } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const action = searchParams.get('action');

    // BUG-05: password comes from the Zustand store — NOT from the URL
    const { status, setStatus, setRoomInfo, setSignaling, setPeerConn, reset: resetRoom, joinCode, shareUrl, password } = useRoomStore();
    const { attachPeerHandlers, handleFileSelection, cancelTransfer } = useTransferLogic();

    const [showQr, setShowQr] = useState(false);

    useEffect(() => {
        let signalingClient;
        let pc;
        let isInitiator = action === 'create';
        let currentPassword = password;
        let iceConfig = null;
        let isCancelled = false; // BUG-14: Prevent orphan connections during StrictMode

        const init = async () => {
            setStatus('connecting');

            try {
                iceConfig = await fetchIceConfig();
                if (isCancelled) return; // Prevent orphan socket creation after unmount

                const wsUrl = `${WS_ORIGIN}/ws/p2p`;
                signalingClient = new SignalingClient(wsUrl);
                setSignaling(signalingClient);

                signalingClient.on('open', () => {
                    if (isInitiator) {
                        const createMsg = { type: 'create-room' };
                        if (currentPassword) createMsg.password = currentPassword;
                        signalingClient.send(createMsg);
                    } else if (code && code !== 'new') {
                        signalingClient.send({ type: 'join-room', code });
                    }
                });

                signalingClient.on('room-created', (msg) => {
                    const frontendShareUrl = `${window.location.origin}/room/${msg.code}`;
                    setRoomInfo(msg.code, frontendShareUrl);
                    setStatus('waiting');

                    // BUG-01 fix refined: update URL using history API to prevent React Router from unmounting and remounting the component
                    window.history.replaceState(null, '', `/room/${msg.code}`);

                    pc = new PeerConnection(signalingClient, { role: 'initiator', iceConfig });
                    setPeerConn(pc);
                    attachPeerHandlers(pc, currentPassword);
                });

                signalingClient.on('room-joined', async (msg) => {
                    const currentUrl = window.location.href.split('?')[0];
                    setRoomInfo(code, currentUrl);

                    if (msg.passwordRequired) {
                        const pwd = prompt('This room is protected by a password. Please enter it:');
                        if (!pwd) {
                            navigate('/');
                            return;
                        }
                        currentPassword = pwd;
                        signalingClient.send({ type: 'verify-password', password: pwd });
                    } else {
                        setStatus('waiting');
                        pc = new PeerConnection(signalingClient, { role: 'responder', iceConfig });
                        setPeerConn(pc);
                        attachPeerHandlers(pc, currentPassword);
                    }
                });

                signalingClient.on('password-result', (msg) => {
                    if (msg.valid) {
                        setStatus('waiting');
                        pc = new PeerConnection(signalingClient, { role: 'responder', iceConfig });
                        setPeerConn(pc);
                        attachPeerHandlers(pc, currentPassword);
                    } else {
                        alert('Incorrect password.');
                        navigate('/');
                    }
                });

                signalingClient.on('peer-joined', () => {
                    setStatus('connecting');
                    if (pc) pc.createOffer();
                });

                signalingClient.on('signal', (payload) => {
                    if (pc) pc.handleSignal(payload);
                });

                signalingClient.on('peer-left', () => {
                    setStatus('failed');
                    alert('The other peer left the room.');
                    navigate('/');
                });

                signalingClient.on('error', (err) => {
                    setStatus('failed');
                    console.error(err);
                });

                signalingClient.on('close', () => {
                    const s = useRoomStore.getState().status;
                    if (s !== 'connected') {
                        setStatus('failed');
                    }
                });

            } catch (e) {
                console.error(e);
                setStatus('failed');
            }
        };

        init();

        return () => {
            isCancelled = true;
            if (pc) pc.close();
            // BUG-02 fix: use the public close() API — private _ws is not accessible via .ws
            signalingClient?.close();
            resetRoom();
            useTransferStore.getState().reset(); // Clear old transfers
        };
        // Exclude attachPeerHandlers to avoid re-triggering dependency cycles if it changes, though it's memoized
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, action, navigate]);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
        } catch (e) { }
    };

    const onFilesSelected = (files) => {
        handleFileSelection(files, password);
    };

    return (
        <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
            <header className="w-full max-w-5xl mb-8 flex justify-between items-center bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800/60 backdrop-blur-md">
                <div>
                    <h1 className="text-2xl font-display font-bold text-primary">AirPass</h1>
                    <div className="flex items-center gap-2 text-sm text-zinc-400 mt-1">
                        <span className={cn("w-2 h-2 rounded-full", {
                            'bg-yellow-400 animate-pulse': status === 'connecting' || status === 'waiting',
                            'bg-emerald-500': status === 'connected',
                            'bg-red-500': status === 'failed',
                            'bg-zinc-500': status === 'initializing',
                        })} />
                        <span className="capitalize">{status}</span>
                        {password ? (
                            <span className="ml-2 flex items-center text-purple-400 text-xs" title="Password Protected">
                                <ShieldCheck className="w-3 h-3 mr-1" /> E2E Encrypted
                            </span>
                        ) : null}
                    </div>
                </div>

                <Button variant="danger" size="sm" onClick={() => navigate('/')}>
                    Leave Room
                </Button>
            </header>

            {status === 'waiting' && joinCode && (
                <Card className="w-full max-w-md text-center py-10 mt-8 mx-auto relative overflow-hidden group border-primary/20 shadow-[0_0_40px_rgba(14,165,233,0.1)]">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-emerald-500/10 pointer-events-none" />
                    <h2 className="text-zinc-400 font-medium mb-4 relative z-10">Waiting for peer...</h2>
                    <div className="text-7xl font-mono tracking-widest font-bold text-white mb-6 relative z-10 py-4 my-2">
                        {joinCode}
                    </div>

                    <div className="flex justify-center gap-4 relative z-10">
                        <Button variant="secondary" onClick={copyToClipboard} className="gap-2 bg-zinc-950/50">
                            <Copy className="w-4 h-4" /> Copy Link
                        </Button>
                        <Button variant="secondary" onClick={() => setShowQr(!showQr)} className="gap-2 bg-zinc-950/50">
                            <QrCode className="w-4 h-4" /> QR Code
                        </Button>
                    </div>

                    {showQr && (
                        <div className="mt-8 bg-white p-4 rounded-xl inline-block relative z-10">
                            <QRCodeSVG value={shareUrl} size={150} />
                        </div>
                    )}
                </Card>
            )}

            {status === 'connecting' && (
                <div className="w-full max-w-md mt-16 flex flex-col items-center text-zinc-400">
                    <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                    <p>Establishing secure connection...</p>
                </div>
            )}

            {status === 'connected' && (
                <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_2fr] gap-6 items-start">
                    <FileDropZone onFilesSelected={onFilesSelected} disabled={status !== 'connected'} />
                    <div className="w-full min-w-0">
                        <TransferDashboard onCancelTransfer={cancelTransfer} />
                    </div>
                </div>
            )}

            {status === 'failed' && (
                <Card className="w-full max-w-md text-center py-10 mt-8 mx-auto border-red-500/20">
                    <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-zinc-100 mb-2">Connection Failed</h2>
                    <p className="text-zinc-400 mb-6 font-medium text-sm">
                        The peer connection was lost, rejected, or expired.
                    </p>
                    <Button onClick={() => window.location.reload()}>Retry Connection</Button>
                </Card>
            )}
        </div>
    );
}
