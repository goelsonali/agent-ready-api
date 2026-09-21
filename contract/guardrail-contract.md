# Guardrail Contract

Applies to every action classified `sideEffects: consequential` (constitution.md, Article
5). "Consequential" means: costs money, is irreversible, notifies or affects a party other
than the caller, or changes a security or access boundary. Classify up when unsure — an
unnecessary confirmation step costs one extra round trip; a missing one costs an agent doing
something in the world that can't be undone.

## Requirements

### 1. Dry-run is provably side-effect-free

The action MUST accept a `dryRun: true` input and, when set, MUST return a preview of the
intended effect — computed against real, current state (real balances, real inventory, real
permissions) — without executing any of it. "Provably" means: if you can't point to the
specific code path that guarantees no write happens, dry-run isn't implemented, it's a
boolean the underlying API silently ignores.

The dry-run response shape:

```json
{
  "dryRun": true,
  "preview": { "...": "same shape as the action's real success output, where computable" },
  "impact": {
    "summary": "one sentence a human or an orchestrating agent can act on",
    "reversible": false,
    "affectsThirdParty": true
  },
  "confirmationToken": "opaque, short-lived, scoped to exactly this call's parameters"
}
```

### 2. The confirmation token is scoped and short-lived

`confirmationToken` MUST be bound to the exact parameters previewed (a token from
previewing a $50 refund must not confirm a $500 refund) and MUST expire (a few minutes is
typical — long enough for a human-in-the-loop to review, short enough that state can't have
drifted meaningfully underneath it). Re-validate the bound parameters at confirmation time,
not just the token's validity.

### 3. The real call requires the token

Calling the action for real (`dryRun` absent or `false`) on a consequential action MUST
require a valid `confirmationToken` from a matching prior dry-run. Without one, the call
MUST fail with a `guardrail_blocked` / `confirmation_required` error (see
`error-envelope.schema.json`'s worked example) — never silently execute, and never silently
downgrade to "well, it's probably fine."

### 4. Where a human actually needs to be in the loop, say so explicitly

The guardrail contract makes an action *safe to confirm programmatically* (an orchestrating
agent can preview, evaluate the impact against its own policy, and confirm). It does not by
itself guarantee a human saw it. If an operation requires an actual human approval — not
just a second agent call — that requirement belongs in the action's spec
(`templates/action-spec.template.md`) as an explicit policy, wired through the agent-facing
interface's own human-in-the-loop mechanism (e.g. an elicitation-style pause-and-resume)
where one exists.

## What this contract does not require

It does not require every mutating action to have a guardrail — only consequential ones
(constitution.md draws that line; don't gold-plate a label update with a confirmation
flow). It also does not prescribe how impact is computed internally — only that the preview
reflects real current state and that the token faithfully represents what was previewed.
