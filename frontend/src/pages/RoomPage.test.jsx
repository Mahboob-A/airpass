import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { RoomPage } from './RoomPage';

// Use vi.hoisted to properly hoist variables used in vi.mock
const { mockTransferStore, mockResetTransfer } = vi.hoisted(() => {
    const mockResetTransfer = vi.fn();
    const mockTransferStore = {
        reset: mockResetTransfer,
        transfers: {},
        globalStats: { totalSent: 0, totalReceived: 0, uploadSpeed: 0, downloadSpeed: 0 },
        getState: () => mockTransferStore,
    };
    return { mockTransferStore, mockResetTransfer };
});

// Store state - will be updated per test
let storeState = {
    status: 'initializing',
    joinCode: '',
    shareUrl: '',
    password: '',
};

// Mock functions
const mockSetStatus = vi.fn();
const mockSetRoomInfo = vi.fn();
const mockSetSignaling = vi.fn();
const mockSetPeerConn = vi.fn();
const mockResetRoom = vi.fn();

// Mock react-router-dom with partial mock
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useParams: () => ({ code: 'TESTCODE' }),
        useSearchParams: () => [new URLSearchParams('action=create')],
    };
});

// Mock store - create a callable function with getState as a property
vi.mock('../store', () => {
    const mockTransferStoreHook = () => mockTransferStore;
    mockTransferStoreHook.getState = () => mockTransferStore;
    
    return {
        useRoomStore: () => ({
            ...storeState,
            setStatus: mockSetStatus,
            setRoomInfo: mockSetRoomInfo,
            setSignaling: mockSetSignaling,
            setPeerConn: mockSetPeerConn,
            reset: mockResetRoom,
        }),
        useTransferStore: mockTransferStoreHook,
    };
});

// Mock core modules
vi.mock('../core/config', () => ({
    WS_ORIGIN: 'ws://localhost:8000',
}));

vi.mock('../core/signaling', () => ({
    SignalingClient: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
    })),
}));

vi.mock('../core/peer', () => ({
    PeerConnection: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        close: vi.fn(),
    })),
    fetchIceConfig: vi.fn().mockResolvedValue({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    }),
}));

vi.mock('../hooks/useTransferLogic', () => ({
    useTransferLogic: vi.fn(() => ({
        attachPeerHandlers: vi.fn(),
        handleFileSelection: vi.fn(),
        cancelTransfer: vi.fn(),
    })),
}));

// Mock TransferDashboard since it uses useTransferStore
vi.mock('../components/TransferDashboard', () => ({
    TransferDashboard: () => <div data-testid="transfer-dashboard">Transfer Dashboard</div>,
}));

const renderRoomPage = (status = 'waiting', code = 'ABC123', shareUrl = 'http://localhost:3000/room/ABC123', password = '') => {
    storeState = { status, joinCode: code, shareUrl, password };
    
    return render(
        <BrowserRouter>
            <RoomPage />
        </BrowserRouter>
    );
};

describe('RoomPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('UI Elements', () => {
        it('renders header with app name', () => {
            renderRoomPage('waiting');
            expect(screen.getByText('AirPass')).toBeInTheDocument();
        });

        it('renders leave room button', () => {
            renderRoomPage('waiting');
            expect(screen.getByRole('button', { name: /leave room/i })).toBeInTheDocument();
        });
    });

    describe('Waiting State', () => {
        it('shows waiting for peer message', () => {
            renderRoomPage('waiting', 'XYZ789');
            expect(screen.getByText('Waiting for peer...')).toBeInTheDocument();
        });

        it('displays the room code', () => {
            renderRoomPage('waiting', 'XYZ789');
            expect(screen.getByText('XYZ789')).toBeInTheDocument();
        });

        it('shows copy link button', () => {
            renderRoomPage('waiting');
            expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
        });

        it('shows QR code button', () => {
            renderRoomPage('waiting');
            expect(screen.getByRole('button', { name: /qr code/i })).toBeInTheDocument();
        });
    });

    describe('Connecting State', () => {
        it('shows connecting message', () => {
            renderRoomPage('connecting');
            expect(screen.getByText('Establishing secure connection...')).toBeInTheDocument();
        });

        it('shows spinner when connecting', () => {
            renderRoomPage('connecting');
            expect(document.querySelector('.animate-spin')).toBeTruthy();
        });
    });

    describe('Failed State', () => {
        it('shows connection failed message', () => {
            renderRoomPage('failed');
            expect(screen.getByText('Connection Failed')).toBeInTheDocument();
        });

        it('shows error description', () => {
            renderRoomPage('failed');
            expect(screen.getByText(/peer connection was lost/i)).toBeInTheDocument();
        });

        it('shows retry connection button', () => {
            renderRoomPage('failed');
            expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
        });
    });

    describe('Status Indicator', () => {
        it('shows waiting status', () => {
            renderRoomPage('waiting');
            expect(screen.getByText(/^waiting$/i)).toBeInTheDocument();
        });

        it('shows connecting status', () => {
            renderRoomPage('connecting');
            expect(screen.getByText(/^connecting$/i)).toBeInTheDocument();
        });

        it('shows connected status', () => {
            renderRoomPage('connected');
            expect(screen.getByText(/^connected$/i)).toBeInTheDocument();
        });

        it('shows failed status', () => {
            renderRoomPage('failed');
            expect(screen.getByText(/^failed$/i)).toBeInTheDocument();
        });
    });

    describe('Password Protection', () => {
        it('shows E2E encrypted indicator when password is set', () => {
            renderRoomPage('waiting', 'ABC123', 'http://localhost:3000/room/ABC123', 'secret');
            expect(screen.getByText(/e2e encrypted/i)).toBeInTheDocument();
        });

        it('does not show E2E indicator when no password', () => {
            renderRoomPage('waiting', 'ABC123', 'http://localhost:3000/room/ABC123', '');
            expect(screen.queryByText(/e2e encrypted/i)).not.toBeInTheDocument();
        });
    });

    describe('Status Dot Colors', () => {
        it('shows yellow dot for waiting status', () => {
            renderRoomPage('waiting');
            expect(document.querySelector('.bg-yellow-400')).toBeTruthy();
        });

        it('shows emerald dot for connected status', () => {
            renderRoomPage('connected');
            expect(document.querySelector('.bg-emerald-500')).toBeTruthy();
        });

        it('shows red dot for failed status', () => {
            renderRoomPage('failed');
            expect(document.querySelector('.bg-red-500')).toBeTruthy();
        });
    });
});
