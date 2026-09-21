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

**With any AI coding agent:** point your agent at this folder and ask it to "make
`<this API>` agent-ready" or "add an Agentic Action Layer in front of `<this endpoint>`,"
using `SKILL.md` as the instructions. How you point it there depends on what your agent
supports — drop the folder wherever your tool looks for skills/rules/instructions (for
example, a `skills/` or `.rules/` directory), reference `SKILL.md` directly in a prompt or
task file, or paste its contents into your repo's `AGENTS.md` if your agent reads that
convention instead. Whatever the entry point, the agent walks the same steps: find the
source of truth, pick operations deliberately instead of wrapping everything, write a spec
per operation, generate the five contracts against that spec in your own language, wire it
behind an MCP server, and run a drift check before calling it done.

**As a reference, without any agent at all:** `contract/` and
`templates/action-spec.template.md` stand on their own as a checklist and a spec format any
team can apply by hand, in any language, with any AI coding assistant or none at all.

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
