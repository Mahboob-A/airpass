# deployment-doc.md — Deployment Mastery Guide
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Domain:** Deployment (Docker, Docker Compose, Nginx, Coturn, SSL)  
**Role:** Mastery document — step-by-step guide for containerizing, deploying, and operating the application in production.

> **For AI Agents:** This is the Layer 3 mastery document for deployment. Before reading this, you must have read `BRD.md` (why), `SRS.md` (architecture and constraints), and `AGENTS.md` (orchestration). The application code this deployment wraps is fully described in `backend-doc.md` and `frontend-doc.md`. Deployment is Sprint 6 — do not start here until all application code is working and tested. See `development-guideline.md §5` for the sprint sequence rule.

---

## 1. Deployment Architecture Overview

### 1.1 What the production stack looks like

```
Internet
    │
    │ HTTPS :443
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Nginx (reverse proxy)                      │
│                                                                 │
│  / (static files)  →  serve frontend/ directory                │
│  /ws/*             →  proxy_pass to FastAPI :8000               │
│  /api/*            →  proxy_pass to FastAPI :8000               │
│  SSL termination (Let's Encrypt or self-signed)                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ http://backend:8000 (internal network)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│               FastAPI Signaling Server (uvicorn)                │
│               Signaling only — zero file data                   │
└─────────────────────────────────────────────────────────────────┘

Separate (external or self-hosted):
┌─────────────────────────────────────────────────────────────────┐
│               TURN Server (Coturn)                              │
│               UDP/TCP :3478, TLS :5349                          │
│               Routes WebRTC traffic for strict-NAT users        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Docker Compose services

| Service | Image | Exposes | Purpose |
|---------|-------|---------|---------|
| `backend` | Built from `./Dockerfile` | Internal :8000 | FastAPI signaling server |
| `nginx` | `nginx:1.25-alpine` | Host :80, :443 | Reverse proxy, SSL, static files |

Coturn runs as a separate Docker Compose service or on its own VPS. See §4.

### 1.3 What gets containerized

```
p2p-share/
├── backend/              → copied into Docker image
├── frontend/             → served by Nginx as static files
├── nginx/
│   └── nginx.conf        → mounted into Nginx container
├── Dockerfile            → builds the FastAPI image
├── docker-compose.yml    → orchestrates all services
└── .env                  → runtime configuration (never committed)
```

---

## 2. Docker

### 2.1 `Dockerfile`

The backend image uses a minimal Python 3.12 slim base. `uv` is used for fast, deterministic dependency installation.

```dockerfile
# Dockerfile
# FastAPI signaling server for P2P Share
# See backend-doc.md for the application being containerized.
# See SRS.md §8 (Technology Stack) for version requirements.

FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install uv — the project's package manager
# See development-guideline.md §2.2 for why uv is used
RUN pip install uv --no-cache-dir

# Copy dependency manifest first (layer caching — only reinstalls on changes)
COPY backend/requirements.txt .

# Install all Python dependencies using uv
# --system: install into the system Python (no venv needed in container)
RUN uv pip install --system -r requirements.txt

# Copy the application source code
COPY backend/ .

# Expose the application port (internal only — Nginx proxies externally)
EXPOSE 8000

# Health check — Nginx and orchestrators can use this
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')" || exit 1

# Run the application
# --no-access-log in production reduces I/O (access logs handled by Nginx)
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--no-access-log", \
     "--workers", "1"]
```

> **For AI Agents:** Note `--workers 1`. The signaling server uses in-memory room state (no database). Multiple workers would each have separate memory, causing room-not-found errors for cross-worker WebSocket connections. Only use 1 worker unless you add Redis-backed room state. See `backend-doc.md §1.1` for the in-memory architecture rationale.

### 2.2 `.dockerignore`

```
# .dockerignore
**/__pycache__
**/*.pyc
**/*.pyo
**/.pytest_cache
**/.venv
**/node_modules
**/.env
**/.env.local
**/tests/
**/*.test.js
.git
.gitignore
README.md
docker-compose.yml
nginx/
frontend/
```

### 2.3 Build and test the image locally

```bash
# Build the image
docker build -t p2p-share-backend:latest .

# Run the container locally for testing
docker run --rm \
  --env-file backend/.env \
  -p 8000:8000 \
  p2p-share-backend:latest

# Verify health check
curl http://localhost:8000/
# Expected: {"status": "ok"}

# Verify ICE config endpoint
curl http://localhost:8000/api/ice-config
# Expected: {"iceServers": [...]}
```

---

## 3. Docker Compose

### 3.1 `docker-compose.yml`

```yaml
# docker-compose.yml
# Orchestrates: FastAPI backend + Nginx reverse proxy
# For TURN server, see §4 (coturn added separately or externally)
# See deployment-doc.md §3 for Nginx configuration details.
# See deployment-doc.md §4 for TURN server setup.

services:

  # ── FastAPI Signaling Backend ──────────────────────────────
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: p2p-share-backend
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - APP_ENV=production
    expose:
      - "8000"           # internal only — not published to host
    networks:
      - p2p-internal
    healthcheck:
      test: ["CMD", "python", "-c",
             "import urllib.request; urllib.request.urlopen('http://localhost:8000/')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # ── Nginx Reverse Proxy ────────────────────────────────────
  nginx:
    image: nginx:1.25-alpine
    container_name: p2p-share-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      # Nginx configuration
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      # Frontend static files served directly by Nginx (no FastAPI involvement)
      - ./frontend:/usr/share/nginx/html:ro
      # SSL certificates (Let's Encrypt via certbot or manual)
      - ./ssl/certs:/etc/nginx/ssl:ro
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - p2p-internal

networks:
  p2p-internal:
    driver: bridge
```

### 3.2 `.env` for Docker Compose (root-level)

This `.env` is read by docker-compose and injected into the `backend` service:

```env
# .env (root-level — for docker-compose.yml)
# Copy from .env.example and fill in real values before deploying
# NEVER commit this file — it contains secrets

# Application
APP_ENV=production
APP_HOST=0.0.0.0
APP_PORT=8000

# Security — generate with: python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your-random-64-char-hex-string-here
BCRYPT_ROUNDS=12

# TURN server — REQUIRED for production
# See deployment-doc.md §4 for TURN setup
TURN_URL=turn:your-domain.com:3478
TURN_USERNAME=your-turn-username
TURN_CREDENTIAL=your-turn-credential

# Room settings
ROOM_EXPIRY_MINUTES=30
MAX_ROOMS=5000
```

---

## 4. Nginx Configuration

### 4.1 Full `nginx/nginx.conf`

This is the complete, production-ready Nginx configuration. Every directive is explained.

```nginx
# nginx/nginx.conf
# Reverse proxy for P2P Share
# Handles: SSL termination, static file serving, WebSocket upgrade, API proxy
# See SRS.md §NFR-3.1 for HTTPS requirement (required for WebRTC and Web Crypto API)
# See backend-doc.md §6 for the upstream API being proxied

worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging format
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    gzip            on;
    gzip_types text/plain text/css application/javascript application/json;

    # ── HTTP → HTTPS redirect ──────────────────────────────
    server {
        listen 80;
        server_name your-domain.com;

        # Let's Encrypt challenge (certbot uses this path)
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # Redirect all other HTTP to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # ── Main HTTPS server ──────────────────────────────────
    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # ── SSL configuration ────────────────────────────
        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache   shared:SSL:10m;
        ssl_session_timeout 1d;

        # ── Security headers ─────────────────────────────
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options DENY always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;

        # ── Static frontend files ────────────────────────
        # Nginx serves the frontend directly — no FastAPI involvement
        # See frontend-doc.md §1 for why this is a static folder
        root /usr/share/nginx/html;
        index index.html;

        # Cache static assets aggressively
        location ~* \.(css|js)$ {
            expires 1d;
            add_header Cache-Control "public, immutable";
        }

        # HTML pages — no cache (users should always get latest)
        location ~* \.html$ {
            expires 0;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }

        # SPA-style routing: /join/* → join.html
        location /join/ {
            try_files $uri /join.html;
        }

        # ── WebSocket proxy (critical — requires Upgrade headers) ──
        # WebRTC signaling uses WebSocket at /ws/{room_id}
        # The Upgrade + Connection headers are MANDATORY for WebSocket proxying
        # Missing these headers causes silent 400 errors — see AGENTS.md §7
        location /ws/ {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;

            # REQUIRED: WebSocket upgrade headers
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";

            # Pass real client info to FastAPI
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket timeout — must be longer than room expiry (30 min)
            # Peers can be connected for the full room lifetime
            proxy_read_timeout 3600s;   # 1 hour
            proxy_send_timeout 3600s;

            # Disable buffering for WebSocket
            proxy_buffering off;
        }

        # ── API proxy ──────────────────────────────────────
        # /api/* routes to FastAPI
        location /api/ {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # API responses are small JSON — short timeouts are fine
            proxy_connect_timeout 10s;
            proxy_read_timeout 30s;
        }

        # ── Health check passthrough ────────────────────
        location = / {
            proxy_pass http://backend:8000;
            proxy_set_header Host $host;
        }
    }
}
```

### 4.2 Critical WebSocket directive — DO NOT OMIT

The most common deployment failure is a missing or wrong WebSocket upgrade config. The two directives below are **mandatory**:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

Without these, WebSocket connections return `400 Bad Request` or silently fail. See `AGENTS.md §7` troubleshooting guide.

### 4.3 `proxy_read_timeout` for WebSocket

The default Nginx `proxy_read_timeout` is 60 seconds. WebSocket connections for file transfer can last much longer. Set it to at least the room expiry time (30 minutes = 1800s) or longer:

```nginx
proxy_read_timeout 3600s;   # 1 hour — safe upper bound
```

---

## 5. SSL Certificate Setup

### 5.1 Let's Encrypt with Certbot (recommended for production)

```bash
# On your VPS, install certbot
apt-get install certbot

# Create the webroot directory for ACME challenges
mkdir -p /var/www/certbot

# Stop Nginx temporarily for standalone verification
docker compose stop nginx

# Obtain certificate
certbot certonly \
  --standalone \
  --email your@email.com \
  --agree-tos \
  --no-eff-email \
  -d your-domain.com

# Certificates are placed in:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem

# Create the ssl directory and copy certs
mkdir -p p2p-share/ssl/certs
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/certs/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/certs/

# Restart Nginx
docker compose start nginx
```

### 5.2 Auto-renewal setup

```bash
# Cron job for auto-renewal (add to root crontab)
# Runs twice daily, renews if expiry is < 30 days away
0 0,12 * * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/your-domain.com/*.pem /path/to/p2p-share/ssl/certs/ && \
  docker exec p2p-share-nginx nginx -s reload
```

### 5.3 Self-signed certificate (development/testing only)

```bash
mkdir -p ssl/certs
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout ssl/certs/privkey.pem \
  -out ssl/certs/fullchain.pem \
  -subj "/C=US/ST=Dev/L=Dev/O=Dev/CN=localhost"
```

> **Note:** Self-signed certificates will show a browser warning. Accept the warning in development. Production must use a trusted certificate — WebRTC TURN connections require valid TLS.

---

## 6. TURN Server Setup

### 6.1 Why TURN is required

Approximately 15-20% of WebRTC connections cannot establish a direct peer-to-peer path because both peers are behind symmetric NAT (common in corporate networks and some mobile carriers). Without a TURN relay, these users get a hard connection failure.

**STUN** discovers public IPs — free, no bandwidth cost.  
**TURN** relays all WebRTC data when direct P2P fails — costs bandwidth.

> See `SRS.md §NFR-3.3` for the reliability requirement. See `Project-Features.md §F-10` for the user-facing feature.

### 6.2 Option A: Self-hosted Coturn (recommended for production)

Add Coturn as a service in `docker-compose.yml`:

```yaml
# Add to docker-compose.yml under services:

  coturn:
    image: coturn/coturn:latest
    container_name: p2p-share-coturn
    restart: unless-stopped
    network_mode: host   # MUST be host mode for TURN to work
    volumes:
      - ./coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro
    command: -c /etc/coturn/turnserver.conf
```

Create `coturn/turnserver.conf`:

```ini
# coturn/turnserver.conf
# Coturn TURN server configuration for P2P Share
# See https://github.com/coturn/coturn/wiki/turnserver for full reference

# Listening port
listening-port=3478
tls-listening-port=5349

# Your server's public IP
external-ip=YOUR_PUBLIC_IP

# Domain
realm=your-domain.com

# Authentication: use time-limited credentials
# The server-side REST API generates these credentials
use-auth-secret
static-auth-secret=your-very-long-random-secret-here

# TLS certificate (same as Nginx)
cert=/etc/nginx/ssl/fullchain.pem
pkey=/etc/nginx/ssl/privkey.pem

# Logging
log-file=/var/log/coturn/turnserver.log
verbose

# Security: deny unless authenticated
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=172.16.0.0-172.31.255.255

# Fingerprint STUN messages
fingerprint

# Long-term credential support (in addition to REST API)
lt-cred-mech
```

> **For AI Agents:** The `static-auth-secret` in `turnserver.conf` must match what `config.py` uses to generate HMAC-based time-limited credentials. See §6.4 for the credential generation API.

### 6.3 Open firewall ports for TURN

```bash
# UDP and TCP for TURN
ufw allow 3478/udp
ufw allow 3478/tcp

# TLS TURN
ufw allow 5349/udp
ufw allow 5349/tcp

# TURN relay port range (adjust to your turnserver.conf settings)
ufw allow 49152:65535/udp
```

### 6.4 Option B: Metered.ca free TURN (development / low-traffic)

For development and low-traffic instances, Metered.ca provides a free TURN server tier (50GB/month).

1. Sign up at `https://www.metered.ca/tools/openrelay/`
2. Get your API key and TURN server URL
3. Set in `.env`:

```env
TURN_URL=turn:openrelay.metered.ca:80
TURN_USERNAME=your-metered-username
TURN_CREDENTIAL=your-metered-credential
```

The `/api/ice-config` endpoint in `backend-doc.md §6.2` already handles injecting these credentials into the ICE config response.

### 6.5 Verify TURN is working

Use the WebRTC ICE Trickle testing tool to verify TURN candidates appear:

```
https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

Enter your TURN server URL and credentials. You should see `relay` type candidates appear. If you only see `host` and `srflx` candidates, TURN is not working.

---

## 7. Full Deployment Procedure

### 7.1 VPS requirements

| Requirement | Minimum | Recommended |
|------------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| RAM | 512MB | 1GB |
| CPU | 1 vCPU | 1 vCPU |
| Storage | 10GB | 20GB |
| Network | 100Mbps | 1Gbps |
| Docker | 24+ | 25+ |

The signaling server is extremely lightweight — it only processes small JSON messages. The only bandwidth cost is TURN relay traffic.

### 7.2 Step-by-step first deployment

```bash
# ── On your VPS ──────────────────────────────────────────────

# 1. Install Docker and Docker Compose
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin

# 2. Clone the repository
git clone https://github.com/your-org/p2p-share.git
cd p2p-share

# 3. Create the environment file from the template
cp .env.example .env
nano .env    # Fill in all required values

# 4. Create SSL directory and obtain certificate (see §5.1)
mkdir -p ssl/certs
# ... run certbot and copy certs

# 5. Replace your-domain.com in nginx.conf
sed -i 's/your-domain.com/youractualdomain.com/g' nginx/nginx.conf

# 6. Build and start all services
docker compose up -d --build

# 7. Verify services are running
docker compose ps

# 8. Check backend health
curl https://youractualdomain.com/

# 9. Check WebSocket endpoint (should not 404)
curl -i https://youractualdomain.com/api/ice-config

# 10. Tail logs for any errors
docker compose logs -f
```

### 7.3 Verify the full stack

```bash
# Backend health
curl https://yourdomain.com/
# Expected: {"status": "ok"}

# ICE config (must contain TURN server)
curl https://yourdomain.com/api/ice-config
# Expected: {"iceServers":[{"urls":"stun:..."},{"urls":"turn:...","username":"...","credential":"..."}]}

# Room API
curl https://yourdomain.com/api/room/ZZZZZZ
# Expected: 404 (room not found)

# Frontend accessible
curl -I https://yourdomain.com/
# Expected: 200, Content-Type: text/html
```

### 7.4 End-to-end deployment test

1. Open `https://yourdomain.com` in Chrome on your laptop
2. Click "Create Room" — verify a 6-digit code appears
3. Open `https://yourdomain.com` on your phone (different network — use mobile data, not WiFi)
4. Enter the room code
5. Transfer a 10MB test file
6. Verify: speed meter shows activity, file downloads successfully
7. Check `docker compose logs backend` — verify no file bytes appear in logs (they shouldn't — architecture prevents this)

---

## 8. Maintenance and Operations

### 8.1 Updating the application

```bash
# Pull latest code
git pull origin main

# Rebuild and restart (zero-downtime for Nginx, brief restart for backend)
docker compose build backend
docker compose up -d --no-deps backend

# Nginx config change only (no rebuild needed)
docker compose exec nginx nginx -t        # test config syntax
docker compose exec nginx nginx -s reload # hot reload
```

### 8.2 Viewing logs

```bash
# All services
docker compose logs -f

# Backend only
docker compose logs -f backend

# Nginx access log
docker compose logs -f nginx

# Backend only, last 100 lines
docker compose logs --tail=100 backend
```

### 8.3 Monitoring room state

The backend has no admin API by default. To inspect live room state during debugging:

```bash
# Attach to running backend container
docker compose exec backend python3 -c "
from room_manager import room_manager
print(f'Active rooms: {len(room_manager.rooms)}')
for rid, room in room_manager.rooms.items():
    print(f'  {room.code}: {len(room.peers)} peers, created {room.created_at}')
"
```

### 8.4 Restarting services

```bash
# Restart everything
docker compose restart

# Restart only backend (when Nginx is healthy and frontend is unchanged)
docker compose restart backend

# Full stop and start
docker compose down
docker compose up -d
```

---

## 9. Security Hardening Checklist

Before going to production, verify all of the following:

```
[ ] .env file is NOT in git (.gitignore entry present)
[ ] SECRET_KEY is a random 64-char hex string (not the example value)
[ ] BCRYPT_ROUNDS is at least 12
[ ] TURN credentials are rotated from any test values
[ ] Nginx is the only service exposing ports to the internet (80, 443)
[ ] Backend port 8000 is NOT exposed to host (only internal Docker network)
[ ] SSL certificate is valid and not self-signed
[ ] HSTS header is present (verify with https://securityheaders.com)
[ ] No CORS wildcard (*) in production nginx.conf
[ ] Docker containers run as non-root (add USER in Dockerfile if needed)
[ ] Server firewall: only 22 (SSH), 80 (HTTP), 443 (HTTPS), 3478 (TURN) open
[ ] Coturn denied-peer-ip blocks RFC1918 ranges (prevents SSRF via TURN)
[ ] Log files do not contain any file content (spot-check docker logs)
```

---

## 10. Troubleshooting

### Problem: WebSocket connections fail (400 or 502)
1. Check Nginx error log: `docker compose logs nginx`
2. Verify `Upgrade` and `Connection` headers in `nginx.conf` — see §4.2
3. Verify backend is healthy: `docker compose ps`
4. Check `proxy_read_timeout` is set for the `/ws/` location block
→ See `AGENTS.md §7` for the full WebSocket troubleshooting checklist

### Problem: TURN server not appearing in ICE candidates
1. Verify `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` are set in `.env`
2. Verify `/api/ice-config` response includes TURN entry: `curl https://yourdomain.com/api/ice-config`
3. Verify TURN ports are open in firewall: `ufw status`
4. Test TURN directly: `https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`
5. Check Coturn logs: `docker compose logs coturn`
→ See `AGENTS.md §7` TURN troubleshooting section

### Problem: SSL errors / insecure WebRTC
- WebRTC REQUIRES HTTPS (or localhost). HTTP in production is not an option.
- Verify certificate is valid: `curl -I https://yourdomain.com`
- Verify cert path in `nginx.conf` matches actual file location
→ See SRS.md §NFR-3.2 for the security requirement

### Problem: Backend container exits immediately
1. Check logs: `docker compose logs backend`
2. Most common cause: missing or invalid `.env` variable
3. Check `config.py` loads correctly: `docker compose run backend python -c "from config import settings; print(settings)"`

### Problem: `room not found` errors despite correct code
- This means the WebSocket connection is reaching a different backend instance
- Cause: if running multiple replicas or restarts happen between create and join
- Solution: ensure `--workers 1` in uvicorn (already set in Dockerfile)
→ See `backend-doc.md §1.1` for the single-worker architecture rationale

---

## 11. Document Cross-References

| For more on... | See document |
|----------------|-------------|
| Why deployment is structured this way | `BRD.md §G5` (self-hostability goal) |
| Environment variables list | `SRS.md §9` |
| Backend application being containerized | `backend-doc.md` |
| Frontend static files being served | `frontend-doc.md §1` |
| Development server (no Docker) | `development-guideline.md §9` |
| Sprint 6 execution checklist | `AGENTS.md §3 Sprint 6` |
| TURN feature description | `Project-Features.md §F-10, F-33` |
| ICE config endpoint implementation | `backend-doc.md §6.2` |
