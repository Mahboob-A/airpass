import React from 'react';
import { useTransferStore } from '../store';
import { Card, Button } from './ui';
import { formatBytes, formatTime } from '../lib/format';
import { XCircle, CheckCircle, Clock, FileDown, FileUp, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function TransferDashboard({ onCancelTransfer }) {
    const { transfers, globalStats } = useTransferStore();
    const transferList = Object.entries(transfers);

    const renderProgressBar = (transfer) => {
        const isDone = transfer.status === 'Done';
        const isError = transfer.status.includes('Error') || transfer.status === 'Cancelled' || transfer.status === 'Rejected';
        const progress = transfer.progressStats?.percent || 0;

        let colorClass = 'bg-primary';
        if (isDone) colorClass = 'bg-emerald-500';
        if (isError) colorClass = 'bg-red-500';

        return (
            <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-3 overflow-hidden">
                <div
                    className={`h-1.5 rounded-full transition-all duration-300 ease-out ${colorClass}`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        );
    };

    const renderStatusIcon = (status) => {
        switch (status) {
            case 'Done': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'Cancelled':
            case 'Rejected':
            case 'Write Error':
            case 'Upload Error':
            case 'Decryption Error':
                return <XCircle className="w-5 h-5 text-red-500" />;
            case 'Transferring...':
                return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
            default:
                return <Clock className="w-5 h-5 text-zinc-500" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Global Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatBox label="Total Sent" value={formatBytes(globalStats.totalSent)} />
                <StatBox label="Total Received" value={formatBytes(globalStats.totalReceived)} />
                <StatBox label="Upload Speed" value={`${formatBytes(globalStats.uploadSpeed)}/s`} />
                <StatBox label="Download Speed" value={`${formatBytes(globalStats.downloadSpeed)}/s`} />
            </div>

            <Card className="flex flex-col min-h-[300px]">
                <h3 className="text-lg font-bold mb-4 border-b border-zinc-800 pb-2">Active Transfers</h3>

                {transferList.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                        No active transfers
                    </div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence>
                            {transferList.map(([id, transfer]) => (
                                <motion.div
                                    key={id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-zinc-800 rounded-md shrink-0">
                                                {transfer.role === 'sending' ? (
                                                    <FileUp className="w-4 h-4 text-emerald-400" />
                                                ) : (
                                                    <FileDown className="w-4 h-4 text-primary" />
                                                )}
                                            </div>
                                            <div className="truncate">
                                                <p className="font-medium text-sm text-zinc-200 truncate" title={transfer.metadata.name}>
                                                    {transfer.metadata.name}
                                                </p>
                                                <p className="text-xs text-zinc-500">
                                                    {formatBytes(transfer.metadata.size)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0 pl-4">
                                            <div className="text-right hidden sm:block">
                                                <p className="text-sm font-medium text-zinc-300">{transfer.status}</p>
                                                {transfer.status === 'Transferring...' && transfer.progressStats && (
                                                    <p className="text-xs text-zinc-500">
                                                        {/* BUG-03 fix: use humanEta/humanSpeed from calculateProgress() */}
                                                        {transfer.progressStats.humanEta ?? '—'} left • {transfer.progressStats.humanSpeed ?? '0 B/s'}
                                                    </p>
                                                )}
                                            </div>
                                            {renderStatusIcon(transfer.status)}

                                            {transfer.status === 'Transferring...' && (
                                                <button
                                                    onClick={() => onCancelTransfer(id)}
                                                    className="text-zinc-500 hover:text-red-400 transition-colors ml-2"
                                                    title="Cancel"
                                                >
                                                    <XCircle className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {renderProgressBar(transfer)}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </Card>
        </div>
    );
}

function StatBox({ label, value }) {
    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 backdrop-blur-sm">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{label}</p>
            <p className="text-lg font-mono font-semibold text-zinc-100 mt-1">{value}</p>
        </div>
    );
}
