# Symphony Run Review Checklist

## Purpose

Use this checklist after each Symphony-managed ticket run.

The goal is to review both:

- the code outcome
- the agent workflow that produced it

This should help identify whether problems came from:

- ticket quality
- prompt quality
- runtime/tooling behavior
- agent execution quality
- reviewability of the resulting change

## Run Metadata

- Ticket:
- Run ID:
- Work type:
- PR size label:
- Model label:
- Number of turns:
- Number of runs for this ticket so far:

## 1. Completion Behavior

- Did the run end through the explicit expected completion boundary?
- Did the agent use the correct tool for the ticket type?
- If not, what completion behavior did it choose instead?
- Did the runtime classify the completion path correctly?
- Did the run require unnecessary extra turns?

## 2. Scope Discipline

- Did the agent stay within the ticket scope?
- Did it respect out-of-scope constraints?
- Did it avoid broad unrelated edits?
- Did it use the likely touch points well?
- If scope drift happened, was the problem the ticket or the agent?

## 3. Code Quality

- Is the code correct?
- Is the code easy to review?
- Did the agent choose the right implementation shape?
- Did it introduce unnecessary complexity?
- Did it leave obvious cleanup behind?

## 4. Verification Quality

- Did the agent run the right validations?
- Were the validations proportionate to the ticket?
- Did it skip important verification?
- Did it waste time on low-value commands?
- Were test/build failures handled well?

## 5. Review Readiness

- Would you merge this PR as-is?
- How many meaningful review findings remain?
- Are the remaining findings:
  - correctness issues
  - scope issues
  - naming/cleanup issues
  - missing tests
  - workflow issues

## 6. Efficiency

- Was the run efficient?
- Where did the agent spend the most time?
- Were there obvious token or command-cost sinks?
- Did bootstrap/runtime overhead materially affect the run?

## 7. Ticket Quality Feedback

- Was the ticket too broad?
- Was the ticket too vague?
- Did the ticket miss key file constraints?
- Did the ticket miss a necessary out-of-scope clause?
- Should this ticket have been split into scaffold/slice/spike instead?

## 8. Prompt And Runtime Feedback

- Did the prompt help the agent succeed?
- Did the prompt create confusion?
- Were needed tools exposed clearly?
- Did the runtime encourage or tolerate bad workflow behavior?
- Is there a prompt/runtime improvement suggested by this run?

## 9. Final Judgment

- Outcome:
  - strong success
  - acceptable success
  - mixed
  - failure
- Main reason:
- One thing to improve before the next run:
- Should this pattern of ticket be reused:
  - yes
  - yes, with refinements
  - no

