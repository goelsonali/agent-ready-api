# Action Spec: <action_name>

> Copy this file to `specs/<action_name>.spec.md` and fill in every section before
> generating anything. This is the source of truth the generated manifest, error mapping,
> idempotency handling, async wrapper, and guardrail are traced back to — see
> `contract/constitution.md`, Article 0. If this file and the generated code ever disagree,
> the generated code is wrong, not this file.

## 1. Source of truth

- Underlying endpoint/operation: `<HTTP method + path, RPC name, or internal function>`
- Contract reference: `<link or path to the OpenAPI operation, schema, or, if none exists,
  a note that this is inferred and from whom/where>`
- Owner / team: `<who to ask when this drifts>`

## 2. Intent (feeds capability-manifest.schema.json → intent)

What does this action do, in plain language, for an agent deciding whether to call it right
now?

> ...

When should an agent call this?

> ...

When should an agent explicitly NOT call this — what's the nearest confusable action, and
why is this the wrong one for that situation? (feeds → whenNotToUse; required, not optional)

> ...

## 3. Inputs and outputs

- Input schema (feeds → inputSchema): `<fields, types, which are required, valid
  ranges/formats>`
- Output schema on success (feeds → outputSchema): `<shape>`

## 4. Side-effect classification (constitution.md, Article 0–5 all key off this)

- [ ] `none` — read-only
- [ ] `idempotent` — mutating, reversible, low-cost
- [ ] `consequential` — costs money / irreversible / affects a third party / changes a
      security or access boundary

If `consequential`, name the specific reason(s): `<...>`

Cost tier (required if consequential): `free` / `low` / `medium` / `high`

## 5. Failure modes (feeds → error-envelope mapping; Article 2)

List every distinct way the underlying call can fail — not just "4xx" and "5xx." For each:
category, code, is it retryable, and (if the agent can fix and retry) what the fix hint
should say.

| Underlying failure | category | code | retryable | fixHint |
|---|---|---|---|---|
| `<e.g. underlying API returns 422 "insufficient balance">` | `validation` | `<...>` | `<yes/no>` | `<field/problem/suggestedValue, or n/a>` |

## 6. Idempotency (Article 3 — required unless classification is `none`)

- Does the underlying API already support an idempotency key natively? `<yes/no + how>`
- If not, dedup store key: `(action name, caller-supplied idempotencyKey)`, TTL: `<...>`
- Anything about this operation that makes idempotency genuinely infeasible? If so, this is
  a documented exception (constitution.md amendment process) — state the resulting risk
  explicitly: `<...>`

## 7. Latency and async (Article 4)

- Latency budget: `<default 2000ms unless justified otherwise>`
- Worst-case latency of the underlying call, and why (not median): `<...>`
- Async required? `<yes/no>` — if yes, expected job duration range and any progress signal
  available: `<...>`

## 8. Guardrail (Article 5 — required if classification is `consequential`)

- What does a dry-run preview compute, concretely, against real current state?
  `<...>`
- Is the effect reversible at all, even manually? `<...>`
- Does this require an actual human approval, not just a second agent's confirmation? If
  yes, name the human-in-the-loop mechanism to use: `<...>`
- Confirmation token lifetime: `<default a few minutes unless justified otherwise>`

## 9. Interface projection

- [ ] MCP tool (default)
- [ ] Function-calling schema (OpenAI/Anthropic tool-use)
- [ ] OpenAPI overlay
- [ ] Other: `<...>`

## 10. Sign-off

- Spec written by: `<...>` Date: `<...>`
- Last drift check run: `<date>` — result: `<matched source of truth / drift found and
  fixed, describe>`
