# Architecture — MCP File Server

Status snapshot as of M3 (server, tunnel, and auth running; real-client test pending). This file describes the system as currently built, not the full target state — see `README.md` for the milestone plan.

## 1. Purpose and shape

A sandboxed file-server connector exposed over MCP (Model Context Protocol), Streamable HTTP, stateless (one server instance per request — no session affinity, no in-memory state between requests). It gives an AI agent a bounded set of operations against exactly one workspace folder, reachable over HTTPS via an in-process ngrok tunnel, gated by a single bearer token.

The core design constraint: an agent has no memory between sessions, so the workspace itself must carry continuity (see §6, Handoff protocol). Everything else in the architecture — the sandbox, the auth, the write guards — exists to make it safe to let an external, memoryless agent operate on real files unattended.

## 2. Request path

```
Client (MCP Inspector / Claude Code / Messages API connector)
        │  HTTPS, Authorization: Bearer <token>
        ▼
   ngrok tunnel (in-process, @ngrok/ngrok)
        │
        ▼
   Express app (src/index.ts)
        │  POST /mcp            → auth.ts middleware → McpServer (server.ts)
        │  GET  /healthz         → open, no auth
        ▼
   tools/*.ts   (zod-validated MCP tool surface)
        │
        ▼
   services/*.ts  (files.ts, search.ts, git.ts — pure logic, no MCP types)
        │
        ▼
   sandbox.ts   (resolveSafe(), blocked-path checks — the one choke point)
        │
        ▼
   workspace/   (WORKSPACE_ROOT — its own git repo, gitignored from the project repo)
```

Every file-touching call passes through `sandbox.ts` exactly once, regardless of which tool invoked it. That's the one place path safety is enforced, which is the main reason the layering below exists.

## 3. Layering and why it's split this way

| Layer        | File(s)                                                      | Responsibility                                   | Knows about MCP? |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------ | ---------------- |
| Transport    | `index.ts`                                                   | Express app, routing, tunnel lifecycle, shutdown | yes              |
| Auth         | `auth.ts`                                                    | Constant-time bearer-token check on `/mcp`       | no               |
| Tool surface | `tools/files.ts`, `tools/search.ts`, `tools/git.ts`          | zod schemas, thin adapters to services           | yes              |
| Logic        | `services/files.ts`, `services/search.ts`, `services/git.ts` | Actual behavior: read/write/search/git           | no               |
| Safety       | `sandbox.ts`                                                 | `resolveSafe()`, blocked-path list, size limits  | no               |
| Config       | `config.ts`                                                  | zod-parsed environment, fails fast on bad env    | no               |
| Errors       | `errors.ts`                                                  | Typed tool errors surfaced back through MCP      | no               |
| Continuity   | `handoff.ts`                                                 | Seeds/maintains the four handoff files           | no               |

The `tools/` vs `services/` split matters for one reason: `services/` has no dependency on MCP types, so the file/search/git logic is testable in isolation (see `tests/`) and could be reused behind a different transport without rewriting the safety-critical code. `tools/` stays thin on purpose — it should never contain logic that isn't also reachable by a test that doesn't go through MCP at all.

## 4. Security model (as built)

- **Sandbox (`sandbox.ts`):** `resolveSafe()` resolves every path against `WORKSPACE_ROOT`, rejects `..` segments and absolute paths that escape it, and follows symlinks to confirm the _real_ resolved path is still inside the root. A path to a not-yet-existing file is checked through its nearest existing parent directory instead of itself.
- **Blocked paths:** `isBlockedRelative()` refuses reads/writes to `.git/`, `.env`, and other secret-shaped files, independent of the sandbox check.
- **Auth:** every `/mcp` request requires `Authorization: Bearer <AUTH_TOKEN>`, compared in constant time. `/healthz` is the only open route.
- **No shell:** git commands run through `execFileSync`/`execFile` with an argument array and a timeout — never through a shell string — so there's no command-injection surface via file paths or commit messages.
- **Write guards (planned tools, designed now):** size caps against `MAX_FILE_BYTES`, atomic writes (write to temp file, then rename), optional `if_version` hash checks to reject stale overwrites.
- **Known, accepted limits:**
  - A public tunnel with write access is inherently an attack surface; the token and sandbox reduce but don't eliminate that.
  - Check-then-use leaves a small time-of-check-to-time-of-use gap against symlink swaps — accepted for a single-user workspace.
  - Whatever a tool returns passes through the client's model API, so secrets must stay out of the workspace entirely rather than relying on redaction.

## 5. Tool surface

| Tool          | Layer touched                    | Status    |
| ------------- | -------------------------------- | --------- |
| `list_files`  | files                            | **built** |
| `read_file`   | files                            | planned   |
| `write_file`  | files (+ sandbox write guards)   | planned   |
| `str_replace` | files (+ if_version)             | planned   |
| `delete_file` | files (files only, dirs refused) | planned   |
| `search_code` | search (`git grep --untracked`)  | planned   |
| `git_status`  | git                              | planned   |
| `git_diff`    | git                              | planned   |
| `git_commit`  | git                              | planned   |
| `git_log`     | git                              | planned   |

Only `list_files` is implemented; everything else is schema'd/scoped by the plan but not yet coded. `search_code`, all four git tools, write guards, and handoff seeding are grouped into M4 because they share one property: each needs the sandbox and blocked-path checks to already be solid, which is the actual gate, not the tool count.

## 6. Handoff protocol (continuity across memoryless sessions)

Four files live at the workspace root and are seeded on first boot by `handoff.ts`:

| File               | Role                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `PROJECT_STATE.md` | Current snapshot — what exists and is true right now                 |
| `PLAN_LOG.md`      | Append-only running history of what was planned/done, in order       |
| `CHECKPOINTS.md`   | Stable points a later session can trust or roll back to              |
| `DECISIONS.md`     | Rationale for choices, so a later session doesn't silently undo them |

Expected lifecycle of one session: read `PROJECT_STATE.md` → do work → append to `PLAN_LOG.md` and `CHECKPOINTS.md` → record any consequential choice in `DECISIONS.md`. Git commits are meant to mark the checkpoints, tying the handoff narrative to actual repo history.

## 7. Process and deployment

- `pm2` runs the compiled server (`ecosystem.config.cjs`); the ngrok tunnel runs **inside** the same Node process via the `@ngrok/ngrok` SDK, so there's no separate ngrok binary or second process to keep alive.
- Config changes to `ecosystem.config.cjs` require `pm2 delete all` + `pm2 start ecosystem.config.cjs` — a plain `pm2 restart` won't re-read it.
- Stopping the pm2-managed process also tears down the tunnel, since it's in-process.

## 8. Current gap between plan and reality (M3 → M4)

- Server, tunnel, and bearer auth are running end-to-end.
- A real external client has **not yet** been verified against the public ngrok URL (only localhost + Inspector so far implied by milestone wording) — that's the open exit check for M3.
- `resolveSafe()` and the sandbox test suite (`tests/sandbox.test.ts`) are the current center of gravity — M4's write tools, search, and git tools all depend on that boundary being airtight before they're worth building.
- Nothing in M4 or M5 (write guards, `if_version`, `search_code`, git tools, handoff seeding, two-session demo) has started.

---

_Generated from the project README as a structural reference. Update this file if the layering, security model, or milestone status changes materially — it's meant to stay a true snapshot, not a one-time artifact._
