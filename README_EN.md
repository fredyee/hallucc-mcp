# HallucC MCP Server

**[中文文档](./README.md)** ｜ [Live Demo](https://aihcc.cloud) ｜ [Official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=hallucc)

[![MCP Registry](https://img.shields.io/badge/MCP_Registry-active-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=hallucc)
[![npm](https://img.shields.io/npm/v/hallucc-mcp)](https://www.npmjs.com/package/hallucc-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> Give your AI a fact-checker and a safety gateway: claim-by-claim hallucination detection, agent trajectory evaluation, L0-L3 risk gating for Computer-Use Agent (CUA) actions, Agent source code static audit, and a 40+ feature prompt-injection / jailbreak guard — one MCP server, five tools, works with Claude Code / Cursor / Claude Desktop.

## See it first — no sign-up required

- 🔍 A real verification report (per-claim verdicts + confidence + sources): https://aihcc.cloud/r/GttouoJfMpkC
- 🛡️ Try CUA action gating online (rule-based, free, no quota cost): https://aihcc.cloud/cua
- 📝 Web app (3 free checks per day): https://aihcc.cloud


## Tools (5)

| Tool | Backend endpoint | What it does | Quota |
|---|---|---|---|
| `verify_text` | `POST /detect` | Claim-by-claim hallucination check: red/yellow/green summary + per-claim status/confidence/reason/**sources** + citations | ✅ detect |
| `verify_agent` | `POST /detect-agent` | Text-level verification of an agent's final output + 6-dimension trajectory evaluation (factuality / sourcing / instruction compliance / tool-claim consistency / task completion / reflection) | ✅ detect |
| `check_cua_actions` | `POST /cua/classify` | L0-L3 risk classification for Computer-Use Agent (CUA) actions + `takeover` (credential scenarios); covers sensitive paths/destructive commands, domain grading, payment-amount thresholds, task_scope intent deviation, and multi-agent delegation-chain taint analysis; response includes `ruleset_version` and `disclaimer` (pure rules, no LLM) | ❌ free |
| `check_cua_code_audit` | `POST /cua/audit-code` | Static audit of Agent source code: dangerous imports / permission boundaries / injection surfaces / dangerous defaults / sandbox absence | ❌ free |
| `check_safety` | `POST /guard/check` (`fast=true` → `/guard/check-fast`) | 40+ feature safety gateway: prompt injection / jailbreak / harmful content / PII leakage / fraud | ✅ detect |

> Auth model: each client sends `Authorization: Bearer <your HallucC API key>` → the server forwards it **as-is** to the backend → the backend validates and deducts from the same account quota as the web app. Keys travel only in HTTP headers — **never in tool arguments, never in model transcripts**.

### The tightening capabilities of `check_cua_actions`

| Field | Effect |
|---|---|
| `actions[].target_url` / `url` | Target URL of a browser action — navigation to an unknown domain escalates to L2; pasting sensitive content to a non-allowlisted domain escalates to L3; blacklisted domains are L3 |
| `task_scope.task` | Declares the intended task, used for deviation detection and audit traceability |
| `task_scope.allowed_apps` / `allowed_domains` | Allowed apps / domains (domain suffix matching includes subdomains) |
| `task_scope.forbidden_elements` | Forbidden element labels (highest precedence) |
| `actions[].chain_id` | Multi-agent delegation chain id (uuid hex) — when given, the response gains a `chain_trace` cross-hop taint analysis |
| `actions[].agent_id` / `parent_agent_id` | The agent owning this action / its delegating parent — pairs cross-agent-boundary propagation chains |
| `actions[].delegation_depth` | Delegation depth (root agent = 0); a subagent exfiltrating content matching sensitive patterns gets an L2 |

An action that leaves `task_scope` is **escalated one level** (L0→L1, L1→L2, L2 stays L2 with an "outside task scope" reason appended, L3 unchanged). This mechanism only tightens and never loosens; omitting `task_scope` has no effect. Credential fields and payment/login domains yield a `takeover` verdict (suspend and wait for the user to type it themselves — the agent never types your password).

Multi-agent setups (Claude Code Task subagents, Codex agents, Kimi, …): a parent agent reading a credential file (L0 on its own) → a subagent posting it out (L2 on its own) is harmless per hop and dangerous as a chain. Attach the delegation-chain fields to each action and the backend appends a `chain_trace`: when cross-agent propagation exists the chain aggregate level is raised to L3 and `risk_diluted` is set (the laundering signal). Leave the chain fields empty and behaviour is bit-for-bit unchanged — existing callers need no change.

The response's `ruleset_version` lets you verify that online detection and the local Gate run the same rule version.

## Hosted endpoint (recommended, zero local setup)

The MCP server is hosted at `https://aihcc.cloud/mcp` (remote, streamable-http). Point your client at it with your API key:

```bash
# Claude Code
claude mcp add --transport http hallucc https://aihcc.cloud/mcp \
  --header "Authorization: Bearer <your HallucC API key>"
```

Cursor / Claude Desktop work the same way: URL `https://aihcc.cloud/mcp`, header `Authorization: Bearer <key>`. Create your API key at https://aihcc.cloud (register → /keys). Free daily quota included.

### Or: run via npx (stdio, no clone needed)

```json
{
  "mcpServers": {
    "hallucc": {
      "command": "npx",
      "args": ["-y", "hallucc-mcp"],
      "env": { "HALLUCC_API_KEY": "<your HallucC API key>" }
    }
  }
}
```

Same five tools over stdio transport; the key comes from the environment and requests default to the hosted backend `https://aihcc.cloud/api`.

> **The base URL must keep the `/api` prefix**: nginx only proxies `/api/` to the backend. A bare
> `https://aihcc.cloud` reaches the frontend instead — the request returns 200 with an HTML body,
> fails silently (nothing lands in audit or in a fallback file), and the audit replay stays empty.

## Run locally (from source)

```bash
# 1. Install dependencies
npm install

# 2. (Optional) configure backend address & port; defaults to local :8001
cp .env.example .env
#   HALLUCC_BASE_URL=http://127.0.0.1:8001
#   PORT=8787

# 3. Make sure the backend is up: curl http://127.0.0.1:8001/health
# 4. Start the MCP server (dev with hot reload)
npm run dev
# or production: npm start
```

The server listens on `http://127.0.0.1:8787/mcp`; health check `GET /health`.

## Client setup

### Claude Code (CLI)

```bash
claude mcp add --transport http hallucc http://127.0.0.1:8787/mcp \
  --header "Authorization: Bearer <your HallucC API key>"

claude mcp list
# then in conversation: ask Claude to fact-check a passage or scan a prompt for injection
```

### Cursor

`Settings → MCP → Add MCP server`:
- Type: `http`
- URL: `http://127.0.0.1:8787/mcp`
- Headers: `{"Authorization": "Bearer <your HallucC API key>"}`

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hallucc": {
      "type": "http",
      "url": "http://127.0.0.1:8787/mcp",
      "headers": { "Authorization": "Bearer <your HallucC API key>" }
    }
  }
}
```

### MCP Inspector (debug — tool list & auth work without spending quota)

```bash
npx @modelcontextprotocol/inspector
# choose Streamable HTTP, URL http://localhost:8787/mcp
# add Custom Header: Authorization: Bearer <key>
```

## Auth & quota

- Missing/invalid `Authorization` header → 401 JSON-RPC error at the MCP layer.
- Valid key but quota exhausted → backend 429, mapped to "free quota exhausted, resets tomorrow or upgrade".
- Every tool response includes a `quota` object (backend `quota_status`), same source as the web dashboard, decremented per call.
- `check_cua_actions` and `check_cua_code_audit` are both pure rules — **no LLM, no quota cost**, safe for high-frequency use.

## Project layout

```
src/
  server.ts     Express + StreamableHTTP transport (stateless) + auth middleware + tool registration
  context.ts    config loading + API key extraction
  backend.ts    BackendClient (key pass-through, unified 401/429/5xx mapping) + toMcpResult
  schemas.ts    zod input schemas for the 5 tools (aligned with backend Pydantic Fields)
  tools/
    verifyText.ts       → /detect
    verifyAgent.ts      → /detect-agent
    checkCuaActions.ts    → /cua/classify
    checkCuaCodeAudit.ts  → /cua/audit-code
    checkSafety.ts        → /guard/check (fast → /guard/check-fast)
    index.ts            registerAllTools
```

## Transport

Streamable HTTP (the remote transport recommended by the current MCP spec, formerly "HTTP+SSE"), **stateless** mode: each POST spins up a fresh transport + McpServer and closes when done. Natively supported by Claude Code / Cursor / Claude Desktop. To support legacy SSE-only clients, add `SSEServerTransport` (dual endpoints `/sse` + `/messages`).

## Listed on

- ✅ Official MCP Registry: `io.github.fredyee/hallucc` v0.1.1 (active)
- ✅ ModelScope MCP Square: [@hallucC/hallucc](https://modelscope.cn/mcp/servers/hallucC/hallucc)
- ✅ Coze Store: [HallucC Fact-Check Assistant](https://www.coze.cn/store/agent/7685683870800494628)

## License

[MIT](./LICENSE)
