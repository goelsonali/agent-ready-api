# Idempotency Contract

Applies to every action where `sideEffects` is `idempotent` or `consequential`
(constitution.md, Article 3). The point: agents retry aggressively and non-deterministically
— a self-correction loop, a timeout that actually succeeded server-side, a supervisor agent
re-issuing a sub-agent's plan — and none of that should be able to double-charge, double-send,
or double-create anything.

## Requirements

1. **Every wrapped mutating action accepts an `idempotencyKey` input field** — a
   caller-supplied opaque string, required, not optional. If the underlying API already has
   its own idempotency key concept (Stripe-style `Idempotency-Key` header, for example),
   pass the caller's key through to it directly instead of layering a second one on top.

2. **A dedup store backs the key**, keyed on `(actionName, idempotencyKey)`, storing the
   result of the first call. Minimum viable store: a key-value store with a TTL (24–72
   hours is a reasonable default; align it to how long a caller might plausibly retry).
   An accepted-but-unchecked idempotency key does not satisfy this contract — that's
   decoration, not safety.

3. **A replayed call with a known key returns the original result**, not a fresh execution
   and not an error. The response MUST be indistinguishable from what the first call
   returned (same success payload, or the same error envelope if the first call failed in a
   way that's safe to report identically).

4. **A replayed call with a known key but different parameters is rejected**, with a
   `conflict` category error (see `error-envelope.schema.json`) — this is a caller bug (key
   reuse across different logical operations), not a retry, and hiding it by silently
   executing the new parameters is exactly how idempotency keys become unsafe.

5. **Classify retry safety in the manifest, not just at the dedup layer.** Every manifest
   entry with `sideEffects != none` MUST set `idempotent: true` once the above is
   implemented. If a specific operation genuinely cannot be made idempotent (rare — usually
   because the underlying API has no way to detect a duplicate and no way to make the effect
   reversible), that is a documented exception per constitution.md's amendment process, not
   a silently missing field.

## What this contract does not require

It does not require the underlying API itself to be idempotent — that's the layer's job to
provide, via the dedup store, precisely because most existing APIs weren't built with this
in mind. It also does not require perfect exactly-once semantics under all failure modes
(a dedup store can itself fail); it requires the common case — an agent retrying a call it
already made — to be safe by default.
