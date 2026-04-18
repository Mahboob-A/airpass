import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Send, Lock, Loader2 } from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { BACKEND_ORIGIN } from '../core/config';
import { useRoomStore } from '../store';

export function LandingPage() {
    const navigate = useNavigate();
    const { setPassword } = useRoomStore();
    const [joinCode, setJoinCode] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCreateRoom = (e) => {
        e.preventDefault();
        // BUG-05: store password in Zustand — never put it in the URL
        setPassword(createPassword);
        navigate('/room/new?action=create');
    };

    const handleJoinRoom = async (e) => {
        e.preventDefault();
        const code = joinCode.trim().toUpperCase();
        if (code.length !== 6) return;

        try {
            setIsLoading(true);
            setError('');

            const res = await fetch(`${BACKEND_ORIGIN}/api/room/${code}`);
            if (!res.ok) {
                if (res.status === 404) throw new Error('Room not found or expired.');
                throw new Error('Server connection error.');
            }

            const data = await res.json();
            if (data.full) {
                throw new Error('Room is already full. Maximum 2 peers allowed.');
            }

            navigate(`/room/${code}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center"
            >
                <div className="space-y-6">
                    <div>
                        <h1 className="text-5xl md:text-7xl font-display font-bold bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent mb-4">
                            AirPass
                        </h1>
                        <p className="text-xl text-zinc-400 font-medium">
                            Direct, secure, peer-to-peer file transfer. No servers keep your data.
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 text-sm text-zinc-500">
                        <div className="flex items-center gap-3">
                            <Shield className="w-5 h-5 text-emerald-500" />
                            <span>End-to-end encrypted transfers</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Send className="w-5 h-5 text-primary" />
                            <span>No file size limits</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Lock className="w-5 h-5 text-purple-500" />
                            <span>Optional password protection</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <Card>
                        <h2 className="text-2xl font-bold mb-2">Create a Room</h2>
                        <p className="text-zinc-400 mb-4 text-sm">Start a new secure session to share files.</p>
                        <form onSubmit={handleCreateRoom} className="space-y-4">
                            <Input
                                type="password"
                                placeholder="Optional password"
                                value={createPassword}
                                onChange={(e) => setCreatePassword(e.target.value)}
                                autoComplete="new-password"
                            />
                            <Button type="submit" className="w-full" size="lg">Create Room</Button>
                        </form>
                    </Card>

                    <Card>
                        <h2 className="text-2xl font-bold mb-2">Join a Room</h2>
                        <p className="text-zinc-400 mb-4 text-sm">Enter a 6-digit code to connect with a peer.</p>
                        <form onSubmit={handleJoinRoom} className="space-y-4">
                            <Input
                                type="text"
                                placeholder="Enter 6-digit code"
                                maxLength={6}
                                pattern="[a-zA-Z0-9]{6}"
                                required
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                autoComplete="off"
                            />
                            {error && <p className="text-red-500 text-sm">{error}</p>}
                            <Button type="submit" variant="secondary" className="w-full" size="lg" disabled={isLoading || joinCode.length !== 6}>
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Join Room'}
                            </Button>
                        </form>
                    </Card>
                </div>
            </motion.div>
        </div>
    );
}
