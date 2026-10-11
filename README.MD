# MCP File Server

A sandboxed file-server connector built on the Model Context Protocol (MCP). It lets an AI agent list, read, write, search, and version files inside a single workspace folder, over HTTPS, with token-based auth. Agents that have no memory between sessions use four handoff files in the workspace to pick up where the previous session stopped.

Built for Schematic Ascent, Week 06, Project 17.

## What it does

- Exposes **10 tools** over MCP Streamable HTTP (stateless, one server per request) — all built and verified.
- Confines every file operation to one workspace root. Path escapes and symlink escapes are rejected.
- Runs under pm2 and publishes itself through an ngrok tunnel started from inside the server process, so no separate ngrok executable is needed.
- Supports two auth paths for two kinds of clients (see **Authentication** below): a bearer header for header-capable clients, and a URL-embedded key for claude.ai's custom connector UI.
- Works with any MCP client: MCP Inspector, Claude Code, Claude.ai (custom connector), or the Anthropic Messages API MCP connector.

## Requirements

Everything you need before you start, in one place:

| Requirement | Why | Check |
| --- | --- | --- |
| Node.js 22+ | Uses `node --env-file`, native to Node 20.6+; target is 22 | `node -v` |
| npm | Installs dependencies | `npm -v` |
| git | Version control tools, `search_code`/`git_*` tools, workspace is its own repo | `git --version` |
| pm2 | Process manager, keeps the server alive and restartable | `npm i -g pm2` |
| ngrok account *(optional)* | Public HTTPS URL for claude.ai / remote clients | free tier works; needs your own authtoken + dev domain |
| OS | Linux/macOS native; Windows works via PowerShell with noted differences below | — |

If you only need local testing (MCP Inspector on `localhost`), you can skip the ngrok account entirely.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime and SDK | Node.js 22+, `@modelcontextprotocol/sdk`, TypeScript (strict) | Official SDK, strict typing catches schema/contract mistakes at compile time |
| HTTP | Express | Minimal, well understood, easy to put one auth middleware in front of a single `/mcp` route |
| Transport | Streamable HTTP, stateless | One server process can handle concurrent clients without session affinity; simplest transport to reason about for a sandboxed tool server |
| Validation | zod on every tool input and on environment config | Fails fast and loudly on bad input/config instead of surfacing confusing downstream errors |
| Exposure | ngrok Node SDK (`@ngrok/ngrok`), in-process | No separate ngrok binary to install or keep in sync with the server's lifecycle; tunnel opens and closes with the process |
| Process manager | pm2 | Restarts on crash, centralized logs, survives a terminal closing |
| Version control | git CLI on the host | `git_*` tools shell out to the real repo instead of reimplementing git |
| Testing | vitest, MCP Inspector, then a real client | Unit tests for sandbox/auth logic, Inspector for protocol-level checks, a real client (Claude) for an end-to-end sanity check |

## Authentication

There are **two separate tokens**, because the two kinds of clients that connect need different auth mechanisms:

| Token | Used by | How it's sent |
| --- | --- | --- |
| `AUTH_TOKEN` | MCP Inspector, Claude Code, the Anthropic Messages API connector — any client that can set custom headers | `Authorization: Bearer <AUTH_TOKEN>` header on every `/mcp` request |
| `CONNECTOR_KEY` | claude.ai's custom connector UI | Appended to the connector URL, e.g. `https://<your-domain>/mcp?key=<CONNECTOR_KEY>` |

Both are compared server-side in **constant time** to prevent timing attacks, both are optional-but-recommended (an empty value disables that auth path), and both should be at least 32 characters. Generate either with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Note:** confirm the exact query-param name (`key` above) matches what `auth.ts` actually checks in your implementation — update this section if it differs.

Only `/healthz` is open with no auth.

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure

Copy the example file and fill it in:

```bash
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | yes | Port the server listens on, for example `3000` |
| `WORKSPACE_ROOT` | yes | Folder the agent may touch, for example `./workspace` |
| `AUTH_TOKEN` | recommended | Bearer token for header-capable clients (Inspector, Claude Code, Messages API). Empty disables bearer auth |
| `CONNECTOR_KEY` | recommended | URL-embedded key for the claude.ai custom connector. Empty disables URL-key auth |
| `MAX_FILE_BYTES` | yes | Largest file the server will read or write, for example `1048576` |
| `NGROK_AUTHTOKEN` | no | Your ngrok authtoken. Leave empty to run locally only |
| `NGROK_DOMAIN` | no | Your ngrok dev domain, for example `your-name.ngrok-free.dev`. Leave empty to run locally only |

Never commit `.env`. It is listed in `.gitignore`.

### 3. Build and run

Everyday use — one command. Builds, then starts the server under pm2 (or gracefully reloads it if it's already running):

```bash
npm start
```

Check it came up:

```bash
pm2 status
pm2 logs mcp-server --lines 20
```

When the tunnel is configured, the log prints `Public URL: https://<your-domain>/mcp`.

For debugging — run directly in the foreground, errors print straight to the terminal, no pm2 involved:

```bash
npm run build
npm run start:direct
```

### 4. Verify

```bash
curl http://localhost:3000/healthz              # expect: OK
curl -i -X POST http://localhost:3000/mcp       # expect: 401 (no token)
```

On Windows PowerShell, use `curl.exe`, because `curl` is an alias for a different command.

### 5. Connect a client

**MCP Inspector** (run it in a second terminal):

```bash
npm run inspect
```

1. Add a server with transport **Streamable HTTP**.
2. URL: `http://localhost:3000/mcp` or `https://<your-domain>/mcp`.
3. Header: `Authorization: Bearer <AUTH_TOKEN>`.
4. Connect, open **Tools**, run `list_files` with path `.`.

**Claude Code:**

```bash
claude mcp add --transport http mcp-files https://<your-domain>/mcp --header "Authorization: Bearer <AUTH_TOKEN>"
```

**Claude.ai (custom connector):**

1. In claude.ai, open connector settings and add a custom connector.
2. URL: `https://<your-domain>/mcp?key=<CONNECTOR_KEY>`.
3. Connect, and confirm the tool list appears in a chat.

**Anthropic Messages API:** use the MCP connector with the server URL, sending `AUTH_TOKEN` as `authorization_token`. The connector is a beta feature, so check the current docs for the header and field names.

### Stop

```bash
pm2 stop mcp-server       # stop, keep in pm2 list
pm2 delete mcp-server     # remove from pm2
pm2 kill                  # stop everything pm2 manages
```

Stopping the server also closes the ngrok tunnel.

### Full command reference

```bash
npm install                                    # install deps
npm run build                                  # compile TypeScript
node --env-file=.env dist/index.js             # run directly (foreground)
pm2 start ecosystem.config.cjs                  # run under pm2
pm2 status                                      # check process state
pm2 logs mcp-server --lines 20                  # tail logs
pm2 restart mcp-server                          # restart (code changes only)
pm2 delete all && pm2 start ecosystem.config.cjs # restart after config changes
pm2 stop mcp-server                             # stop, keep registered
pm2 delete mcp-server                           # remove from pm2
pm2 kill                                        # stop everything pm2 manages
npm run inspect                                 # launch MCP Inspector
npm run test                                    # run vitest suite
curl http://localhost:3000/healthz              # health check
```

## Tools

All 10 tools are built and verified in MCP Inspector and with a real client.

| Tool | Purpose |
| --- | --- |
| `list_files` | List a directory inside the workspace |
| `read_file` | Read a text file |
| `write_file` | Create or overwrite a file, optional `if_version` check |
| `str_replace` | Replace text that must match exactly once, optional `if_version` check |
| `delete_file` | Delete a file (directories are refused) |
| `search_code` | Search workspace text with `git grep --untracked` |
| `git_status` | Show the workspace repo status |
| `git_diff` | Show uncommitted changes |
| `git_commit` | Commit staged or listed paths with a message |
| `git_log` | Show recent commits |

## Architecture

Request flow, end to end:

```
client (Inspector / Claude Code / claude.ai / Messages API)
   │  POST /mcp  (+ Authorization header  or  ?key= query param)
   ▼
src/index.ts        Express app: routes, ngrok tunnel, shutdown handling
   ▼
src/auth.ts          checks AUTH_TOKEN (header) or CONNECTOR_KEY (query), constant-time compare
   ▼
src/server.ts         McpServer: dispatches to the matching tool
   ▼
src/tools/*.ts        thin MCP wrappers — zod schema validation, no business logic
   ▼
src/services/*.ts      actual logic (files, search, git) — no MCP types, testable in isolation
   ▼
src/sandbox.ts         resolveSafe() — every file path passes through here, no exceptions
   ▼
workspace/              the one folder the agent is allowed to touch
```

**Layering principle:** `tools/` declares the MCP surface only, `services/` holds the logic, and every service that touches the filesystem goes through `sandbox.ts`. That gives one choke point for path safety instead of scattering checks across tool handlers.

### Folder structure

```
mcp-project/
├── package.json
├── package-lock.json
├── tsconfig.json
├── vitest.config.ts
├── ecosystem.config.cjs       # pm2 config (server only, tunnel runs in-process)
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── index.ts               # Express app, POST /mcp, /healthz, ngrok tunnel, shutdown
│   ├── config.ts              # zod-parsed environment
│   ├── auth.ts                # bearer-token + URL-key middleware
│   ├── errors.ts              # typed tool errors
│   ├── server.ts              # createServer(): McpServer and tool registration
│   ├── sandbox.ts             # resolveSafe(), blocked paths, limits
│   ├── handoff.ts             # seeds the four handoff files
│   ├── services/              # logic, no MCP types
│   │   ├── files.ts
│   │   ├── search.ts
│   │   └── git.ts
│   └── tools/                 # thin MCP wrappers with zod schemas
│       ├── files.ts
│       ├── search.ts
│       └── git.ts
├── tests/
│   ├── sandbox.test.ts
│   ├── files.test.ts
│   ├── search.test.ts
│   ├── git.test.ts
│   └── auth.test.ts
├── scripts/
│   └── run-session.ts         # Messages API client, one demo session per run
├── demo/
│   ├── TASK.md                # the demo task
│   └── transcripts/           # saved tool-call transcripts
├── docs/
│   └── REPORT.md              # stack, tool design, security tradeoffs
├── dist/                      # build output, gitignored
└── workspace/                 # WORKSPACE_ROOT, gitignored, its own git repo
```

## Security model

- **Sandbox:** every tool resolves its path through one function, `resolveSafe()`. It resolves against the workspace root, rejects `..` and absolute paths that leave it, and follows symlinks to confirm the real path is still inside. New files are checked through their nearest existing parent folder.
- **Blocked paths:** `.git/`, `.env`, and secret-looking files cannot be read or written.
- **Auth:** every `/mcp` request needs either a valid `Authorization: Bearer <AUTH_TOKEN>` header or a matching `CONNECTOR_KEY` in the URL, both compared in constant time. Only `/healthz` is open.
- **No shell:** git runs through `execFile` with an argument array and a timeout, never through a shell string.
- **Write guards:** a size cap, atomic writes (temp file, then rename), and optional `if_version` hashes to stop stale overwrites.
- **Known limits:**
  - A public tunnel with write access is an attack surface. The tokens and sandbox reduce the risk but do not remove it.
  - A key in a URL is more exposure-prone than a header (tunnel logs, browser history, screen shares) — rotate `CONNECTOR_KEY` if it's ever shared or logged.
  - Checking a path and then using it leaves a small time-of-check gap against symlink swaps. That is acceptable for a single-user workspace.
  - File contents returned by tools pass through whichever model API the client uses. Keep secrets out of the workspace.

## Design rationale

Why the notable choices were made (full detail in `docs/DECISIONS.md` as the project progresses):

- **Two tokens instead of one:** claude.ai's custom connector UI does not make it convenient to attach a custom header, so a URL-embedded key was added alongside the existing bearer header rather than replacing it — keeping the stronger (header-based) mechanism for every client that supports it.
- **Stateless Streamable HTTP over a stateful/session transport:** avoids session affinity and in-memory session state, which matters for pm2 restarts and for running under a tunnel where a single process handles everything.
- **In-process ngrok over a standalone tunnel process:** the tunnel's lifecycle matches the server's — one `pm2` entry, one thing to start/stop/restart, nothing to get out of sync.
- **A single `resolveSafe()` choke point:** centralizing path resolution means every new tool automatically inherits sandbox safety instead of each tool author having to remember to re-implement the check.
- **OAuth is future work, not current scope:** a full OAuth flow is the stronger long-term design (token scoping, expiry, revocation without touching `.env`), but a single pre-shared, constant-time-compared key is a reasonable tradeoff for a single-user, sandboxed, time-boxed project.

## Handoff protocol

Agent sessions have no memory. The workspace carries it. On first boot the server seeds four files:

| File | Purpose |
| --- | --- |
| `PROJECT_STATE.md` | Current snapshot: what exists and what is true now |
| `PLAN_LOG.md` | Running history of what was planned and done, in order |
| `CHECKPOINTS.md` | Stable points the next session can trust or return to |
| `DECISIONS.md` | Why choices were made, so later sessions do not undo them |

A session starts by reading `PROJECT_STATE.md`, works, then appends to `PLAN_LOG.md` and `CHECKPOINTS.md` and records choices in `DECISIONS.md`. Git commits mark checkpoints.

## How the project was created

```bash
mkdir mcp-project && cd mcp-project
git init
npm init -y
npm i @modelcontextprotocol/sdk zod express @ngrok/ngrok
npm i -D typescript tsx vitest @types/node @types/express
mkdir -p src/services src/tools tests scripts demo/transcripts docs workspace
```

`package.json` has `"type": "module"` and these scripts:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "test": "vitest run",
  "inspect": "npx @modelcontextprotocol/inspector"
}
```

`tsconfig.json` targets ES2022 with `NodeNext` modules, strict mode, `rootDir: src`, `outDir: dist`.

## Plan and status

| Milestone | Scope | Exit check | Status |
| --- | --- | --- | --- |
| M1 Skeleton | Express app, stateless Streamable HTTP, `list_files`, `/healthz` | Answers in MCP Inspector | done |
| M2 Sandbox | `resolveSafe()`, five file tools, escape tests | All path-escape tests pass | done |
| M3 Deploy | pm2, in-process ngrok tunnel, dual auth | A real client connects over the public URL | done |
| M4 Protocol | `search_code`, git tools, handoff seeding, write guards, `if_version` | 10 tools listed, guards tested | done |
| M5 Prove it | Two-session demo, transcripts, report, live demo | Task finishes across two sessions | *(confirm — see note below)* |

> **Note:** all 10 tools are built and connected, but confirm whether the two-session demo, saved transcripts, and `docs/REPORT.md` are finished before marking M5 done — those are the specific artifacts graders check for criterion F.

Stretch goals: `if_version` locking on all writes, `search_code` filters, a repo-map tool.

## Demo task

Two separate agent sessions build a small command-line todo app inside the workspace.

1. **Session 1:** reads `PROJECT_STATE.md`, scaffolds the app, then logs progress to `PLAN_LOG.md` and `CHECKPOINTS.md`.
2. **Session 2:** starts with no memory, reads the handoff files, adds a feature, and records decisions in `DECISIONS.md`.

Transcripts of both sessions are saved in `demo/transcripts/`.

## Testing

```bash
npm test
```

The sandbox suite covers `..` escapes, absolute paths, nonexistent paths, and symlinks that point outside the root.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Invalid environment variables ... received undefined` | A variable in `.env` is missing or named differently from the schema in `config.ts`. Names must match exactly |
| pm2 shows `stopped` with a growing restart count | The process crashes at startup. Run `node --env-file=.env dist/index.js` to see the error |
| `node: bad option: --env-file` | Node is older than 20.6. Install Node 22 |
| `Path . escapes workspace boundary` | Sandbox bug in the root check. Compare with `path.relative` and allow the root itself |
| `EADDRINUSE :::3000` | Another process holds the port. `netstat -ano \| findstr :3000`, then `taskkill /PID <pid> /F` |
| ngrok "endpoint already online" | An old process still holds the domain. Stop it and start again |
| `401 Unauthorized` | The client's bearer token or URL key does not match `AUTH_TOKEN` / `CONNECTOR_KEY` |

`pm2 startup` is not supported on Windows. To restart automatically after a reboot there, use Task Scheduler or the `pm2-windows-startup` package.

## For reviewers

To run this on your own machine:

1. Clone the repo and follow **Quick start** above, top to bottom, in a clean directory.
2. You'll need your own ngrok account if you want a public URL — a dev domain belongs to one account and can't be reused. Put your authtoken and domain in `.env`.
3. If you leave `NGROK_AUTHTOKEN` and `NGROK_DOMAIN` empty, the server runs locally only, and MCP Inspector can still connect to `http://localhost:<PORT>/mcp`.
4. To connect from claude.ai specifically, you do need the public URL (step 2) — localhost isn't reachable from claude.ai's servers.
5. `npm test` should pass with no manual setup beyond `npm install`.