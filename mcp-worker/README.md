# erh-guardian-mcp (Cloudflare Worker)

MCP server exposing ERH Guardian's persistence layer — value-alignment profiles and the
gate-decision audit log — on Cloudflare D1, callable by the Strands agent over
streamable HTTP (`/mcp`) or SSE (`/sse`).

## Setup & deploy

```bash
cd hackathon/erh-guardian-agent/mcp-worker
npm install

# create the D1 database, then paste its id into wrangler.jsonc
npx wrangler d1 create erh-guardian

# generate + apply migrations
npm run db:generate
npm run db:migrate:local     # local dev
npm run db:migrate           # remote

npm run dev                  # http://localhost:8787

# set the shared secret guarding /mcp, /sse and non-GET /api/* (skip = open, dev only)
npx wrangler secret put MCP_AUTH_TOKEN

npx wrangler deploy
curl https://erh-guardian-mcp.<account>.workers.dev/health
```

## Auth

`/mcp`, `/sse` and any non-GET `/api/*` require `Authorization: Bearer <MCP_AUTH_TOKEN>`
once the secret is set; requests without it get a 401. `GET /api/profile`,
`GET /api/decisions` and `/health` are intentionally public — they feed the read-only
transparency panel. When `MCP_AUTH_TOKEN` is unset (local `wrangler dev`), the guard is
skipped and a warning is logged.

The guardian-console sandbox endpoints are also public by design (the panel's
terminal is the demo surface): they only write console-tagged rows, with tight
input caps.

## Guardian console (public sandbox)

- `POST /api/evaluate` — `{ "action_text": "...", "tool_name"?, "profile_id"? }`.
  Scores the proposed action with the same gate contract as the Python agent
  (`src/gate.ts`, a port of `erh_guardian.gate.decide` + `guardian_risk` on the
  ERH engine's deterministic lexical fallback), logs the decision
  (`auto_approved` or `blocked`), and returns the verdict plus a step-by-step
  `trace` of the gate's reasoning.
- `POST /api/decisions/:id/approve` — human-in-the-loop resolution: flips one
  `blocked` decision to `human_approved` (409 if it isn't pending).

## Connecting from the Strands agent

```python
from mcp.client.streamable_http import streamablehttp_client
from strands.tools.mcp import MCPClient

mcp = MCPClient(lambda: streamablehttp_client(
    "https://erh-guardian-mcp.<account>.workers.dev/mcp",
    headers={"Authorization": "Bearer <MCP_AUTH_TOKEN>"},
))
with mcp:
    tools = mcp.list_tools_sync()
    agent = Agent(model=bedrock_model, tools=[*ALL_TOOLS, *tools])
```

## Tools

- `get_profile` / `update_profile` — value-alignment profile CRUD
- `log_decision` — append a GuardianGate decision to the audit log
- `list_decisions` — recent decisions, newest first (transparency panel feed)
