/**
 * ILLUSTRATIVE ONLY — read this to see how the five contracts compose around one action.
 * Do not import this file into a real project. Regenerate the equivalent shape in the
 * target codebase's own language and conventions (SKILL.md, step 4).
 *
 * Worked example used throughout: wrapping a hypothetical POST /refunds endpoint.
 * See examples/worked-example-refund.md for the filled-in spec this was generated from.
 */

// ---------------------------------------------------------------------------
// Contract 1: Capability Manifest (contract/capability-manifest.schema.json)
// ---------------------------------------------------------------------------
export const issueRefundManifest = {
  name: "issue_refund",
  intent:
    "Issues a partial or full refund against a completed order. Use this when a customer " +
    "is owed money back for an order that already shipped or was already charged. Always " +
    "dry-run first — this action is consequential.",
  whenNotToUse:
    "Do not use this to cancel an order that hasn't shipped yet (use cancel_order instead " +
    "— that reverses the charge directly with no refund workflow). Do not use this to " +
    "adjust a price before charging (use update_order_total on an unpaid order).",
  sideEffects: "consequential" as const,
  costTier: "medium" as const,
  latencyBudgetMs: 2000,
  requiresDryRun: true,
  idempotent: true,
  specRef: "specs/issue_refund.spec.md",
};

// ---------------------------------------------------------------------------
// Contract 2: Error Envelope (contract/error-envelope.schema.json)
// ---------------------------------------------------------------------------
type ErrorEnvelope = {
  ok: false;
  error: {
    category:
      | "validation"
      | "auth"
      | "not_found"
      | "conflict"
      | "rate_limited"
      | "guardrail_blocked"
      | "upstream_unavailable"
      | "server_error";
    code: string;
    message: string;
    retryable: boolean;
    fixHint?: { field?: string; problem?: string; suggestedValue?: unknown };
    retryAfterMs?: number;
    originalStatus?: string | number;
  };
};

function mapUnderlyingError(status: number, body: any): ErrorEnvelope {
  // This is the table from the action spec's "Failure modes" section, made concrete.
  // Every branch here corresponds to a row a human wrote down first — nothing here is
  // guessed at generation time.
  if (status === 422 && body?.reason === "exceeds_balance") {
    return {
      ok: false,
      error: {
        category: "validation",
        code: "refund_exceeds_balance",
        message: `Requested refund exceeds remaining refundable balance of ${body.remaining}.`,
        retryable: true,
        fixHint: { field: "amount", problem: "exceeds remaining refundable balance", suggestedValue: body.remaining },
        originalStatus: status,
      },
    };
  }
  if (status === 404) {
    return {
      ok: false,
      error: { category: "not_found", code: "order_not_found", message: "No such order.", retryable: false, originalStatus: status },
    };
  }
  if (status === 429) {
    return {
      ok: false,
      error: { category: "rate_limited", code: "upstream_rate_limited", message: "Payment provider rate limit hit.", retryable: true, retryAfterMs: 2000, originalStatus: status },
    };
  }
  return {
    ok: false,
    error: { category: "server_error", code: "unknown_upstream_error", message: "Unexpected upstream failure.", retryable: false, originalStatus: status },
  };
}

// ---------------------------------------------------------------------------
// Contract 3: Idempotency (contract/idempotency-contract.md)
// ---------------------------------------------------------------------------
// Illustrative in-memory store — swap for a real TTL-backed key-value store (Redis, etc).
const dedupStore = new Map<string, { params: unknown; result: unknown }>();

function dedupKey(action: string, idempotencyKey: string) {
  return `${action}:${idempotencyKey}`;
}

// ---------------------------------------------------------------------------
// Contract 5: Guardrail (contract/guardrail-contract.md)
// ---------------------------------------------------------------------------
// Illustrative in-memory token store, scoped to exact params, short-lived.
const confirmationTokens = new Map<string, { params: unknown; expiresAt: number }>();

function issueConfirmationToken(params: unknown): string {
  const token = crypto.randomUUID();
  confirmationTokens.set(token, { params, expiresAt: Date.now() + 5 * 60_000 });
  return token;
}

function verifyConfirmationToken(token: string, params: unknown): boolean {
  const entry = confirmationTokens.get(token);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) return false;
  // Re-validate the bound parameters at confirmation time — a token from previewing a
  // $50 refund must not confirm a $500 refund (guardrail-contract.md, requirement 2).
  return JSON.stringify(entry.params) === JSON.stringify(params);
}

// ---------------------------------------------------------------------------
// The wrapped action itself — composes all five contracts.
// (Contract 4, Async, is omitted here: a refund call is well under the 2s latency
// budget in this example. See templates/reference-impl.py for a worked async example.)
// ---------------------------------------------------------------------------
type IssueRefundInput = {
  orderId: string;
  amount: number;
  idempotencyKey: string;
  dryRun?: boolean;
  confirmationToken?: string;
};

export async function issueRefund(input: IssueRefundInput) {
  const { orderId, amount, idempotencyKey, dryRun, confirmationToken } = input;
  const params = { orderId, amount };

  // --- Idempotency: replay check first, before touching anything else.
  const key = dedupKey("issue_refund", idempotencyKey);
  const existing = dedupStore.get(key);
  if (existing) {
    if (JSON.stringify(existing.params) !== JSON.stringify(params)) {
      return {
        ok: false,
        error: { category: "conflict", code: "idempotency_key_reused", message: "This idempotency key was already used with different parameters.", retryable: false },
      } satisfies ErrorEnvelope;
    }
    return existing.result; // exact replay, no re-execution
  }

  // --- Guardrail: dry-run branch.
  if (dryRun) {
    const preview = await previewRefundAgainstRealBalance(orderId, amount); // no side effects
    return {
      dryRun: true,
      preview,
      impact: { summary: `Refund ${amount} to the original payment method.`, reversible: false, affectsThirdParty: true },
      confirmationToken: issueConfirmationToken(params),
    };
  }

  // --- Guardrail: real call requires a valid, scope-matched confirmation token.
  if (!confirmationToken || !verifyConfirmationToken(confirmationToken, params)) {
    return {
      ok: false,
      error: { category: "guardrail_blocked", code: "confirmation_required", message: "This action requires a confirmed dry-run before it can execute.", retryable: true, fixHint: { field: "confirmationToken", problem: "missing or expired" } },
    } satisfies ErrorEnvelope;
  }

  // --- Execute against the real, unmodified underlying API.
  const res = await fetch(`https://payments.internal/orders/${orderId}/refunds`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) {
    const errorEnvelope = mapUnderlyingError(res.status, await res.json().catch(() => ({})));
    dedupStore.set(key, { params, result: errorEnvelope }); // failures are cached too — a
    // retried call after a real failure should see the same failure, not re-execute.
    return errorEnvelope;
  }

  const result = { ok: true as const, refundId: (await res.json()).id, amount };
  dedupStore.set(key, { params, result });
  return result;
}

async function previewRefundAgainstRealBalance(orderId: string, amount: number) {
  // Reads real state, writes nothing — this is what makes the dry-run provable rather
  // than a boolean the underlying API silently ignores (guardrail-contract.md).
  const order = await fetch(`https://payments.internal/orders/${orderId}`).then((r) => r.json());
  return { orderId, requestedAmount: amount, remainingRefundable: order.refundableBalance };
}
