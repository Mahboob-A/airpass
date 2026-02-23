# ai-assisted-dev-tips.md — AI-Assisted Development Field Guide
## Project: P2P Share — Privacy-First Browser-Based File Transfer

**Document Version:** 1.0  
**Audience:** You — the human developer directing AI agents  
**Purpose:** Practical techniques to get maximum quality and accuracy from AI coding agents on this project.

> **Note:** This document is for YOU, not for the AI agent. It is your personal playbook for getting the best out of tools like Amazon Q Developer, GitHub Copilot, Cursor, Windsurf, and Claude. The AI agent has its own orchestration document: `AGENTS.md`.

---

## 1. The Core Mental Model: You Are the Architect

The single most important principle of AI-assisted development:

> **The AI writes code. You make decisions.**

AI agents are exceptional at implementing clearly-specified behavior. They are poor at making architectural trade-offs, maintaining consistency across a large codebase, and catching subtle security issues. Your job is to keep decisions out of the AI's hands and implementation in them.

The documentation system you have (`BRD.md` → `SRS.md` → mastery docs) is specifically designed to remove ambiguity from AI instructions. The better your prompt specifies constraints, the better the output.

---

## 2. The Golden Rule: Context Before Code

**Never ask an AI to write code without giving it the relevant context first.**

Most AI agent failures on this project will have one root cause: the agent didn't know about a constraint, a module boundary, or a protocol spec that already existed.

### What "context" means in practice

Before asking for any implementation, tell the agent:

1. **Which sprint you are in** — prevents it from building Sprint 5 features in Sprint 2
2. **Which module the code belongs to** — prevents logic from leaking into the wrong file
3. **What the test must look like first** — TDD requirement; agent writes test before implementation
4. **What relevant spec exists** — point to the SRS section or message protocol

**Example of a bad prompt:**
```
Write the WebSocket room creation handler.
```

**Example of a good prompt:**
```
We are in Sprint 1. I need you to implement the `create-room` message handler 
in main.py. Before writing any implementation code, write a failing test in 
backend/tests/test_websocket.py. The message format is defined in SRS.md §4 
(type: "create-room", optional password field). The room creation logic goes 
in room_manager.py — main.py only dispatches messages. The response must be 
the `room-created` format from SRS.md §4.2. Follow the module boundaries in 
SRS.md §1.3.
```

The second prompt takes 30 extra seconds to write and saves 20 minutes of debugging wrong output.

---

## 3. Prompting Patterns That Work

### Pattern 1: The Spec-First Prompt

Always attach the relevant spec before requesting implementation.

```
Here is the relevant spec from SRS.md §4:
[paste the message protocol section]

Now implement the server-side handler for this message type in main.py.
Write the test first.
```

Why it works: the agent cannot deviate from a spec it has been given explicitly. Without the spec, it will invent a message format and you'll get inconsistent behavior between frontend and backend.

---

### Pattern 2: The Red-Green Prompt (TDD enforcement)

Force TDD compliance explicitly in every implementation prompt:

```
Step 1: Write a FAILING test for [feature] in [test_file.py].
The test must fail when run with `uv run pytest`. Show me the test first.
Do NOT write any implementation yet.

Step 2: I will confirm the test is correct.

Step 3: Then write the minimum implementation to make the test pass.
```

This three-step structure works because you gate progress at each step. Many agents will skip to implementation without being held to this pattern.

---

### Pattern 3: The Boundary Prompt (preventing module creep)

When asking for code that touches multiple modules, explicitly state what goes where:

```
I need file chunking logic. The rules are:
- The chunking function goes ONLY in transfer.js
- It must be exported as a named function (not default export)
- It must NOT import anything from peer.js, signaling.js, or ui.js
- It must work in a jsdom test environment (no browser-only APIs)
Write the test first, then the implementation.
```

Without this, agents commonly put file logic in peer.js or add DOM manipulation in transfer.js.

---

### Pattern 4: The Constraint Reminder

For security-critical features (encryption, password handling), always restate the key constraints explicitly — even if they're in the docs. Don't assume the agent read everything.

```
IMPORTANT CONSTRAINTS for crypto.js implementation:
1. The password must NEVER be sent to the server (not even hashed)
2. Key derivation must use PBKDF2 with exactly 100,000 iterations and SHA-256
3. Each chunk must use a UNIQUE random IV — never reuse IVs
4. The IV must be PREPENDED to the ciphertext (first 12 bytes)
5. Test coverage must be 100% — write tests for every exported function

Now implement encryptChunk() and decryptChunk() in crypto.js.
```

---

### Pattern 5: The "Show Me Before You Do It" Prompt

For complex changes, ask the agent to show its plan before writing code:

```
Before writing any code, tell me:
1. Which files you will modify
2. What you will add to each file
3. What tests you will write
4. Any SRS requirements you are implementing

Wait for my approval before writing code.
```

This catches bad plans before they become bad code. Especially useful for Sprint 5 (encryption) where the integration touches backend, frontend, and the protocol simultaneously.

---

### Pattern 6: The Verification Prompt

After receiving generated code, always ask the agent to verify it against the spec:

```
Review the code you just wrote against these requirements:
- SRS.md §FR-08: chunks must be 64KB
- SRS.md §FR-08: backpressure threshold is 16MB
- development-guideline.md §6.2: no logic outside transfer.js

List any deviations from spec. If there are none, confirm explicitly.
```

Agents will often say "yes, it matches" when it doesn't. The act of asking makes them re-read.

---

### Pattern 7: The Debug-by-Spec Prompt

When something is broken, don't just say "it's broken, fix it." Point the agent to the spec and ask it to diagnose:

```
The ICE connection is stuck in `checking` state. 

Diagnose against these specs:
- SRS.md §FR-06: ICE candidates must be added AFTER setRemoteDescription
- frontend-doc.md §4.3: describes the candidate queuing mechanism

Does the current implementation in peer.js match this spec exactly?
Show me the relevant code section and identify any deviation.
```

This forces a reasoning process rather than a random fix.

---

## 4. What AI Agents Are Bad At (Avoid These)

### 4.1 Security decisions

**Never ask:**
- "How should I store passwords?"
- "Is this encryption implementation secure?"
- "What's the best way to handle credentials?"

**Instead:** Decisions are already made in `SRS.md §FR-11 to FR-13`. Ask the agent to implement the specified approach, not to design it.

### 4.2 Protocol design

**Never ask:**
- "What should the WebSocket message format look like?"
- "How should I structure the file metadata message?"

**Instead:** The protocol is in `SRS.md §4`. It is canonical and frozen. Ask the agent to implement it exactly.

### 4.3 Architecture across sprints

**Never ask:**
- "How should I structure this whole project?"
- "What's the best architecture for a file sharing app?"

**Instead:** The architecture is decided. Use the docs. Ask the agent to implement a specific sprint's specific feature.

### 4.4 Test coverage decisions

**Never ask:**
- "What should I test here?"

**Instead:** Coverage requirements are in `SRS.md §6.4` and `development-guideline.md §3.3`. Tell the agent the required coverage and ask it to write tests that achieve it.

### 4.5 "Just make it work"

**Never say:**
- "Just make the file transfer work"
- "Fix whatever is broken"
- "Make the connection more reliable"

**Instead:** Every change must be tied to a specific requirement. Vague instructions produce vague, inconsistent implementations.

---

## 5. Productive Workflows Per Sprint

### Sprint 1 — Signaling Server

**Most productive workflow:**

1. Give the agent `SRS.md §4` (message protocol) and ask for test first
2. One module at a time: `models.py` → `room_manager.py` → `main.py`
3. After each module: paste the test output into the conversation
4. Never move to the next module until tests pass

**Watch for:** agents putting business logic in `main.py`. The boundary is in `SRS.md §1.3`.

---

### Sprint 2 — WebRTC Connection

**Most productive workflow:**

1. Show the agent `frontend-doc.md §3` before asking for `signaling.js`
2. Mock-first: ask for the test with the MockWebSocket before any implementation
3. For `peer.js`: explicitly state "ICE candidates received before setRemoteDescription must be queued" — this is the most common error agents make here
4. Test with two real browser tabs before declaring Sprint 2 done

**Watch for:** agents skipping the ICE candidate queue. Paste this exact spec to prevent it:
```
CRITICAL: From SRS.md §FR-06:
"The client SHALL call addIceCandidate() for each received candidate 
AFTER setRemoteDescription has been called."
Implement candidate queuing in peer.js. Candidates that arrive before 
setRemoteDescription must be stored in an array and flushed afterward.
```

---

### Sprint 3 — File Transfer

**Most productive workflow:**

1. Start with `transfer.test.js` — ask for ALL tests before any implementation
2. The lossless round-trip test (chunk → reassemble → compare bytes) is the most valuable test here; make sure it exists
3. Ask the agent to explicitly implement `bufferedAmountLowThreshold` for backpressure — name it exactly, or the agent will use a polling approach instead
4. Manually transfer a 100MB file before declaring Sprint 3 done

**Watch for:** agents using `setInterval` polling for backpressure instead of the event-driven `bufferedamountlow` approach. The event-driven approach is in `frontend-doc.md §5.2`.

---

### Sprint 4 — Room Entry UX

**Most productive workflow:**

1. This sprint is mostly UI/HTML — AI agents are good here with minimal guidance
2. Give the agent the three entry method specs from `Project-Features.md §F-04, F-05, F-06`
3. Ask it to use the existing `ui.js` and not add DOM logic elsewhere
4. Test QR code on a real mobile device — don't just test in browser devtools

---

### Sprint 5 — Encryption

**Most productive workflow:**

1. `crypto.test.js` first — ALL tests before any implementation. No exceptions.
2. Tell the agent: "Coverage must be 100% per SRS.md §6.4. I will run coverage before accepting this."
3. For the IV-per-chunk spec, paste this explicitly:

```
From SRS.md §FR-13:
"Each chunk SHALL use a unique 12-byte random IV"
"The IV SHALL be prepended to the ciphertext before sending: [12 bytes IV][ciphertext]"

Implement encryptChunk() to generate a new random IV for each call.
Never reuse an IV. The IV must be the first 12 bytes of the output.
```

4. Run the encrypt/decrypt round-trip test manually with a real file before integrating

**Watch for:** agents using a single IV for all chunks (encryption textbook mistake). The test for "produces different ciphertext for same plaintext" catches this.

---

### Sprint 6 — Deployment

**Most productive workflow:**

1. Give the agent `deployment-doc.md §2.1` (Dockerfile spec) and ask it to build locally first
2. WebSocket proxy config is the #1 failure point — paste the Nginx spec from §4.1 explicitly
3. Ask the agent to verify the Upgrade headers are present after writing the Nginx config:

```
After writing nginx.conf, verify these two directives are present 
in the /ws/ location block:
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
These are MANDATORY. Missing them causes WebSocket connections to fail silently.
```

4. Test across different networks (not just localhost) before declaring done

---

## 6. Using the Documentation System Effectively

### 6.1 Attach, don't summarize

When giving context to an AI agent, paste the relevant section verbatim rather than summarizing it. Summaries introduce your interpretation. The spec is the spec.

**Less effective:**
```
The password shouldn't go to the server.
```

**More effective:**
```
From BRD.md §BR-03: "The password MUST NOT be transmitted to the server 
in any form (not even hashed, except for room-entry verification which 
uses a separate server-side bcrypt hash)."
```

### 6.2 Use section numbers as shorthand

Once you've established that the agent has read the docs, you can reference by section number:

```
Implement the handler for the create-room message per SRS.md §4.1. 
Write the test per development-guideline.md §3.4 naming conventions.
```

This only works reliably if you've confirmed the agent has the documents. Start longer sessions by pasting key sections.

### 6.3 When the agent contradicts the spec

If an agent produces code that deviates from the spec, don't argue in prose. Point to the spec:

```
The code you wrote sends the password to the server as a hash.
This violates BRD.md §BR-03 explicitly.
Rewrite this function so no password data reaches the server.
The server-side bcrypt check exists only for room entry (create-room message).
The encryption key must be derived entirely client-side.
```

Confronting the agent with the spec is more effective than explaining why.

---

## 7. Session Management

### 7.1 Start each session with a context reminder

AI agent context resets between sessions. Start each new session with:

```
We are building P2P Share — a privacy-first P2P file transfer app.
Current sprint: [Sprint N]
Current task: [what you're working on]
Architecture rule: the signaling server NEVER handles file bytes.
Module boundary rule: [relevant rule for today's work]
We follow TDD — tests before implementation.
```

30 seconds of context-setting prevents 30 minutes of re-aligning.

### 7.2 Commit frequently and tell the agent

When you commit code between sessions, tell the agent what's complete:

```
Committed: Sprint 1 complete.
- config.py ✅ (all tests pass)
- models.py ✅ (all tests pass)  
- room_manager.py ✅ (all tests pass, 96% coverage)
- main.py ✅ (WebSocket relay tested with two clients)

Starting Sprint 2. Read frontend-doc.md §2-4 before proceeding.
```

### 7.3 Keep a decision log

Maintain a short `DECISIONS.md` file and update it when you deviate from the spec or make a judgment call:

```markdown
## Decisions Log

2026-02-15: Used bcrypt rounds=10 in test config (not 12) for faster test runs.
  Production still uses 12 per config.py.

2026-02-18: Added `room_id` to join URL instead of just code.
  Reason: allows direct WebSocket connection without code lookup round-trip.
  Update: SRS.md §FR-02 updated to reflect this.
```

Share this file with the agent at the start of each session. It prevents it from "fixing" your intentional deviations.

---

## 8. Red Flags — When to Stop and Redirect

Stop the agent and redirect if you see any of these:

| Red Flag | Problem | What to do |
|----------|---------|------------|
| Agent adds a `database.py` or SQLite dependency | Scope creep — no DB needed | Redirect: see `BRD.md §G1`, in-memory state is correct |
| Agent sends file data through the WebSocket route | Architecture violation | Hard stop — this breaks the core privacy guarantee |
| Agent adds `npm install` to the frontend | Bundle creep | Redirect: frontend is vanilla JS, no bundler |
| Agent adds user auth / login flow | Scope creep | Redirect: `BRD.md §7` explicitly excludes auth |
| Agent uses `var` or callbacks instead of `async/await` | Style violation | Redirect to `development-guideline.md §6.2` |
| Agent writes implementation before tests | TDD violation | Hard stop — delete implementation, ask for test first |
| Agent hardcodes TURN credentials in JS | Security violation | Hard stop — credentials must come from `/api/ice-config` |
| Agent changes project directory structure | Structure violation | Hard stop — `SRS.md §1.3` is canonical |
| Agent uses a single IV for all encrypted chunks | Cryptography error | Hard stop — each chunk needs a unique random IV |
| Agent changes the WebSocket message protocol | Protocol violation | Stop — any protocol change requires updating `SRS.md §4` first |

---

## 9. The Verification Checklist

Before accepting any AI-generated code into the codebase, run through this checklist:

```
[ ] Tests exist for this code (TDD was followed)
[ ] Tests pass: uv run pytest (backend) or npx vitest run (frontend)
[ ] Module boundaries are respected (no cross-module logic leaks)
[ ] No secrets are hardcoded
[ ] No file bytes flow through the WebSocket endpoint
[ ] Code matches the relevant SRS requirement
[ ] No out-of-scope features were added
[ ] Error handling is present (not bare except: or missing .catch())
[ ] Comments explain WHY, not WHAT (the code explains what)
```

Print this checklist. Check it manually before every commit.

---

## 10. The Highest-Leverage Things You Can Do

Ranked by impact on AI output quality:

1. **Write detailed prompts with pasted spec sections.** 10× more effective than vague requests.
2. **Enforce TDD — stop the agent if it writes implementation first.** Saves hours of debugging.
3. **Test every sprint manually across real networks before moving on.** WebRTC bugs only appear on real networks, not localhost.
4. **Keep sessions focused: one module, one sprint.** Context dilution kills output quality.
5. **Paste error messages + relevant spec section when debugging.** "It's broken" is useless. "It's broken and here's what the spec says it should do" is actionable.
6. **Read the output before running it.** Five minutes of reading catches most issues before they become bugs.
7. **Update DECISIONS.md after every non-trivial judgment call.** Your future self and the AI agent will thank you.
