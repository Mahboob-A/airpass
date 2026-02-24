# Sprint 6 Tickets

Sprint goal: Containerize the application for production deployment, configuring Docker, Nginx, and Docker Compose to properly route frontend assets, REST API queries, and WebSocket signals.
Estimated tickets: 3

---

## T-6-01 | Create Backend Docker Image | Priority: HIGH

What: Write the `Dockerfile` and setup `uv` to build the isolated Python 3.12 FastAPI signaling environment.
Why: Satisfies the containerization requirement in `deployment-doc.md §2.1`.
Acceptance: 
- `backend/Dockerfile` exists.
- `.dockerignore` configured properly.
- Image builds successfully via `docker build`.
Depends on: None

---

## T-6-02 | Configure Nginx Reverse Proxy | Priority: HIGH

What: Write the `nginx/nginx.conf` file to serve the `/frontend` assets and proxy `/api/*` and `/ws/*` traffic to the backend, enabling WebSocket upgrade headers.
Why: Essential component of the production proxy topology outlined in `deployment-doc.md §3.1`.
Acceptance: 
- `nginx/nginx.conf` handles static files directly.
- `nginx/nginx.conf` passes WebSocket Upgrades correctly.
Depends on: None

---

## T-6-03 | Orchestrate Services via Docker Compose | Priority: HIGH

What: Unite the Nginx routing container and FastAPI signaling container into a single `docker-compose.yml` network.
Why: Automates the multi-container startup sequence (`deployment-doc.md §4.1`).
Acceptance: 
- `docker-compose.yml` mounts `./frontend` and `./nginx.conf` correctly.
- `docker-compose.yml` wires Nginx to FastAPI internally while exposing ports `80` and `443`.
- `docker compose up -d` successfully initializes the entire application.
Depends on: T-6-01, T-6-02
