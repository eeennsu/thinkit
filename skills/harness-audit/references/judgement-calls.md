# Judgement calls

What a script cannot decide, and how to decide it.

## Does this instruction duplicate something the model already does?

Calibrated by `model_defaults`. Under the current calibration the model
verifies its own work, corrects its own mistakes, and narrates readily.

```
Would the model do this without the instruction?
  no                      -> keep it
  yes                     -> delete it. Overlap does not cancel, it compounds
  the default is opposite -> write the instruction that is missing
```

The last branch is the one an audit usually misses. Response length, document
length, narration, task scope and delegation all run wider than wanted by
default, so the fix is an added instruction, not a deleted one. An audit that
only ever deletes has read half the calibration.

The `phrases` list in the calibration is where to start looking, not the
verdict. Judge the sentence in place: "run the smoke test before claiming the
migration worked" names a repo-specific gate and survives; "include a final
verification step for any non-trivial task" is the model's own behaviour
written down twice and does not.

## Is this a review cutoff?

Calibrated by `review_instruction_form`. Look for anything that tells a
reviewer to report less: severity floors, "be conservative", "only flag real
problems", caps on the number of findings.

Ordering is not a cutoff. "Correctness first, then regression risk" ranks
findings; "only report high-severity" removes them. Ranking is safe; removal
is the error.

Where to look: review skills, PR-review prompts, agent definitions, CI
instructions. Not only CLAUDE.md.

## Is this rule owned in more than one place?

Quote both copies with file and line. Two copies drift, and the reader has to
work out which one wins before starting.

Naming the owner is the fix, not deleting the weaker copy at random — see
`principles/ownership-map.md` for the map.

## Could a tool decide this?

If a linter, formatter, type checker, hook, permission setting, or CI job
could enforce it, the sentence should not exist. Say which tool, and check
whether the repo already runs it.

One exception, and it is narrow: a rule that a tool enforces only partially
must not be deleted from the docs on the strength of the part that works. Half
enforcement plus full deletion reads to everyone as full coverage.
