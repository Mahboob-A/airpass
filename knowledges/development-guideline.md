# development-guideline.md — Development Standards & Workflow
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Audience:** Developers and AI Coding Agents  

> **For AI Agents:** This document defines the rules of engagement for all code you write. Read `AGENTS.md` first for the orchestration context. For the project structure you must follow, see `SRS.md §1.3`. For what to build each sprint, see `SRS.md §7`. For feature-level implementation guides, see `backend-doc.md`, `frontend-doc.md`, and `deployment-doc.md`.

---

## 1. Non-Negotiable Principles

These five principles govern everything in this project. No exceptions.

**1. Tests before implementation.** No function is written without a failing test first. See `SRS.md §6` for the TDD mandate and coverage requirements.

**2. Backend before frontend.** Sprints 1 and 2 establish a working, tested backend before any frontend JavaScript is written. Frontend development begins in Sprint 2 (client-side WebRTC code) once the backend signaling server is proven.

**3. Frontend before deployment.** Docker/Nginx work begins in Sprint 6 after the application logic is complete. Don't containerize a broken app.

**4. One concern per module.** Each file has a single responsibility as defined in `SRS.md §1.3`. File content that belongs elsewhere will be refactored.

**5. No secrets in code.** All credentials, keys, and configurable values live in environment variables. `config.py` is the only place that reads from the environment.

**6. No emoji. No padding. KISS.** No emoji characters anywhere in the project — not in source code, comments, documentation, progress files, commit messages, or UI text strings. Plain text only. All agent-maintained docs follow strict word limits (see `AGENTS.md §0` and `AGENTS.md §4`). Write the minimum that communicates the fact. If you are writing more, cut it.

---

## 2. Environment & Tooling Setup

### 2.1 Python Version

This project uses **Python 3.12**. Ensure it is installed before starting:

```bash
python3 --version     # should show 3.12.x
# or via pyenv:
pyenv install 3.12.5
pyenv local 3.12.5
```

### 2.2 Package Manager: uv

This project uses **`uv`** as the Python package manager. `uv` is significantly faster than `pip` and produces deterministic installs via a lockfile.

**Install uv:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# or on macOS:
brew install uv
```

**Initial project setup:**
```bash
cd p2p-share/backend

# Create virtual environment with Python 3.12
uv venv --python 3.12

# Activate (or let uv commands auto-discover)
source .venv/bin/activate     # Linux/macOS
# .venv\Scripts\activate      # Windows

# Install dependencies from requirements.txt
uv pip install -r requirements.txt

# OR: install and add to requirements.txt in one step
uv pip install fastapi uvicorn[standard] bcrypt python-dotenv
```

**Adding a new dependency:**
```bash
uv pip install <package-name>
uv pip freeze > requirements.txt    # update the requirements file
```

**Running commands with uv:**
```bash
uv run pytest                       # run tests
uv run uvicorn main:app --reload    # run dev server
uv run python -m pytest -v          # alternative test run
```

> **For AI Agents:** Always use `uv run` prefix when executing Python commands in this project. Never use bare `python` or `pip` commands. See `backend-doc.md §2` for the full backend setup walkthrough.

### 2.3 Backend: `requirements.txt`

```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
bcrypt>=4.1.0
python-dotenv>=1.0.0
pydantic>=2.5.0
pydantic-settings>=2.1.0

# Testing
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.26.0            # for TestClient
```

### 2.4 Frontend Tooling

The frontend is **vanilla HTML/CSS/JS** — no build tool, no bundler, no npm required for the core app. This keeps the project simple and auditable.

**For testing only**, Vitest is used:
```bash
# In frontend/ directory:
npm init -y
npm install --save-dev vitest
```

Test run:
```bash
npx vitest run              # one-time
npx vitest                  # watch mode
```

External libraries used via CDN (no npm install):
- `qrcode.js` — QR code generation

---

## 3. Test-Driven Development (TDD) Workflow

### 3.1 The Red-Green-Refactor Cycle

Every feature follows this cycle without exception:

```
┌──────────────────────────────────────────────────────┐
│  Step 1: RED — Write a failing test                  │
│    • Describe what the function SHOULD do            │
│    • Write the assertion before the implementation   │
│    • Run: uv run pytest → confirm it FAILS           │
│    • A test that doesn't fail first is not a test    │
└──────────────────────────┬───────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────┐
│  Step 2: GREEN — Write minimum code to pass          │
│    • Write only what is needed to make the test pass │
│    • Do not over-engineer at this stage              │
│    • Run: uv run pytest → confirm it PASSES          │
└──────────────────────────┬───────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────┐
│  Step 3: REFACTOR — Improve without breaking         │
│    • Clean up code, extract helpers, improve names   │
│    • Run: uv run pytest → still PASSES               │
│    • Commit: test + implementation together          │
└──────────────────────────────────────────────────────┘
```

### 3.2 Test File Organization

**Backend** — tests live in `backend/tests/`:
```
backend/tests/
├── __init__.py
├── conftest.py              # shared fixtures (app, client, test rooms)
├── test_room_manager.py     # unit tests — room CRUD, code gen, expiry
├── test_models.py           # unit tests — Pydantic model validation
├── test_websocket.py        # integration tests — WS endpoints
└── test_api.py              # integration tests — HTTP endpoints
```

**Frontend** — tests live adjacent to source:
```
frontend/js/
├── signaling.test.js        # WebSocket wrapper tests
├── transfer.test.js         # Chunking, reassembly, backpressure
└── crypto.test.js           # Key derivation, encrypt/decrypt round-trip
```

### 3.3 Test Coverage Requirements

Coverage is enforced, not aspirational. See `SRS.md §6.4`.

Run coverage report:
```bash
uv run pytest --cov=. --cov-report=term-missing backend/tests/
```

| Module | Required Coverage |
|--------|-----------------|
| `room_manager.py` | ≥ 95% |
| `models.py` | 100% |
| `main.py` (WS handlers) | ≥ 90% |
| `crypto.js` | 100% |
| `transfer.js` (chunking/reassembly) | ≥ 90% |

> **For AI Agents:** If you cannot reach these coverage numbers, it means the implementation has untested paths. Add tests, don't lower the bar.

### 3.4 Test Naming Convention

```python
# Python: test_{function_name}_{condition}_{expected_result}
def test_generate_room_code_returns_6_characters():
def test_generate_room_code_is_uppercase_alphanumeric():
def test_create_room_with_duplicate_code_retries():
def test_join_room_full_returns_error():
def test_room_expires_after_30_minutes():
```

```javascript
// JavaScript: describe block + 'should' convention
describe('generateRoomCode', () => {
  it('should return exactly 6 characters')
  it('should be uppercase alphanumeric')
})

describe('encryptChunk', () => {
  it('should produce output longer than input by IV size')
  it('should be decryptable with the same key')
  it('should produce different ciphertext for same input')
})
```

### 3.5 Fixtures and Test Isolation

Every test must be independent. No test should rely on state left by another test.

```python
# conftest.py — reset room state between tests
@pytest.fixture(autouse=True)
def reset_room_manager():
    room_manager.rooms.clear()
    yield
    room_manager.rooms.clear()

@pytest.fixture
def test_client():
    from main import app
    return TestClient(app)

@pytest.fixture
async def ws_client():
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
```

---

## 4. Running Tests

### 4.1 Backend Tests
```bash
cd p2p-share

# Run all tests
uv run pytest backend/tests/ -v

# Run with coverage
uv run pytest backend/tests/ --cov=backend --cov-report=term-missing -v

# Run a single test file
uv run pytest backend/tests/test_room_manager.py -v

# Run a single test
uv run pytest backend/tests/test_room_manager.py::test_generate_room_code_returns_6_characters -v

# Run and stop on first failure
uv run pytest backend/tests/ -x
```

### 4.2 Frontend Tests
```bash
cd p2p-share/frontend

# Run all tests once
npx vitest run

# Run in watch mode
npx vitest

# Run specific file
npx vitest run js/crypto.test.js
```

### 4.3 Pre-Commit Check (run before every commit)
```bash
# From project root
uv run pytest backend/tests/ -v --tb=short && \
  cd frontend && npx vitest run && \
  echo "All tests passed"
```

---

## 5. Sprint Development Order

### 5.1 Development Sequence

```
Sprint 1 (Backend)  →  Sprint 2 (Backend + Frontend)  →  Sprint 3 (Frontend)
→  Sprint 4 (Frontend)  →  Sprint 5 (Backend + Frontend)  →  Sprint 6 (Deployment)
```

Each sprint must achieve its definition of done (see `AGENTS.md §3`) before the next begins.

### 5.2 Sprint Start Checklist

Before beginning any sprint:
- [ ] Previous sprint's tests all pass
- [ ] No uncommitted changes from previous sprint
- [ ] Relevant docs read (listed per sprint in `AGENTS.md §6`)
- [ ] Feature list for this sprint confirmed against `Project-Features.md`
- [ ] Sprint ticket file created at `knowledges/sprint-tickets/sprint-N-tickets.md`
- [ ] Sprint progress file created at `knowledges/sprint-progress/sprint-N-progress.md`
- [ ] Human has reviewed and approved the ticket file before any implementation begins

### 5.3 Sprint Kickoff Workflow

The agent follows this exact sequence at the start of every sprint. See `AGENTS.md §4` for the full protocol with file formats.

**Step 1 — Write the ticket file**

Read the sprint spec from `AGENTS.md §6` and `SRS.md §7`. Break the sprint into discrete tickets. Assign priority (HIGH / MEDIUM / LOW). List dependencies between tickets. Save to `knowledges/sprint-tickets/sprint-N-tickets.md`. Tell the human the file is ready for review. Wait.

**Step 2 — Write the progress file**

Create `knowledges/sprint-progress/sprint-N-progress.md` with all tickets listed as "pending". This file stays open throughout the sprint.

**Step 3 — Work tickets in priority order**

Pick the highest-priority unblocked ticket. Implement it following TDD (§3 below). Update the progress file immediately on completion (40-60 words for the update — no more). Pick the next ticket.

**Step 4 — Close the sprint**

When all tickets are done, append the sprint summary to the progress file (150-200 words — no more). Update the relevant project understanding docs (§5.4 below). Confirm to the human.

**What the agent must not do:**
- Start implementing before the ticket file is reviewed
- Work on multiple tickets simultaneously
- Write ticket updates after the fact in batches
- Write more than 60 words for a ticket update or more than 200 words for a sprint summary
- Use emoji anywhere in these files

### 5.4 Project Understanding Docs

Three standing docs live in `knowledges/project-understanding/`. They give any developer (or a new agent session) a quick mental model of each area without reading code.

| File | When updated |
|------|-------------|
| `knowledges/project-understanding/backend-overview.md` | End of each sprint that changes the backend |
| `knowledges/project-understanding/frontend-overview.md` | End of each sprint that changes the frontend |
| `knowledges/project-understanding/deployment-overview.md` | End of Sprint 6 |

**Each doc covers these headings (keep each section brief):**

- What this area does (2-3 sentences)
- Directory structure (annotated tree, one line per entry)
- Where to find what (table: "If you want X, look in Y", 5-10 rows)
- Key decisions and why (bullet list of non-obvious choices with one-line rationale)
- How data flows (2-4 sentences or a simple ASCII diagram)
- Known constraints (3-5 items a developer must not change without updating the spec)

**Update rules:**
- Each sprint's contribution to an overview doc is at most 100-200 words of added or revised content
- Do not rewrite the whole doc each sprint — edit in place
- Do not duplicate content already in the mastery docs (`backend-doc.md` etc.). The overview is a map, not a manual.
- No emoji. Plain text throughout.

---

## 6. Code Style & Quality

### 6.1 Python Style

- Follow **PEP 8** — 4-space indentation, max 88 chars per line (Black formatter)
- Use **type hints** on all function signatures
- Use **docstrings** for all public functions (Google style)
- Use **async/await** throughout — no blocking calls in async functions
- No bare `except:` clauses — always catch specific exceptions

```python
# CORRECT
async def create_room(password: str | None = None) -> Room:
    """Create a new transfer room.
    
    Args:
        password: Optional plaintext password. Will be hashed server-side.
        
    Returns:
        The newly created Room object.
        
    Raises:
        RoomLimitExceededError: If MAX_ROOMS limit is reached.
    """
    ...

# WRONG — missing types, no docstring, bare except
async def create_room(password=None):
    try:
        ...
    except:
        pass
```

- **Formatter:** Use `black` via `uv run black backend/`
- **Linter:** Use `ruff` via `uv run ruff check backend/`

Add to `requirements.txt`:
```
black>=24.0.0
ruff>=0.2.0
```

### 6.2 JavaScript Style

- Use **ES2020+** syntax (async/await, optional chaining, nullish coalescing)
- Use **`const`** by default; `let` when reassignment is needed; never `var`
- Use **JSDoc** comments on all exported functions
- No framework dependencies — vanilla JS only for the core app
- Prefer **named functions** over anonymous functions for testability

```javascript
// CORRECT
/**
 * Derives an AES-256 key from a password using PBKDF2.
 * @param {string} password - The user-provided password
 * @param {Uint8Array} salt - Random 16-byte salt
 * @returns {Promise<CryptoKey>} The derived AES-GCM key
 */
export async function deriveKey(password, salt) {
  ...
}

// WRONG — no types, no docs, var
async function deriveKey(p, s) {
  var key = ...
}
```

### 6.3 Error Handling

**Backend:** All WebSocket message handlers must catch exceptions and return a `{"type": "error", ...}` message rather than letting the connection drop silently:

```python
async def handle_message(websocket: WebSocket, room_id: str, data: dict):
    try:
        message_type = data.get("type")
        # ... handle message
    except ValidationError as e:
        await websocket.send_json({"type": "error", "code": "INVALID_MESSAGE", "message": str(e)})
    except RoomNotFoundError:
        await websocket.send_json({"type": "error", "code": "ROOM_NOT_FOUND", "message": "Room not found or expired"})
```

**Frontend:** All WebRTC state transitions must be handled with fallback UI:

```javascript
peerConnection.oniceconnectionstatechange = () => {
  const state = peerConnection.iceConnectionState;
  updateConnectionStatus(state);  // always update UI
  if (state === 'failed') {
    showError('Connection failed. Check your network and try again.');
    attemptIceRestart();
  }
};
```

---

## 7. Git Workflow

### 7.1 Branch Strategy

```
main          — production-ready code only
dev           — integration branch
sprint/1-signaling-server
sprint/2-webrtc-connection
sprint/3-file-transfer
sprint/4-room-entry-ux
sprint/5-encryption
sprint/6-deployment
```

### 7.2 Commit Convention

Use **Conventional Commits** format:

```
feat(room): add 6-digit code generation
test(room): add unit tests for code generation
fix(peer): handle ICE candidate before remote description
refactor(transfer): extract chunk size to constant
docs(srs): add candidate queuing to signaling spec
chore(deps): update fastapi to 0.111.0
```

### 7.3 Commit Checklist

Before every commit:
- [ ] All tests pass (`uv run pytest` + `npx vitest run`)
- [ ] No secrets in code
- [ ] New code has tests (TDD was followed)
- [ ] `black` and `ruff` pass on Python files

---

## 8. Environment Variables & `.env`

### 8.1 `.env` file location

```
p2p-share/
├── backend/
│   └── .env          ← backend environment variables
├── .env              ← docker-compose environment variables
└── .env.example      ← committed template (no real values)
```

### 8.2 `.env.example` (commit this)

```env
# Server
APP_HOST=0.0.0.0
APP_PORT=8000
APP_ENV=development

# Security
SECRET_KEY=change-me-to-random-32-bytes-hex
BCRYPT_ROUNDS=12

# TURN server
TURN_URL=turn:your-server:3478
TURN_USERNAME=username
TURN_CREDENTIAL=password

# Room settings
ROOM_EXPIRY_MINUTES=30
MAX_ROOMS=5000
```

### 8.3 `.gitignore` entries (required)

```
.env
.env.local
.env.production
*.pyc
__pycache__/
.venv/
.pytest_cache/
dist/
node_modules/
```

---

## 9. Development Server

### 9.1 Run backend in development

```bash
cd p2p-share/backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- `--reload` — auto-restarts on code changes
- Access at `http://localhost:8000`
- WebSocket at `ws://localhost:8000/ws/{room_id}`

### 9.2 Serve frontend in development

Since the frontend is static HTML/JS, use any simple file server:

```bash
cd p2p-share/frontend
python3 -m http.server 3000
# Access at http://localhost:3000
```

Or use the `npx serve` package:
```bash
npx serve frontend/ -p 3000
```

> **Note:** For WebRTC to work, both backend and frontend must be served from `localhost` or HTTPS. HTTP on a non-localhost origin will cause WebRTC APIs to be unavailable.

### 9.3 Development with HTTPS (local)

For testing WebRTC on a real device over local network:

```bash
# Install mkcert
brew install mkcert  # macOS
mkcert -install
mkcert localhost 127.0.0.1 192.168.1.x

# Run uvicorn with SSL
uv run uvicorn main:app --ssl-keyfile=localhost-key.pem --ssl-certfile=localhost.pem --reload
```

---

## 10. Document Cross-References

| For more on... | See document |
|----------------|-------------|
| Project structure | `knowledges/SRS.md §1.3` |
| Sprint plan | `knowledges/SRS.md §7` |
| TDD mandate and coverage reqs | `knowledges/SRS.md §6` |
| Agent execution workflow per sprint | `AGENTS.md §6` |
| Sprint kickoff protocol (ticket + progress docs) | `AGENTS.md §4` |
| Project understanding docs | `AGENTS.md §5` and `knowledges/project-understanding/` |
| Folder layout for all docs | `AGENTS.md §1` |
| No emoji and word limit rules | `AGENTS.md §0` and this doc §1 principle 6 |
| Backend API implementation steps | `knowledges/backend-doc.md` |
| Frontend implementation steps | `knowledges/frontend-doc.md` |
| Docker and Nginx setup | `knowledges/deployment-doc.md` |
| All environment variables | `knowledges/SRS.md §9` |
