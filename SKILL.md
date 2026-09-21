---
name: agentic-action-layer
description: Use when an existing API (REST, RPC, GraphQL, internal service — with or without an OpenAPI spec) needs to be made safe and usable for AI agents, without rewriting the API itself. Generates a Capability Manifest, Error Envelope, Idempotency Contract, Async Job Contract, and Guardrail Contract around chosen operations, in the target codebase's own language, and wires them behind an agent-facing interface (MCP server by default). Trigger on requests like "make this API agent-ready," "wrap this API for AI agents," "build an MCP server for this service," "add an Agentic Action Layer," or "why does my agent keep misusing this endpoint."
---

# Agentic Action Layer

> Portability note: the frontmatter above (`name` + `description`) is a generic
> skill-file convention, not tied to one vendor's agent. Any AI coding agent that can load
> a markdown instruction file — by convention, by direct reference, or via a repo's
> `AGENTS.md` — can run this skill. Nothing below assumes a specific agent product.

## What this is

APIs drift from their spec, their contracts, and their documentation. That's not a new
problem — it's the same failure mode spec-driven development exists to prevent, just
showing up at a different interface. Human-facing APIs drifted from their docs for twenty
years and teams tolerated it because a developer reading a 400 error could still figure it
out. Agents can't. They don't read prose docs, can't negotiate an ambiguous error, can't
sit through a 45-second synchronous call, and shouldn't be trusted to fire an irreversible
action with no way to preview it first.

The Agentic Action Layer is the middleware that sits between an agent and an existing API
and closes that gap — without touching the underlying API's implementation. This skill
generates one, for a specific set of operations you choose, grounded in a written spec
(`templates/action-spec.template.md`) so the generated layer stays traceable to a source
of truth instead of becoming one more thing that drifts.

Read `contract/constitution.md` before generating anything — it is the non-negotiable
checklist every generated action must satisfy. The five contracts it enforces:

1. **Capability Manifest** (`contract/capability-manifest.schema.json`) — machine-readable
   intent, not prose docs.
2. **Error Envelope** (`contract/error-envelope.schema.json`) — structured, self-correcting
   errors instead of a status code and a sentence.
3. **Idempotency Contract** (`contract/idempotency-contract.md`) — safe retries for agents
   that retry aggressively and non-deterministically.
4. **Async Job Contract** (`contract/async-job.schema.json`) — long-running work exposed as
   a job resource, never a blocking call an agent has to sit through.
5. **Guardrail Contract** (`contract/guardrail-contract.md`) — dry-run and confirmation for
   any action that is costly, irreversible, or affects someone other than the caller.

This skill is intentionally language-agnostic. It does not ship a runnable framework you
`npm install`. It ships the *contract* (schemas + rules) and *generation instructions*, and
adapts the generated code to whatever language and conventions the target codebase already
uses. `templates/reference-impl.ts` and `templates/reference-impl.py` are illustrative only
— read them to understand the shape, don't copy them verbatim into a Go or Rust codebase.

## How to run this skill

Work through these steps in order. Do not skip the constitution or the spec step to get to
code faster — the generated layer is only trustworthy if it's traceable back to something
written down.

### 1. Establish the source of truth

Ask for, or locate, the target API's contract: an OpenAPI/Swagger file, a GraphQL schema,
a set of route handlers, or (if none exists) a plain description of the operation(s) from
the person you're working with. Note which of these you have — you'll need it again in
step 6 (drift check).

If there is genuinely no machine-readable contract anywhere (common for internal services),
say so explicitly before continuing. Generating a Capability Manifest from vibes instead of
a contract is exactly the drift this skill exists to prevent — write down what you're told
in a short `contract/inferred-<operation>.md` note and flag it as inferred, not authoritative.

### 2. Pick operations — do not wrap the whole API blindly

Ask which operations actually need to be agent-callable. Most APIs have 40 endpoints and an
agent needs 6. Wrapping everything indiscriminately produces a bloated manifest that hurts
the exact discovery problem this skill is meant to fix (an agent choosing between 40
similar-looking tools performs worse than one choosing between 6 well-described ones).

For each chosen operation, classify it up front — this classification drives which
contracts actually apply:

- **Read-only** (GET-like, no side effects): Capability Manifest + Error Envelope only.
  Idempotency and guardrails are structurally moot; async only if the read is genuinely slow.
- **Mutating, reversible, low-cost** (e.g. updating a draft, adding a label): add the
  Idempotency Contract. Guardrail contract optional.
- **Consequential** (costs money, is irreversible, notifies or affects a third party, or
  changes a security/access boundary): all five contracts apply, and the Guardrail Contract
  is mandatory, not optional. Refunds, deployments, deletions, sending external
  communications, and permission changes all belong here by default — do not let time
  pressure downgrade something consequential to save a step.

### 3. Write the spec for each operation

Copy `templates/action-spec.template.md` to `specs/<operation-name>.spec.md` and fill it in
completely before generating any code. This is the artifact that keeps the generated layer
from drifting later — six months from now, whoever changes this action should edit the spec
first, then regenerate, not hand-edit the generated manifest.

### 4. Generate the five artifacts per operation

From the filled-in spec, produce, validated against the schemas in `contract/`:

- a manifest entry (validate against `capability-manifest.schema.json`)
- the error mapping table (every distinct failure the underlying API can produce, mapped to
  an `error-envelope.schema.json`-shaped response — see `contract/idempotency-contract.md`
  and the worked example in `examples/worked-example-refund.md` for what "every distinct
  failure" actually means in practice, not just the happy-path 4xx/5xx split)
- idempotency handling, if the operation is mutating (contract in
  `contract/idempotency-contract.md`)
- async wrapping, if the operation's underlying latency can exceed ~2 seconds or is
  genuinely unbounded (schema in `contract/async-job.schema.json`)
- dry-run and confirmation handling, if the operation is consequential (contract in
  `contract/guardrail-contract.md`)

Write this in the target codebase's actual language and conventions. Use
`templates/reference-impl.ts` or `templates/reference-impl.py` only as a reference for the
*shape* of the solution, not as source to transliterate.

### 5. Wire it behind an agent-facing interface

Default to an MCP server (one tool per generated action, `inputSchema` taken directly from
the manifest's parameter schema, tool `description` taken directly from the manifest's
intent description — do not write a separate, shorter description for the MCP tool than the
one in the manifest; that's the first place drift creeps back in). If the person you're
working with wants function-calling schemas (OpenAI/Anthropic tool-use) or an OpenAPI
overlay instead, the manifest is the same source either way — only the outer projection
changes.

If an operation was classified as async in step 4, expose it as MCP's task/job pattern
(submit → poll, not a blocking tool call) rather than making the agent hang on a single
tool invocation. If it was classified as consequential, the dry-run and confirmation flow
should surface through the interface's own confirmation mechanism where one exists (e.g. an
elicitation-style pause-and-resume), falling back to a plain two-step "preview, then confirm
with the token you were given" tool pair where it doesn't.

### 6. Run the drift check

Before calling an operation done, re-read the source of truth from step 1 and confirm the
generated manifest's parameters, the error envelope's failure list, and the guardrail
classification still match it. If the source of truth is an OpenAPI file, diff the
operation's schema against what the manifest claims. If it changed and the manifest didn't,
that's drift — fix the manifest, don't rationalize the mismatch.

### 7. Report back

Summarize, per operation, which of the five contracts apply and are satisfied, in a short
table. Flag anything skipped and why (e.g. "read-only, guardrail contract not applicable").
This table is the thing worth putting on a slide — it's the proof that "agent-ready" is a
checklist you actually ran, not an adjective.

## Common mistakes this skill exists to prevent

- Treating the manifest description as a second documentation project, written once and
  left to drift from the spec, exactly like the human-facing docs did.
- Adding idempotency keys but no dedup store behind them (an idempotency key nobody checks
  is decoration).
- Making "async" mean "we return 202 and the agent is on its own" instead of a pollable job
  resource with a defined status contract.
- Making "dry-run" a boolean the underlying API silently ignores — a dry-run must be
  provably side-effect-free, not just labeled as one.
- Wrapping every endpoint because it was easy, instead of the handful an agent actually needs.
