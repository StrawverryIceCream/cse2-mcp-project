# MCP File Server

A sandboxed file-server connector built on the Model Context Protocol (MCP). It lets an AI agent list, read, write, search, and version files inside a single workspace folder, over HTTPS, with bearer-token auth. Agents that have no memory between sessions use four handoff files in the workspace to pick up where the previous session stopped.

Built for Schematic Ascent, Week 06, Project 17.

## What it does

- Exposes 10 tools over MCP Streamable HTTP (stateless, one server per request).
- Confines every file operation to one workspace root. Path escapes and symlink escapes are rejected.
- Runs under pm2 and publishes itself through an ngrok tunnel started from inside the server process, so no separate ngrok executable is needed.
- Works with any MCP client: MCP Inspector, Claude Code, or the Anthropic Messages API MCP connector.

## Stack

| Layer           | Choice                                                        |
| --------------- | ------------------------------------------------------------- |
| Runtime and SDK | Node.js 22+, `@modelcontextprotocol/sdk`, TypeScript (strict) |
| HTTP            | Express                                                       |
| Transport       | Streamable HTTP, stateless                                    |
| Validation      | zod on every tool input and on environment config             |
| Exposure        | ngrok Node SDK (`@ngrok/ngrok`), in-process                   |
| Process manager | pm2                                                           |
| Version control | git CLI on the host                                           |
| Testing         | vitest, MCP Inspector, then a real client                     |

## Quick start

### Prerequisites

- Node.js 22 or newer (`node -v`)
- git (`git --version`)
- pm2: `npm i -g pm2`
- Optional, for a public URL: a free ngrok account (your authtoken and your assigned dev domain)

### 1. Install

```bash
npm install
```

### 2. Configure

Copy the example file and fill it in:

```bash
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

| Variable            | Required | Description                                                       |
| ------------------- | -------- | ----------------------------------------------------------------- |
| `PORT`              | yes      | Port the server listens on, for example `3000`                    |
| `WORKSPACE_ROOT`    | yes      | Folder the agent may touch, for example `./workspace`             |
| `AUTH_TOKEN`        | yes      | Bearer token clients must send. Generate one below                |
| `MAX_FILE_BYTES`    | yes      | Largest file the server will read or write, for example `1048576` |
| `NGROK_AUTHTOKEN`   | no       | Your ngrok authtoken. Leave empty to run locally only             |
| `NGROK_DOMAIN`      | no       | Your ngrok dev domain, for example `your-name.ngrok-free.dev`     |
| `ANTHROPIC_API_KEY` | no       | Only for the demo script that calls the Messages API              |

Generate a token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env`. It is listed in `.gitignore`.

### 3. Build and run

Run directly, which prints errors straight to the terminal:

```bash
npm run build
node --env-file=.env dist/index.js
```

Or run under pm2:

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs mcp-server --lines 20
```

When the tunnel is configured, the log prints `Public URL: https://<your-domain>/mcp`.

After editing `ecosystem.config.cjs`, use `pm2 delete all` and then `pm2 start ecosystem.config.cjs`. A plain `pm2 restart` does not re-read the config file.

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

**Anthropic Messages API:** use the MCP connector with the server URL and `authorization_token`. The connector is a beta feature, so check the current docs for the header and field names.

### Stop

```bash
pm2 stop mcp-server       # stop, keep in pm2 list
pm2 delete mcp-server     # remove from pm2
pm2 kill                  # stop everything pm2 manages
```

Stopping the server also closes the ngrok tunnel.

## Tools

| Tool          | Purpose                                                                | Status  |
| ------------- | ---------------------------------------------------------------------- | ------- |
| `list_files`  | List a directory inside the workspace                                  | built   |
| `read_file`   | Read a text file                                                       | planned |
| `write_file`  | Create or overwrite a file, optional `if_version` check                | planned |
| `str_replace` | Replace text that must match exactly once, optional `if_version` check | planned |
| `delete_file` | Delete a file (directories are refused)                                | planned |
| `search_code` | Search workspace text with `git grep --untracked`                      | planned |
| `git_status`  | Show the workspace repo status                                         | planned |
| `git_diff`    | Show uncommitted changes                                               | planned |
| `git_commit`  | Commit staged or listed paths with a message                           | planned |
| `git_log`     | Show recent commits                                                    | planned |

## Security model

- **Sandbox:** every tool resolves its path through one function, `resolveSafe()`. It resolves against the workspace root, rejects `..` and absolute paths that leave it, and follows symlinks to confirm the real path is still inside. New files are checked through their nearest existing parent folder.
- **Blocked paths:** `.git/`, `.env`, and secret-looking files cannot be read or written.
- **Auth:** every `/mcp` request needs `Authorization: Bearer <AUTH_TOKEN>`, compared in constant time. Only `/healthz` is open.
- **No shell:** git runs through `execFile` with an argument array and a timeout, never through a shell string.
- **Write guards:** a size cap, atomic writes (temp file, then rename), and optional `if_version` hashes to stop stale overwrites.
- **Known limits:**
  - A public tunnel with write access is an attack surface. The token and sandbox reduce the risk but do not remove it.
  - Checking a path and then using it leaves a small time-of-check gap against symlink swaps. That is acceptable for a single-user workspace.
  - File contents returned by tools pass through whichever model API the client uses. Keep secrets out of the workspace.

## Handoff protocol

Agent sessions have no memory. The workspace carries it. On first boot the server seeds four files:

| File               | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `PROJECT_STATE.md` | Current snapshot: what exists and what is true now        |
| `PLAN_LOG.md`      | Running history of what was planned and done, in order    |
| `CHECKPOINTS.md`   | Stable points the next session can trust or return to     |
| `DECISIONS.md`     | Why choices were made, so later sessions do not undo them |

A session starts by reading `PROJECT_STATE.md`, works, then appends to `PLAN_LOG.md` and `CHECKPOINTS.md` and records choices in `DECISIONS.md`. Git commits mark checkpoints.

## Folder structure

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
│   ├── auth.ts                # bearer-token middleware
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

Layering: `tools/` declares the MCP surface only, `services/` holds the logic, and every service goes through `sandbox.ts`. That gives one choke point for path safety.

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

| Milestone   | Scope                                                                 | Exit check                                 | Status                                                     |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| M1 Skeleton | Express app, stateless Streamable HTTP, `list_files`, `/healthz`      | Answers in MCP Inspector                   | done                                                       |
| M2 Sandbox  | `resolveSafe()`, five file tools, escape tests                        | All path-escape tests pass                 | in progress                                                |
| M3 Deploy   | pm2, in-process ngrok tunnel, bearer auth                             | A real client connects over the public URL | server, tunnel, and auth running; real-client test pending |
| M4 Protocol | `search_code`, git tools, handoff seeding, write guards, `if_version` | 10 tools listed, guards tested             | not started                                                |
| M5 Prove it | Two-session demo, transcripts, report, live demo                      | Task finishes across two sessions          | not started                                                |

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

| Symptom                                                | Cause and fix                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Invalid environment variables ... received undefined` | A variable in `.env` is missing or named differently from the schema in `config.ts`. Names must match exactly |
| pm2 shows `stopped` with a growing restart count       | The process crashes at startup. Run `node --env-file=.env dist/index.js` to see the error                     |
| `node: bad option: --env-file`                         | Node is older than 20.6. Install Node 22                                                                      |
| `Path . escapes workspace boundary`                    | Sandbox bug in the root check. Compare with `path.relative` and allow the root itself                         |
| `EADDRINUSE :::3000`                                   | Another process holds the port. `netstat -ano \| findstr :3000`, then `taskkill /PID <pid> /F`                |
| ngrok "endpoint already online"                        | An old process still holds the domain. Stop it and start again                                                |
| `401 Unauthorized`                                     | The client's bearer token does not match `AUTH_TOKEN`                                                         |

`pm2 startup` is not supported on Windows. To restart automatically after a reboot there, use Task Scheduler or the `pm2-windows-startup` package.

## For reviewers

To run this on your own machine you need your own ngrok account, because a dev domain belongs to one account. Put your authtoken and domain in `.env`. If you leave both empty, the server runs locally only, and MCP Inspector can still connect to `http://localhost:<PORT>/mcp`.
