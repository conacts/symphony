# Symphony Ticket Intake Prompt Template

## Purpose

This template is for the first intelligent review of a ticket before Symphony
commits to execution.

The goal is not to require rigid authored headers like `## Objective` or
`## Done Definition`.

The goal is to:

- read the ticket as written
- derive a strict internal execution contract from freeform text
- decide whether the ticket is ready to execute
- request clarification when the ticket is too weak
- return rich structured reasons instead of brittle parser failures

This prompt is intentionally separate from `.symphony/prompt.md`.

- `.symphony/prompt.md` is the run-time prompt for an active agent run
- this template is the intake prompt for deciding whether a ticket is ready to
  enter execution

## Design Intent

The strictness should live in the derived output, not in authored markdown
headers.

That means:

- freeform tickets are allowed
- the intake reviewer must still produce a strict decision
- malformed explicit directives should still fail hard
- missing or ambiguous product detail should usually become clarification, not
  failure

Recommended outcome classes:

- `ready`
  - the ticket contains enough information to derive an execution contract
- `needs_clarification`
  - the ticket is probably actionable, but critical ambiguity remains
- `invalid_directive`
  - the ticket includes an explicit routing or policy directive that is invalid
- `invalid_ticket`
  - the ticket is too empty or contradictory to evaluate meaningfully

## Suggested Runtime Boundary

Do not let the router throw ad hoc prose errors after reading the ticket.

Instead, make the first destination explicit. For example:

- module id: `intake.review`
- execution kind: `agent` or `system`

That module should emit one strict structured result. The control plane then
maps that result to:

- persist execution contract and continue
- raise clarification and move to `awaiting_input`
- fail with a rich validation comment

## Prompt Template

```md
You are Symphony's ticket intake reviewer.

Your job is to evaluate whether the ticket contains enough information to begin
execution and to derive a strict internal execution contract from the ticket as
written.

You must not require any specific markdown heading structure. Headers like
"Objective" or "Done Definition" are helpful but optional.

You must read the ticket semantically and return exactly one structured JSON
result.

## Ticket Context

Issue identifier: {{ issue.identifier }}
Issue title: {{ issue.title }}
Issue state: {{ issue.state }}
Repository key: {{ repositoryKey }}
Issue labels: {{ issue.labels }}

## Ticket Body

{{ issue.description }}

## Task

Determine whether the ticket is:

1. ready for execution
2. missing critical information and should request clarification
3. invalid because an explicit directive is malformed
4. invalid because the ticket is empty or contradictory

Derive the best possible strict internal contract from the ticket text.

## Output Rules

- Return exactly one fenced `json` block and nothing after it.
- Do not return prose before or after the JSON block.
- Do not invent repository context, model profiles, or routing directives that
  are not supported by Symphony.
- Prefer `needs_clarification` over `invalid_ticket` when the main problem is
  missing but recoverable product detail.
- Use `invalid_directive` only when the ticket explicitly specifies a malformed
  directive such as an invalid retry count or unsupported capability id.
- Keep derived summaries concise and operator-readable.

## Output Schema

```json
{
  "schemaVersion": "1",
  "decision": "ready | needs_clarification | invalid_directive | invalid_ticket",
  "summary": "short operator-facing summary",
  "objective": "derived objective text or null",
  "doneDefinition": "derived done-definition text or null",
  "constraints": [
    "derived scope constraint"
  ],
  "routingDirectives": {
    "requiredCapabilityIds": [],
    "preferredCapabilityIds": [],
    "forbiddenCapabilityIds": [],
    "requiredEvidenceIds": [],
    "allowedModelProfileIds": [],
    "clarificationMode": "required | best_effort | null",
    "reviewStrictness": "standard | strict | adversarial | null",
    "maxRetryCount": 0
  },
  "confidence": 0.0,
  "reasons": [
    {
      "code": "missing_done_definition | malformed_max_retry_count | contradictory_scope | empty_ticket | unsupported_directive | weak_objective",
      "message": "specific explanation",
      "severity": "info | warning | error",
      "field": "objective | doneDefinition | routingDirectives.maxRetryCount | ticket"
    }
  ],
  "clarificationRequest": {
    "summary": "why clarification is needed",
    "questions": [
      {
        "id": "question_1",
        "prompt": "specific question that would unblock execution",
        "context": "optional extra context"
      }
    ]
  }
}
```
```

## Decision Policy

### Return `ready` when

- the ticket has a clear enough objective
- the expected outcome can be derived with reasonable confidence
- any missing details are non-blocking

### Return `needs_clarification` when

- the ticket is real work but key information is missing
- the missing information blocks implementation, review, or verification
- a small number of direct questions would unblock execution

Examples:

- API behavior is requested but no expected response contract is described
- a UI change is requested but the intended state or empty-state behavior is not
  clear
- a refactor is requested but the protected invariants are not specified

### Return `invalid_directive` when

- an explicit directive is malformed
- a ticket names unsupported capability ids, model profiles, or evidence ids
- a numeric or enum directive is syntactically invalid

Examples:

- `Max Retry Count: 1.5`
- unsupported `required capability`
- unknown review strictness value

### Return `invalid_ticket` when

- the ticket is effectively empty
- the title and body contradict each other so strongly that clarification is not
  enough
- repository or identity context is missing at the system boundary

Use this sparingly.

## Derivation Rules

### Objective

Derive the objective from the strongest available source in this order:

1. explicit objective-like section
2. strong problem/outcome statement in the body
3. issue title

### Done Definition

Derive the done definition from the strongest available source in this order:

1. explicit done-definition or acceptance-criteria section
2. concrete expected-outcome language in the body
3. a concise synthesis from the title and body

If you cannot derive a credible done definition, prefer clarification.

### Constraints

Extract only constraints that materially narrow execution:

- explicit out-of-scope boundaries
- file or module constraints
- verification requirements
- environment limitations

Do not hallucinate constraints.

### Routing Directives

Only populate routing directives when the ticket explicitly implies them or when
Symphony defaults are clearly appropriate.

If the ticket does not specify a directive, prefer `null` or an empty list in
the intake output and let the control plane apply defaults later.

## Rich Error Philosophy

The intake reviewer should explain why the ticket is weak in a way that lets the
operator repair it quickly.

Bad:

- `objective is required`

Better:

- `The ticket describes UI work, but it does not say what state should be shown
  after the workflow completes.`
- `The ticket requests verification, but it does not define what would count as
  success.`
- `The ticket sets Max Retry Count to "1.5", but this field must be a
  non-negative integer.`

## Recommended Control-Plane Mapping

If this template is adopted, the clean product behavior is:

- `ready`
  - persist strict execution contract
  - continue planning
- `needs_clarification`
  - record clarification request
  - move workflow to `awaiting_input`
  - leave a compact operator-facing note
- `invalid_directive`
  - fail intake
  - leave a rich validation comment
- `invalid_ticket`
  - fail intake or request manual triage depending on policy

## Notes

This template is a product contract draft, not a wired implementation.

It exists to make the intended intake semantics explicit before we thread them
through:

- `apps/api/src/core/symphony-capability-contract-intake.ts`
- `apps/api/src/core/symphony-capability-dispatch-authority.ts`
- the intelligent-flow router lifecycle
- operator/read-model serialization
- e2e tests for weak-ticket clarification flows
