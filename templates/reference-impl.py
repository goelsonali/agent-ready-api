"""
ILLUSTRATIVE ONLY -- read this to see how the async job contract composes with the
others. Do not import this into a real project; regenerate the equivalent shape in the
target codebase's own language and conventions (SKILL.md, step 4).

Companion to reference-impl.ts, which shows a synchronous, consequential action
(refunds: manifest + errors + idempotency + guardrail). This file shows a slow,
NON-consequential action instead (a report generation job), to illustrate the async job
contract (contract/async-job.schema.json) without repeating the guardrail machinery.

Worked scenario: "generate_compliance_report" can take anywhere from 5 seconds to several
minutes depending on date range -- well past any reasonable synchronous latency budget
(constitution.md, Article 4) -- so it MUST be a job, never a blocking call.
"""

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

# ---------------------------------------------------------------------------
# Contract 1: Capability Manifest (contract/capability-manifest.schema.json)
# ---------------------------------------------------------------------------
GENERATE_COMPLIANCE_REPORT_MANIFEST = {
    "name": "generate_compliance_report",
    "intent": (
        "Starts generation of a compliance report for a given date range. Use this when "
        "asked to produce, export, or check on a compliance report; the operation is slow "
        "and returns a job you must poll, not the report itself."
    ),
    "whenNotToUse": (
        "Do not use this for a quick summary of recent compliance status -- use "
        "get_compliance_summary (fast, synchronous) instead. This action is for the full "
        "generated document."
    ),
    "sideEffects": "idempotent",  # mutating (creates a job/report resource), but safe to retry
    "latencyBudgetMs": 2000,      # the SUBMIT call must return this fast -- see below
    "idempotent": True,
    "specRef": "specs/generate_compliance_report.spec.md",
}

# ---------------------------------------------------------------------------
# Contract 4: Async Job (contract/async-job.schema.json)
# ---------------------------------------------------------------------------
class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class AsyncJob:
    job_id: str
    status: JobStatus
    created_at: float
    updated_at: float
    progress: Optional[dict] = None
    poll_after_ms: Optional[int] = None
    result: Optional[dict] = None
    error: Optional[dict] = None


# Illustrative in-memory job store -- swap for a real durable store (a DB row, a queue's
# own job record) in the generated code. Contract 3 (idempotency) applies to the SUBMIT
# call itself: resubmitting with the same idempotencyKey returns the same job_id rather
# than starting a second, duplicate report run.
_jobs: dict[str, AsyncJob] = {}
_submit_dedup: dict[str, str] = {}  # idempotencyKey -> job_id


def submit_generate_compliance_report(date_from: str, date_to: str, idempotency_key: str) -> AsyncJob:
    """
    The agent-facing call. MUST return within the manifest's latencyBudgetMs regardless
    of how long the report actually takes -- this is what makes it satisfy Article 4.
    """
    if idempotency_key in _submit_dedup:
        return _jobs[_submit_dedup[idempotency_key]]

    job_id = str(uuid.uuid4())
    now = time.time()
    job = AsyncJob(job_id=job_id, status=JobStatus.PENDING, created_at=now, updated_at=now, poll_after_ms=1000)
    _jobs[job_id] = job
    _submit_dedup[idempotency_key] = job_id

    _enqueue_background_work(job_id, date_from, date_to)  # actual work happens off the
    # request path -- a real worker/queue in the generated code, not a blocking call here.
    return job


def get_job_status(job_id: str) -> AsyncJob:
    """The poll call an agent uses until status is 'succeeded' or 'failed'."""
    job = _jobs.get(job_id)
    if job is None:
        raise KeyError(f"unknown job_id: {job_id}")  # generated code maps this to a
        # not_found error-envelope entry, same as any other action's error mapping.
    return job


def _enqueue_background_work(job_id: str, date_from: str, date_to: str) -> None:
    """
    Stand-in for a real background worker. In generated code this is a queue consumer,
    not an inline function -- shown inline here only so the contract shape is legible in
    one file.
    """
    job = _jobs[job_id]
    job.status = JobStatus.RUNNING
    job.updated_at = time.time()
    job.progress = {"percentComplete": 10, "message": "collecting records"}

    try:
        report = _do_the_actual_slow_work(date_from, date_to)
        job.status = JobStatus.SUCCEEDED
        job.result = {"reportUrl": report["url"], "recordCount": report["count"]}
    except Exception as exc:  # noqa: BLE001 -- illustrative only
        job.status = JobStatus.FAILED
        job.error = {
            "category": "server_error",
            "code": "report_generation_failed",
            "message": str(exc),
            "retryable": True,
        }
    finally:
        job.updated_at = time.time()
        job.poll_after_ms = None


def _do_the_actual_slow_work(date_from: str, date_to: str) -> dict:
    # The real, unmodified, slow underlying operation. Nothing about the underlying API
    # changed to make this async -- the job contract is entirely a property of the layer.
    return {"url": f"https://reports.internal/{date_from}_{date_to}.pdf", "count": 4213}
