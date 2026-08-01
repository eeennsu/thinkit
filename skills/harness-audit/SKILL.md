---
name: harness-audit
description: Use when reviewing an existing repository harness - CLAUDE.md, skills, references, agent instructions - for conflicts, repo-visible filler, rules that a tool should own, and instructions that duplicate what the model already does.
---

# Harness audit

## Order

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" --mode full --target <repo> --json`
2. The machine findings are already decided. Read them; do not re-derive them.
3. Resolve every `pending: true` item yourself, using its rubric. These are the
   judgements a script cannot make.
4. Report **everything**, sorted by severity.

The checker ships with the plugin while the working directory is the repo under
audit, so it is addressed through `${CLAUDE_PLUGIN_ROOT}`. A repo that was
bootstrapped also has its own planted copy at `.claude/harness/check.mjs`; that
one carries only the generation-independent rules, so it is not a substitute
for `--mode full`.

## Report everything

Do not narrow the report to the important findings, and do not open with a
severity filter. Filtering is a separate pass belonging to whoever reads it —
a report trimmed at generation time cannot be un-trimmed later.

This is not a style preference. Under the current calibration, an instruction
to be conservative makes the report shorter rather than sharper, which is why
`review.cutoff-instruction` is an error-severity finding in this plugin's own
rule set.

Sort order: error, then warn, then info. Dropped calibrated items are reported
as `info` with the reason, never silently omitted — a check that did not run
must not look like a check that passed.

## Judgement items

Each `pending` finding names its rubric:

| Finding | Rubric |
| --- | --- |
| repo-visible prose, thin skills | `principles/gotcha-vs-repo-visible.md` |
| duplicated rules, memory logs, absolute rules | `principles/ownership-map.md` |
| rules a tool could own | `principles/tooling-over-docs.md` |
| instructions duplicating model defaults, review cutoffs | `references/judgement-calls.md` |

Read the actual files before judging. A finding with no quoted line is a guess.

## Planted files

`check.mjs` reports the state of anything this plugin planted: `current`,
`outdated`, `edited-locally`, `missing`, `unreadable`. Offer to regenerate an
outdated file. Never overwrite one that was edited locally — surface the
difference and let the owner merge.

`outdated` is a verdict only the plugin copy can reach. It compares the target's
recorded plant version against what the plugin would write today, and a planted
copy has no canonical content to compare with; invoked on its own it reports
`current` and says that staleness was not checkable from there. Do not read that
as an up-to-date harness — run the plugin's own `check.mjs` for that answer.

## With --fix

Three remedies, all additive:

| Repaired | Not repaired |
| --- | --- |
| a missing `## Gotchas` heading, left empty | its contents — a guessed gotcha is worse than none |
| an unregistered `harness:check` script, on a repo that has the checker | the same script on a repo with nothing planted: it would name a file that is not there |
| a planted file that is `outdated` or `missing` | one that is `edited-locally`, or a manifest that is `unreadable` |

`package.json` keeps its own indentation and trailing-newline state through the
repair. It is the repo's file; a one-key edit that reformats the whole thing
puts every line of it in someone's diff.

Prose is never rewritten. Deleting a sentence from someone's CLAUDE.md is their
call, and the report gives them what they need to make it.

Refreshing a planted file needs the canonical content, so it works when the
audit runs from the plugin. A planted copy invoked on its own reports the
staleness and says to re-run bootstrap instead.

Findings are measured before the repairs run, so a fixed item still appears in
the list with a `[fixed]` line under it. Re-run without `--fix` to see the
state that remains.
