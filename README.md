# Agentic Action Layer

Wraps an existing API in a safety + discoverability layer for AI agents — without touching
the API itself. Point it at one operation; it hands back an agent-callable version with
structured errors, safe retries, and a preview-before-you-act step for anything risky.

Works with Claude Code, Cursor, Windsurf, Copilot Workspace, Aider, or any agent that reads
a skill/instructions file or `AGENTS.md`.

## Use it

```
git clone https://github.com/goelsonali/agent-ready-api.git
cp -r agent-ready-api/. /path/to/your-project/.claude/skills/agentic-action-layer/
```

Open your project in your AI coding agent (fresh session, so it picks up the skill) and ask:

> "Make the `POST /orders/{id}/refunds` endpoint agent-ready"

("Wrap this API for AI agents" and "build an MCP server for X" also work.)

It'll ask a couple of questions first — what's the API's contract (OpenAPI file, schema, or
just describe it), and which specific operations should be agent-callable — then generates
the layer inside *your* project. Nothing in this repo's own folder changes.

## Input → output, in one example

**Before** — a normal endpoint, built for a human or human-tested code:

```
POST /orders/{id}/refunds
Body: { "amount": number }
```

**After** — what an agent calls instead:

```
issue_refund({ orderId, amount, idempotencyKey, dryRun: true })
→ { preview, confirmationToken }              // no side effects yet

issue_refund({ orderId, amount, idempotencyKey, confirmationToken })
→ { ok: true, refundId, amount }              // or a structured, self-correcting error
```

Same underlying API, untouched. The agent gets a version of it that retries safely, fails
with an error it can act on without a human, and can't fire something irreversible blind.

## Want the details?

The five contracts it generates, why each one exists, the full 7-step process, and an FAQ
are in **[docs/REFERENCE.md](docs/REFERENCE.md)**. Start there before wrapping a
consequential (money-moving, irreversible) operation for the first time.
