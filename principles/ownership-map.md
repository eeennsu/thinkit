# One rule, one owner

A rule that lives in two places is a conflict waiting for its copies to drift.
The cost is not that the agent breaks — it is that the agent must work out
which instruction wins before it can start, and that reasoning is billed.

| Kind of rule | Owner |
| --- | --- |
| Task procedure (verification, review, release) | that skill |
| Repo-specific prohibition or trap | CLAUDE.md |
| How to call a tool | the tool description |
| What this one request needs | the user prompt |
| Detailed knowledge (architecture, contract, spec) | a reference file |
| Anything a linter/type checker/hook/CI can decide | the tool config |

If a rule appears in two rows, it is a conflict candidate.

## Test

> If a person reading the harness cannot say which instruction wins,
> the model cannot either.

## Shape of a rule worth keeping

Keep rules that carry a condition and an escape hatch:

- "Preserve existing public APIs unless the task requires an API change."
- "Ask before introducing a new external dependency."

Drop rules that claim to be true regardless of situation:

- "NEVER create a new file."
- "ALWAYS use protocol abstraction."

The difference is not strength. It is whether the rule admits the cases where
it is wrong.

## Memory is not a rule

Notes about what was done, when, and by whom belong in memory, not in
CLAUDE.md. A standing fact stays; a log of past work goes.
