
# Calibration: Claude 5 generation

```json
{
  "axis": "model",
  "generation": "claude-5",
  "values": {
    "model_defaults": {
      "value": {
        "self_verification": "on",
        "self_correction": "on",
        "narration": "high",
        "response_length": "long",
        "written_document_length": "long",
        "scope_expansion": "likely",
        "subagent_delegation": "eager"
      },
      "phrases": [
        "include a final verification step",
        "use a subagent to verify",
        "double-check your answer",
        "re-verify before responding",
        "do not think",
        "do not reason"
      ],
      "source": "P5 - Task scope and over-verification; Self-correction; Response length and verbosity"
    },
    "review_instruction_form": {
      "value": { "cutoff_instructions": "harmful", "required_form": "report everything, filter in a separate pass" },
      "phrases": ["only report high-severity", "be conservative"],
      "source": "P5 - Code review and bug-finding"
    },
    "claude_md_budget": {
      "value": null,
      "unset_reason": "No primary source states a number. Enforcement is delegated to `claude doctor`.",
      "source": null
    }
  }
}
```

Values that move with the model generation. The axes themselves live in
`principles/`; only the positions on those axes are here.

Every value carries a `source`. A value without a primary-source citation is
`null` and is treated as unset — skills drop or ask, they do not guess.

## model_defaults

> Claude Opus 5 verifies its own work without being told to. If your prompt
> contains explicit verification instructions ... remove them ... The same
> applies to legacy harness scaffolding that adds separate verification steps.

Two consumers:

- interview **Q3** exists only because `self_verification: on`. If a future
  generation flips it to `off`, Q3 drops and no verification skill is
  proposed. Nothing else in the interview changes.
- `instruction.duplicates-model-default` uses `phrases` as the starting point
  for a judgement pass, not as an automatic failure.

The defaults also move the other way — responses, documents, narration, scope
and delegation all run longer or wider than before. That direction produces
instructions to *add*, not delete, which is why this value is a table rather
than a list of things to remove.

## review_instruction_form

> If your review prompt says "only report high-severity issues" or "be
> conservative," the model may follow that instruction literally and report
> less; ask it to report everything and filter in a separate pass instead.

Consumed by `review.cutoff-instruction`. This is the one calibrated item with
`severity: error` — a cutoff instruction does not waste tokens, it removes
findings.

## claude_md_budget

Unset, deliberately. `/doctor` is the tool the primary source points at for
rightsizing. `check.mjs` still reports the token estimate; it just does not
judge it. Reporting a number and judging a number are different acts, and only
the second one needs a threshold we do not have.

## Not here

Seven further generation-dependent observations (the rule/judgement dial
position, reference complexity ceiling, prompt formatting formality, instruction
position bias, effective context budget, effort defaults, thinking-disabled
artifacts) are recorded in `docs/calibration-notes.md`. They have no consumer
in any skill or script. A value nothing reads is a note, and it is filed as
one.
