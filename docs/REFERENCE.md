# Reference: how the Agentic Action Layer works

The deep-dive companion to the main [README](../README.md) — read that first for the
30-second version. This is for before you wrap something consequential for the first time,
or when you need to know exactly what a step does.

> **Naming note:** a physical-security AI vendor has also used "Agentic Action Layer" (May
> 2026) for a related but different idea (access-control systems). Different domain, same
> name — worth knowing before you go looking for prior art.

## The problem this is for

APIs were built assuming a developer (or code a developer tested) is on the other end — an
assumption that tolerated drift, because a confused human could still puzzle through a bad
error or a stale doc. Agents can't: they don't read prose docs, can't negotiate an ambiguous
error, can't sit through a long blocking call, and shouldn't fire an irreversible action
with no way to preview it first. This skill generates five contracts, derived from a written
spec for each action you choose to expose, wired behind an agent-facing interface (an MCP
server by default).

| Contract | Problem it closes |
|---|---|
| **Capability Manifest** | Agents don't read docs — need machine-readable intent instead |
| **Error Envelope** | Agents can't negotiate `400 Bad Request` — need structured, self-correcting errors |
| **Idempotency** | Agents retry aggressively and non-deterministically — retries must be safe by default |
| **Async Job** | Agents can't sit through a 45s blocking call — long work needs a pollable job |
| **Guardrail** | Agents shouldn't fire irreversible actions blind — need dry-run and confirmation |

## The 7 steps, in detail

1. **Source of truth.** It asks for an OpenAPI/Swagger file, a GraphQL schema, route handler
   code, or — if none of those exist — a plain-language description from you. No
   machine-readable contract? Say so explicitly: it writes a `contract/inferred-<op>.md`
   note and flags it as inferred, rather than fabricating a manifest from guesses.
2. **Which operations.** It asks which operations actually need to be agent-callable, and
   pushes back on "just wrap everything" — an agent choosing between 40 similar-looking
   tools performs worse than one choosing between 6 well-described ones. It classifies each
   chosen operation up front, since the classification decides which contracts apply later:
   - **Read-only** — Capability Manifest + Error Envelope only.
   - **Mutating, reversible, low-cost** — adds the Idempotency Contract.
   - **Consequential** (costs money, is irreversible, notifies/affects a third party, or
     changes a security boundary) — all five contracts apply, Guardrail is mandatory.
   Confirm or correct its classification — this is the single highest-leverage judgment call
   in the whole process.
3. **Write the spec.** Copies `templates/action-spec.template.md` to
   `specs/<operation>.spec.md` and fills it in completely before generating any code. This
   file is the source of truth going forward — six months from now, edit the spec first and
   regenerate, never hand-edit the generated manifest.
4. **Generate the five artifacts**, validated against the schemas in `contract/`: a manifest
   entry, the full error mapping table (every distinct failure, not just the happy-path
   4xx/5xx split), idempotency handling (if mutating), async wrapping (if latency can exceed
   ~2s), and dry-run/confirmation handling (if consequential) — written in the target
   codebase's actual language and conventions.
5. **Wire it behind an interface.** Defaults to an MCP server: one tool per action,
   `inputSchema` and `description` taken directly from the manifest — never a separate,
   shorter description for the outer tool than the one in the manifest, since that's the
   first place drift creeps back in. Function-calling schemas or an OpenAPI overlay are the
   same manifest, just a different outer projection.
6. **Drift check.** Before calling an operation done, re-reads the source of truth from step
   1 and confirms the generated manifest's parameters, error list, and guardrail
   classification still match it. A mismatch is drift — fix the manifest, don't rationalize it.
7. **Report back.** A short table, per operation, of which of the five contracts apply and
   are satisfied — flagging anything skipped and why. This is the artifact worth showing
   someone who asks "is this API agent-ready?"

Review what it produces before wiring the result into anything that calls real agents
against real data — treat the first pass like any other AI-generated PR.

## The five contracts, briefly

- **Capability Manifest** (`contract/capability-manifest.schema.json`) — the *only*
  discovery surface an agent sees: an intent description written for a model deciding
  whether to call this right now, an explicit `whenNotToUse` (most agent misuse is picking
  the almost-right tool), a `sideEffects` classification, and a fully specified input schema
  with no undocumented required fields.
- **Error Envelope** (`contract/error-envelope.schema.json`) — every failure mapped to a
  coarse `category`, a stable `code`, an explicit `retryable` flag, and — where the agent can
  fix and retry itself — a `fixHint` with a suggested corrected value.
- **Idempotency** (`contract/idempotency-contract.md`) — every mutating action accepts a
  caller-supplied `idempotencyKey`, backed by a real dedup store (not just an accepted-but-
  unchecked field). A replay with a known key returns the original result; a replay with the
  same key but different parameters is rejected as a conflict, not silently re-executed.
- **Async Job** (`contract/async-job.schema.json`) — anything whose worst-case latency can
  exceed its budget (default 2s) becomes a pollable job resource (`submit` → `getStatus`),
  never a blocking call with a long timeout.
- **Guardrail** (`contract/guardrail-contract.md`) — consequential actions require a
  `dryRun` that's provably side-effect-free, returning a `confirmationToken` scoped to the
  exact previewed parameters and short-lived; the real call fails with `guardrail_blocked` /
  `confirmation_required` without a valid, matching token.

`contract/constitution.md` states all five as five numbered articles — the non-negotiable
version, useful as a code-review checklist independent of any AI agent.

## What's in this repo

```
agentic-action-layer/
├── SKILL.md                          # the skill itself — what an agent reads
├── contract/
│   ├── constitution.md               # the five non-negotiable rules
│   ├── capability-manifest.schema.json
│   ├── error-envelope.schema.json
│   ├── async-job.schema.json
│   ├── idempotency-contract.md
│   └── guardrail-contract.md
├── templates/
│   ├── action-spec.template.md       # per-operation spec, filled in before generating
│   ├── reference-impl.ts             # illustrative only — all 5 contracts composed
│   └── reference-impl.py             # illustrative only — the async job contract
└── examples/
    └── worked-example-refund.md      # one operation, fully filled in, start to finish
```

Not a runnable framework or npm package — a contract (JSON Schemas + rules) plus generation
instructions that adapt to whatever language your target codebase already uses. Everything
the skill generates lands **inside your target project**; nothing here changes when it runs.

For a full worked example — the refund endpoint from the quick-start, taken all the way
through manifest, error table, idempotency, and the two-step guardrail call sequence — see
`examples/worked-example-refund.md`.

## FAQ

**Do I need all five contracts for every operation?** No — step 2's classification decides.
Read-only gets a manifest + error envelope only; idempotency, async, and guardrails only
apply where the operation's nature calls for them.

**What if my API has no OpenAPI spec?** Say so in step 1. The skill writes down what you
tell it in an explicitly-labeled `inferred-<operation>.md` note rather than guessing — weaker
than a real contract, but still traceable, which is the point.

**Do I need to know "spec-driven development" or have any particular tooling set up?** No.
The "spec" here is this skill's own template (`templates/action-spec.template.md`), filled
in conversationally as it asks you questions — not an external methodology or tool you need
to already know.

**Can I use function-calling schemas or an OpenAPI overlay instead of MCP?** Yes — same
manifest either way (step 5); only the outer projection changes.

## Talk

Built for "Agent-Ready APIs: The Layer You're Not Building Yet" — API Days London. The five
contracts are the "five things agents need" from the talk; `examples/worked-example-refund.md`
is the walk-through of wrapping a real API; `contract/constitution.md` is the middleware
pattern stated as enforceable rules rather than an adjective.
