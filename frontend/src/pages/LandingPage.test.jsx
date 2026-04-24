import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LandingPage } from './LandingPage';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock zustand store
const mockSetPassword = vi.fn();
vi.mock('../store', () => ({
    useRoomStore: () => ({
        setPassword: mockSetPassword,
    }),
}));

// Mock config
vi.mock('../core/config', () => ({
    BACKEND_ORIGIN: 'http://localhost:8000',
}));

const renderLandingPage = () => {
    return render(
        <BrowserRouter>
            <LandingPage />
        </BrowserRouter>
    );
};

describe('LandingPage', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
        mockSetPassword.mockClear();
        global.fetch?.mockReset?.();
    });

    describe('Create Room Form', () => {
        it('renders create room form', () => {
            renderLandingPage();
            expect(screen.getByText('Create a Room')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Optional password')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /create room/i })).toBeInTheDocument();
        });

        it('navigates to create room URL when form is submitted', async () => {
            renderLandingPage();
            
            const passwordInput = screen.getByPlaceholderText('Optional password');
            fireEvent.change(passwordInput, { target: { value: 'testpass123' } });
            
            const createButton = screen.getByRole('button', { name: /create room/i });
            fireEvent.click(createButton);
            
            expect(mockSetPassword).toHaveBeenCalledWith('testpass123');
            expect(mockNavigate).toHaveBeenCalledWith('/room/new?action=create');
        });

        it('navigates without password when password field is empty', () => {
            renderLandingPage();
            
            const createButton = screen.getByRole('button', { name: /create room/i });
            fireEvent.click(createButton);
            
            expect(mockSetPassword).toHaveBeenCalledWith('');
            expect(mockNavigate).toHaveBeenCalledWith('/room/new?action=create');
        });
    });

    describe('Join Room Form', () => {
        it('renders join room form', () => {
            renderLandingPage();
            expect(screen.getByText('Join a Room')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Enter 6-digit code')).toBeInTheDocument();
        });

        it('converts input to uppercase', () => {
            renderLandingPage();
            
            const codeInput = screen.getByPlaceholderText('Enter 6-digit code');
            fireEvent.change(codeInput, { target: { value: 'abc123' } });
            
            expect(codeInput.value).toBe('ABC123');
        });

        it('join button is disabled when code is not 6 characters', () => {
            renderLandingPage();
            
            const joinButton = screen.getByRole('button', { name: /join room/i });
            expect(joinButton).toBeDisabled();
            
            const codeInput = screen.getByPlaceholderText('Enter 6-digit code');
            fireEvent.change(codeInput, { target: { value: 'ABC' } });
            expect(joinButton).toBeDisabled();
        });

        it('join button is enabled when code is exactly 6 characters', () => {
            renderLandingPage();
            
            const codeInput = screen.getByPlaceholderText('Enter 6-digit code');
            fireEvent.change(codeInput, { target: { value: 'ABCDEF' } });
            
            const joinButton = screen.getByRole('button', { name: /join room/i });
            expect(joinButton).not.toBeDisabled();
        });

        it('shows error when room not found', async () => {
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                    status: 404,
                })
            );
            
            renderLandingPage();
            
            const codeInput = screen.getByPlaceholderText('Enter 6-digit code');
            fireEvent.change(codeInput, { target: { value: 'ABCDEF' } });
            
            const joinButton = screen.getByRole('button', { name: /join room/i });
            fireEvent.click(joinButton);
            
            await waitFor(() => {
                expect(screen.getByText('Room not found or expired.')).toBeInTheDocument();
            });
        });

        it('shows error when room is full', async () => {
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ full: true }),
                })
            );
            
            renderLandingPage();
            
            const codeInput = screen.getByPlaceholderText('Enter 6-digit code');
            fireEvent.change(codeInput, { target: { value: 'ABCDEF' } });
            
            const joinButton = screen.getByRole('button', { name: /join room/i });
            fireEvent.click(joinButton);
            
            await waitFor(() => {
                expect(screen.getByText('Room is already full. Maximum 2 peers allowed.')).toBeInTheDocument();
            });
        });

        it('navigates to room when join is successful', async () => {
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ full: false }),
                })
            );
            
            renderLandingPage();
            
            const codeInput = screen.getByPlaceholderText('Enter 6-digit code');
            fireEvent.change(codeInput, { target: { value: 'ABCDEF' } });
            
            const joinButton = screen.getByRole('button', { name: /join room/i });
            fireEvent.click(joinButton);
            
            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/room/ABCDEF');
            });
        });

        it('shows error on server connection failure', async () => {
            global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
            
            renderLandingPage();
            
            const codeInput = screen.getByPlaceholderText('Enter 6-digit code');
            fireEvent.change(codeInput, { target: { value: 'ABCDEF' } });
            
            const joinButton = screen.getByRole('button', { name: /join room/i });
            fireEvent.click(joinButton);
            
            await waitFor(() => {
                expect(screen.getByText('Network error')).toBeInTheDocument();
            });
        });
    });

    describe('Page Content', () => {
        it('displays app title and tagline', () => {
            renderLandingPage();
            expect(screen.getByText('AirPass')).toBeInTheDocument();
            expect(screen.getByText(/Direct, secure, peer-to-peer file transfer/i)).toBeInTheDocument();
        });

        it('displays feature list', () => {
            renderLandingPage();
            expect(screen.getByText(/End-to-end encrypted transfers/i)).toBeInTheDocument();
            expect(screen.getByText(/No file size limits/i)).toBeInTheDocument();
            expect(screen.getByText(/Optional password protection/i)).toBeInTheDocument();
        });
    });
});
