# Agentic Action Layer

An agent-agnostic skill package that generates the middleware layer between an existing API
and the AI agents trying to call it — without rewriting the API. Written as a markdown
instruction file plus a contract (JSON Schemas + rules), so it loads into any AI coding
agent that can read a skill/instructions file — Claude Code, Cursor, OpenCode, Windsurf,
Copilot workspace, Aider, or a repo's own `AGENTS.md` — not tied to one vendor.

## The problem this is for

We built APIs for humans. Two decades of clean endpoints, all resting on a quiet
assumption: a developer, or code a developer wrote and tested, is on the other side. That
assumption held well enough that we tolerated drift — an API's real behavior slowly
diverging from its spec, its contracts, and its documentation — because a human hitting a
confusing error could still puzzle it out.

Agents can't puzzle it out. They don't read prose docs, can't negotiate an ambiguous error,
can't sit through a long synchronous call, and shouldn't be trusted to fire an irreversible
action with no way to preview it first. Agent-facing drift isn't a new failure mode — it's
the same one, showing up at a new interface, and it deserves the same discipline
spec-driven development already applies on the human-facing side: a written source of
truth, generated artifacts traced back to it, and a check that catches drift instead of
tolerating it.

That's what this skill generates: **five contracts**, derived from a written spec for each
action you choose to expose, wired behind an agent-facing interface (an MCP server, by
default).

| Contract | Problem it closes |
|---|---|
| **Capability Manifest** | Agents don't read docs — they need machine-readable intent instead |
| **Error Envelope** | Agents can't negotiate `400 Bad Request: invalid input` — they need structured, self-correcting errors |
| **Idempotency** | Agents retry aggressively and non-deterministically — retries need to be safe by default |
| **Async Job** | Agents can't sit through a 45-second blocking call — long work needs to be a pollable job |
| **Guardrail** | Agents shouldn't fire irreversible actions blind — consequential actions need dry-run and confirmation |

## What's in this repo

```
agentic-action-layer/
├── SKILL.md                          # the skill itself — read this first
├── contract/
│   ├── constitution.md               # the five non-negotiable rules, spec-driven-dev style
│   ├── capability-manifest.schema.json
│   ├── error-envelope.schema.json
│   ├── async-job.schema.json
│   ├── idempotency-contract.md
│   └── guardrail-contract.md
├── templates/
│   ├── action-spec.template.md       # per-operation spec you fill in before generating
│   ├── reference-impl.ts             # illustrative only — shows all 5 contracts composed
│   └── reference-impl.py             # illustrative only — shows the async job contract
└── examples/
    └── worked-example-refund.md      # one operation, fully filled in, start to finish
```

This is deliberately **not** a runnable framework or an npm package — it's a contract (JSON
Schemas + rules) and a set of generation instructions that adapt to whatever language and
conventions your target codebase already uses. That's what makes "wrap this API without
rewriting it" actually true regardless of what the API is written in.

## Using it

This is not something you `npm install` or run as a server. It's a set of instructions an
AI coding agent reads, plus a contract it generates code against, inside **your own**
codebase (the one with the API you want to wrap). Nothing in this repo runs standalone —
you always end up with new files inside your target project, not inside this one.

### Quick start with Claude Code

1. **Copy the skill into your target project**, keeping the folder name `agentic-action-layer`
   (Claude Code discovers skills by folder name under `.claude/skills/`, and that name is
   what `SKILL.md`'s frontmatter also declares):

   ```
   git clone https://github.com/goelsonali/agent-ready-api.git
   cp -r agent-ready-api/. /path/to/your-project/.claude/skills/agentic-action-layer/
   ```

   (Swap `.claude/skills/` for wherever your agent looks — see "Other agents" below.)

2. **Open Claude Code in your target project** (a fresh session, so it picks up the new
   skill), and ask for it in plain language. Any of these will trigger it:

   - "Make the `/orders/{id}/refunds` endpoint agent-ready"
   - "Add an Agentic Action Layer in front of the checkout API"
   - "Build an MCP server for the billing service"
   - "Wrap this API for AI agents"

3. **Answer the questions it asks you.** It will not silently generate code. Per
   `SKILL.md`, it works through 7 steps, in order, and steps 1–2 require your input:

   - **Step 1 — source of truth.** It will ask for an OpenAPI/Swagger file, a GraphQL
     schema, the actual route handler code, or (if none of those exist) a plain-language
     description from you. If you have nothing machine-readable, say so — it will write an
     `contract/inferred-<operation>.md` note and flag it as inferred rather than fabricate
     a manifest from guesses.
   - **Step 2 — which operations.** It will ask which specific operations should be
     agent-callable, and push back on "just wrap everything" (an agent choosing between 40
     similar tools performs worse than one choosing between 6 well-described ones). It
     will also classify each one as read-only / mutating-reversible / consequential —
     confirm or correct that classification, since it decides which contracts apply later.
   - **Steps 3–7 run mostly on their own**: it writes a spec file per operation, generates
     the five contracts against your codebase's actual language and conventions, wires an
     MCP server, re-checks the generated manifest against the source of truth from step 1,
     and finishes with a summary table.

4. **Review what it produced** (see "What to expect" below) before wiring the MCP server
   into anything that calls real agents against real data — treat the first pass like any
   other AI-generated PR.

### Other agents (Cursor, Windsurf, Copilot Workspace, OpenCode, Aider, etc.)

The mechanism differs per tool, the instructions don't:

- **Tools with a skills/rules directory** (e.g. Cursor's `.cursor/rules`, similar
  conventions elsewhere): drop this folder there instead of `.claude/skills/`, then invoke
  it the same way — ask in plain language to make an API agent-ready.
- **Tools that read `AGENTS.md`**: paste `SKILL.md`'s contents into your repo's
  `AGENTS.md` (or reference it: "follow the instructions in
  `agentic-action-layer/SKILL.md`"), then prompt as above.
- **Anything else**: reference `SKILL.md` directly in your prompt or task file — e.g.
  "Follow the steps in `agentic-action-layer/SKILL.md` to wrap `POST /orders/{id}/refunds`."
  The file is self-contained; it doesn't assume a specific agent product anywhere in it.

### Without any agent at all

`contract/` (the five contracts) and `templates/action-spec.template.md` (the spec format)
stand on their own as a manual checklist. A team can fill in the spec template by hand,
write the five contracts against it themselves, and use `contract/constitution.md` as a
code-review checklist — no AI agent required at any step.

## What to expect

Nothing in this repo's own folder changes when you run the skill — everything it generates
lands **inside your target project**. For one operation (say, `issue_refund`), expect
roughly this, using whatever language/framework your project already uses:

```
your-project/
├── specs/
│   └── issue_refund.spec.md          # step 3 — the filled-in template, source of truth
│                                      #   for everything below; edit this first, not the
│                                      #   generated code, when the operation changes later
├── src/.../agent/
│   ├── manifest/issue-refund.json    # step 4 — capability manifest entry
│   ├── errors/...                    # step 4 — error envelope mapping for this operation
│   ├── idempotency/...               # step 4 — dedup store + key handling (mutating ops)
│   └── guardrail/...                 # step 4 — dry-run + confirmation token flow
│                                      #   (consequential ops only)
└── (MCP server wiring, e.g. an mcp-server.ts/py or a new tool registration in an
    existing one)                     # step 5 — one MCP tool exposing issue_refund,
                                       #   inputSchema and description taken verbatim
                                       #   from the manifest
```

Plus, printed at the end in your agent's chat, a **step 7 summary table** — the actual
deliverable to point at when someone asks "is this API agent-ready?":

| Operation | Manifest | Error Envelope | Idempotency | Async | Guardrail |
|---|---|---|---|---|---|
| `issue_refund` | ✅ | ✅ | ✅ | n/a (fast) | ✅ (consequential) |

`examples/worked-example-refund.md` shows this whole thing filled in end to end for a real
(hypothetical) refund endpoint — read it if you want to see the actual JSON/code shape
before running the skill on your own API, not just the description above.

## Talk

Built for "Agent-Ready APIs: The Layer You're Not Building Yet" — API Days London. The five
contracts here are the "five things agents need" from the talk; `examples/worked-example-refund.md`
is the walk-through of wrapping a real API; `contract/constitution.md` is the middleware
pattern itself, stated as enforceable rules rather than an adjective.

## A note on the name

"Agentic Action Layer" has also been used (May 2026) by a physical-security AI vendor
describing a closely related idea for access-control systems — worth a mention or citation
in the talk rather than a surprise in Q&A. The pattern converging independently in two
different domains is, if anything, a point in its favor.
