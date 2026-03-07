/**
 * Application entry point for index.html (Landing Page)
 */
import { BACKEND_ORIGIN } from './config.js'

document.addEventListener('DOMContentLoaded', () => {
    const btnCreate = document.getElementById('btn-create-room');
    const joinForm = document.getElementById('join-form');
    const inputCode = document.getElementById('input-room-code');
    const status = document.getElementById('status');

    // ── Create Room ──────────────────────────────────────────────────
    btnCreate.addEventListener('click', () => {
        const pwd = document.getElementById('input-create-password')?.value.trim();
        let url = '/room.html?action=create';
        if (pwd) url += `&password=${encodeURIComponent(pwd)}`;
        window.location.href = url;
    });

    // ── Join Room ────────────────────────────────────────────────────
    joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = inputCode.value.trim().toUpperCase();
        if (code.length !== 6) return;

        try {
            status.textContent = 'Checking room...';
            status.classList.remove('hidden');
            status.className = 'status status-connecting';

            // Validate the code with the backend HTTP API before navigating
            const res = await fetch(`${BACKEND_ORIGIN}/api/room/${code}`);

            if (!res.ok) {
                if (res.status === 404) throw new Error('Room not found or expired.');
                throw new Error('Server connection error.');
            }

            const data = await res.json();

            if (data.full) {
                throw new Error('Room is already full. Maximum 2 peers allowed.');
            }

            // Successfully found, redirect to room page
            window.location.href = `/room.html?code=${code}`;

        } catch (err) {
            status.textContent = err.message;
            status.className = 'status status-failed';
        }
    });

    // Auto-uppercase room code input
    inputCode.addEventListener('input', () => {
        inputCode.value = inputCode.value.toUpperCase();
    });
});
