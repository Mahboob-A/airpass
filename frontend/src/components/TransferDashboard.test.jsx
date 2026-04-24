import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransferDashboard } from './TransferDashboard';

// Mock the store
const mockTransfers = {};
const mockGlobalStats = { totalSent: 0, totalReceived: 0, uploadSpeed: 0, downloadSpeed: 0 };

vi.mock('../store', () => ({
    useTransferStore: () => ({
        transfers: mockTransfers,
        globalStats: mockGlobalStats,
    }),
}));

describe('TransferDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders empty state when no transfers', () => {
        render(<TransferDashboard onCancelTransfer={vi.fn()} />);
        expect(screen.getByText('No active transfers')).toBeInTheDocument();
    });

    it('renders global stats boxes', () => {
        render(<TransferDashboard onCancelTransfer={vi.fn()} />);
        expect(screen.getByText('Total Sent')).toBeInTheDocument();
        expect(screen.getByText('Total Received')).toBeInTheDocument();
        expect(screen.getByText('Upload Speed')).toBeInTheDocument();
        expect(screen.getByText('Download Speed')).toBeInTheDocument();
    });

    it('renders Active Transfers header', () => {
        render(<TransferDashboard onCancelTransfer={vi.fn()} />);
        expect(screen.getByText('Active Transfers')).toBeInTheDocument();
    });

    it('renders stat boxes with values', () => {
        render(<TransferDashboard onCancelTransfer={vi.fn()} />);
        // Check stat boxes are rendered
        expect(screen.getAllByText('0 B').length).toBeGreaterThan(0);
    });
});