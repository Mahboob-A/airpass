# AirPass

![Python](https://img.shields.io/badge/python-3.12-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-orange)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-yellow)
![License](https://img.shields.io/badge/license-MIT-green)

### The Problem
Traditional file sharing often requires uploading entire files to a central server, exposing your private data to third-party storage and slowing down the process with intermediary hops. This centralized approach creates unnecessary privacy risks and technical friction for users who just want to move data from point A to point B.

### The Solution
AirPass establishes a direct, ephemeral peer-to-peer conduit between two browsers using WebRTC, ensuring that your files never touch a server and remain completely private. By utilizing an in-memory signaling layer and end-to-end encryption, it provides a zero-knowledge transfer experience that vanishes the moment your session ends.

### Usage
To start sharing files immediately, simply visit the live application at:
**[airpass.mehboob.tech/](https://airpass.mehboob.tech/)**

---

### Core Features

#### Room & Session Management
- **One-Click Creation:** Start a transfer session instantly without filling out forms or creating accounts.
- **6-Digit Codes:** Simple, human-readable codes for easy verbal or text-based sharing.
- **Ephemeral Rooms:** Sessions automatically expire after 30 minutes or upon disconnection to ensure zero residual data.
- **QR Entry:** Scan a QR code on mobile devices to join a transfer session in seconds.

#### High-Performance Transfer
- **Direct WebRTC P2P:** Data flows directly between browsers, bypassing the server entirely for maximum speed.
- **Backpressure Management:** Intelligent flow control prevents browser crashes even when transferring multi-gigabyte files.
- **Reliable Chunking:** Files are sliced into 64KB chunks for resilient, ordered delivery over the network.
- **Live Metrics:** Real-time tracking of transfer speed, percentage completion, and estimated time remaining.

#### Privacy & Security
- **Zero Server Storage:** The signaling server never sees, buffers, or stores your file data.
- **End-to-End Encryption:** Optional AES-256-GCM encryption ensures your data stays safe even on untrusted network relays.
- **Password Protection:** Secure room entry guarded by bcrypt hashing on the signaling server.
- **Verifiable Tech:** Built with vanilla JavaScript and standard Web Crypto APIs for total transparency.

---

### Development Guide

#### Backend Setup (Python)
The backend is a FastAPI signaling server. We use `uv` for dependency management.
```bash
cd backend
uv sync
uv run uvicorn main:app --reload
```
You can run the backend test suite using:
```bash
uv run pytest tests/ -v
```

#### Frontend Setup (JS)
The frontend is vanilla HTML/JS. We use `npm` only for the testing environment (Vitest).
```bash
cd frontend
npm install
npm test
```
To serve the frontend locally, you can use any static server:
```bash
python3 -m http.server 3000
```

---

### License
AirPass is released under the **MIT License**. You are free to use, modify, and distribute the software as long as the original copyright notice and license are included.
