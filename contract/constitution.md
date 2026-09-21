# Constitution

Non-negotiable rules for anything this skill generates. Written in spec-driven-development
style on purpose: these are constraints a generated Agentic Action Layer MUST satisfy, not
suggestions. If a generated artifact violates one of these, it is wrong, not "good enough
for now."

## Article 0 — Traceability (the anti-drift rule)

Every generated artifact — manifest entry, error mapping, idempotency handling, async
wrapper, guardrail — MUST be derived from a written spec (`templates/action-spec.template.md`)
that itself is derived from the target API's actual contract (OpenAPI file, schema, or an
explicitly-labeled inferred description). Nothing gets generated from an unstated
assumption about what an endpoint probably does.

When the underlying API changes and a generated artifact doesn't, that is drift. It is the
same failure this skill's parent discipline (spec-driven development) exists to prevent for
human-facing code, applied to the agent-facing contract instead. A drift check
(SKILL.md, step 6) MUST run before any generated action is considered done, and MUST run
again whenever the underlying API's contract changes.

## Article 1 — Discovery

Every agent-callable action MUST have a manifest entry conforming to
`capability-manifest.schema.json`, including:

- an intent description written for an agent deciding whether to call it, not for a human
  reading API docs — state what it does, when to use it, and explicitly when *not* to
- a `sideEffects` classification (`none` | `idempotent` | `consequential`)
- a fully specified input schema with no undocumented required fields

The manifest description is the ONLY discovery surface. Do not write a shorter or different
description for the outer interface (MCP tool description, function-calling schema) than
the one in the manifest — a second, drifted copy of the same information is not allowed.

## Article 2 — Recovery

Every distinct failure mode the underlying API can produce MUST be mapped to an
`error-envelope.schema.json`-shaped response before the action is considered wrapped. A
generic catch-all ("something went wrong") for unmapped failures is allowed as a fallback,
but is not a substitute for enumerating the known failure modes.

Every error envelope MUST set `retryable` explicitly. An agent MUST be able to act on an
error without a human present to interpret it.

## Article 3 — Safety

Every action classified as mutating (anything other than `sideEffects: none`) MUST accept
an idempotency key and MUST be backed by a dedup store, per
`idempotency-contract.md`. An idempotency key that is accepted but not checked against a
store does not satisfy this article.

## Article 4 — Patience

No agent-facing call may block past the latency budget defined for it in the action's spec
(default: 2 seconds). Anything that can exceed the budget MUST be exposed as a job resource
per `async-job.schema.json` — submit, then poll or receive a callback. A synchronous call
that "usually" finishes fast and occasionally times out does not satisfy this article; the
classification is made at design time from the operation's worst case, not its median case.

## Article 5 — Consent

Every action classified `sideEffects: consequential` MUST support a `dryRun` mode that is
provably free of side effects and MUST require an explicit confirmation step
(`guardrail-contract.md`) before the real call executes. "Consequential" is defined
narrowly and conservatively: costs money, is irreversible, notifies or affects a party
other than the caller, or changes a security or access boundary. When in doubt, classify up
(more guardrail, not less) — the cost of an unnecessary confirmation step is an extra round
trip; the cost of a missing one is an agent doing something in the world that can't be
undone.

## Amendment process

These five articles are fixed by this skill. A team adopting this skill may add
organization-specific articles (e.g. mandatory audit logging, a maximum cost-per-call cap)
but may not weaken Articles 1–5. If a real constraint makes one of these articles
infeasible for a specific operation (e.g. a third-party API with no idempotency support at
all), that MUST be stated explicitly in the operation's spec as a documented exception with
the resulting risk, not silently dropped.
