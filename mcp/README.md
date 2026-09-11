# Area 67 private MCP service

Implementation-ready private bridge for durable, owner-scoped AI handoffs. It runs as a
Cloudflare Worker, stores packets in D1, exposes stateless MCP over Streamable HTTP, and offers
the same lifecycle through a small JSON API for the Area 67 hub.

## Security boundary

- Every `/mcp` and `/api/*` request requires `Authorization: Bearer …`.
- Tokens must be at least 24 characters and are compared with a timing-safe Web Crypto primitive.
- Every database read and write is scoped to the authenticated `owner_id`.
- Packet creation enforces contract fields, a 64 KB limit, and a likely-secret scan.
- Lifecycle writes require an expected version, preventing silent lost updates.
- The browser origin is allowlisted; wildcard CORS is not used.
- No secret is committed. Copy `.dev.vars.example` to `.dev.vars` for local work.

The bearer-token mode is a development boundary, not the final cross-client identity system.
Production deployment remains **WALLED** until Jorge chooses an identity provider. Replace this
guard with Cloudflare's OAuth Provider integration before connecting Claude, Cursor, ChatGPT, or
other remote clients.

## Tools

| Tool | Purpose |
| --- | --- |
| `route_job` | Resolve intent to the owning surface/model |
| `quota_guard` | Flag protected-model routes |
| `create_handoff` | Validate, privacy-check, and store one packet |
| `get_handoff` | Retrieve one owner-scoped packet |
| `list_inbox` | List the owner's inbox/outbox |
| `transition_handoff` | Enforce lifecycle and optimistic versioning |
| `pass_context` | Return only contract, route, and provenance |

## Local validation

```bash
cd mcp
cp .dev.vars.example .dev.vars # replace the token; never commit this file
npm install
npm run types
npm run typecheck
npm test
npm run build                  # Wrangler dry-run only; does not deploy
```

Apply the local D1 migration before manual API/MCP testing:

```bash
npx wrangler d1 migrations apply area67-private --local
npm run dev
```

## Deployment walls

1. Replace the placeholder D1 database ID by creating or selecting a production database.
2. Choose GitHub, Google, Auth0, WorkOS, Stytch, or Cloudflare Access for OAuth.
3. Set the production hub origin.
4. Configure secrets through Wrangler/Cloudflare—not `vars` or source control.
5. Validate OAuth, origin rejection, owner isolation, and token revocation in staging.
