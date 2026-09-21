# Worked example: wrapping `POST /orders/{id}/refunds`

This is a fully filled-in illustration of the skill's output for one operation — the
refund endpoint used throughout `templates/reference-impl.ts`. It's a hypothetical
payments API, not a live integration; use it as the shape to present or adapt, not as
something to execute as-is.

## The starting point

A typical existing endpoint, built for a human-operated dashboard or a backend developer
calling it directly:

```
POST /orders/{id}/refunds
Body: { "amount": number }
200 -> { "id": string, "amount": number }
4xx/5xx -> { "error": string }   // a sentence, undifferentiated
```

Nothing here is wrong for its original purpose. It's just built on an assumption — a human
(or code a human wrote and tested against this exact API) is on the other end, will read
whatever the 4xx sentence says, and won't call this twice by accident. None of that holds
for an agent.

## 1. Classification (spec step 4)

`sideEffects: consequential` — it moves money and is not reversible by calling it again.
`costTier: medium`.

## 2. Capability Manifest (contract 1)

```json
{
  "name": "issue_refund",
  "intent": "Issues a partial or full refund against a completed order. Use this when a customer is owed money back for an order that already shipped or was already charged. Always dry-run first — this action is consequential.",
  "whenNotToUse": "Do not use this to cancel an order that hasn't shipped yet (use cancel_order instead — that reverses the charge directly with no refund workflow). Do not use this to adjust a price before charging (use update_order_total on an unpaid order).",
  "sideEffects": "consequential",
  "costTier": "medium",
  "latencyBudgetMs": 2000,
  "requiresDryRun": true,
  "idempotent": true,
  "inputSchema": {
    "type": "object",
    "required": ["orderId", "amount", "idempotencyKey"],
    "properties": {
      "orderId": { "type": "string" },
      "amount": { "type": "number", "exclusiveMinimum": 0 },
      "idempotencyKey": { "type": "string" },
      "dryRun": { "type": "boolean" },
      "confirmationToken": { "type": "string" }
    }
  },
  "specRef": "specs/issue_refund.spec.md"
}
```

Compare this to the original endpoint's only agent-facing description being whatever line
existed in a Swagger `summary` field, if anything did. This is the difference between
"documented" and "discoverable."

## 3. Error mapping (contract 2)

The original API returns `{ "error": "insufficient balance" }` for one specific failure
among several it can actually produce. The spec's failure-mode table forces enumerating
the rest:

| Underlying failure | category | code | retryable | fixHint |
|---|---|---|---|---|
| 422, balance exceeded | `validation` | `refund_exceeds_balance` | yes | field `amount`, suggested value = remaining balance |
| 404, no such order | `not_found` | `order_not_found` | no | — |
| 429 from payment provider | `rate_limited` | `upstream_rate_limited` | yes | `retryAfterMs: 2000` |
| anything else | `server_error` | `unknown_upstream_error` | no | — |

An agent hitting the first row gets `suggestedValue: 42.0` back and can retry immediately
with a corrected amount — no human, no doc lookup, no guess.

## 4. Idempotency (contract 3)

Agent calls with `idempotencyKey: "sess-8831-refund-1"`. If a network hiccup makes it call
again with the same key and same `{orderId, amount}`, it gets back the exact original
result — no second refund. If it calls again with the same key but a different amount
(a bug, or a confused retry), it gets a `conflict` / `idempotency_key_reused` error instead
of a silent double-execution.

## 5. Guardrail (contract 5) — the two-step call sequence an agent actually makes

**Step one — preview:**

```json
// call: issue_refund({ orderId: "ord_9wq", amount: 120, idempotencyKey: "k1", dryRun: true })
// response:
{
  "dryRun": true,
  "preview": { "orderId": "ord_9wq", "requestedAmount": 120, "remainingRefundable": 42.0 },
  "impact": { "summary": "Refund 120 to the original payment method.", "reversible": false, "affectsThirdParty": true },
  "confirmationToken": "ct_7f2a..."
}
```

The agent (or its orchestrator) now has real information — this would exceed the
refundable balance — before anything happened. That's the pain point resolved: not a
retroactive error after a wrong action, but a stoppable preview before one.

**Step two — confirm, with corrected parameters:**

```json
// call: issue_refund({ orderId: "ord_9wq", amount: 42, idempotencyKey: "k2", dryRun: true })
// -> new preview, new token ct_a19c...
// call: issue_refund({ orderId: "ord_9wq", amount: 42, idempotencyKey: "k2", confirmationToken: "ct_a19c..." })
// -> { ok: true, refundId: "re_...", amount: 42 }
```

## What changed, in one line

The underlying `POST /orders/{id}/refunds` endpoint was not touched. Everything above is
the Agentic Action Layer sitting in front of it — which is the whole claim: agent-ready
without a rewrite.
