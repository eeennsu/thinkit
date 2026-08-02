---
name: harness-bootstrap
description: Use when setting up a repo harness (CLAUDE.md, skills, references, lint boundaries) for a new or unconfigured repository, given a stack name.
---

# Harness bootstrap

This plugin does not write someone else's harness for them. It asks the
questions whose answers cannot be found in the repo, then turns the answers
into files and lint rules.

## Order

1. **Resolve the stack.** `${CLAUDE_PLUGIN_ROOT}/stacks/<stack>/profile.json`.
   Refuse abstract profiles. If the argument is missing, list the non-abstract
   stacks and ask.
2. **Read what is already there** — `package.json`, existing config, whether
   the repo has code yet, how its imports are actually written, where routes
   are registered. This sets the defaults for Q4, Q6 and Q7, and supplies
   `routingRoot` outright. Do not ask about anything you can read; do confirm
   what you read before it becomes a rule.
3. **Interview.** `references/interview.md`. Seven questions, each tagged with
   why it exists. Skip a question only for the reason its own entry gives.
4. **Scaffold.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs" <stack> --target <repo> --answers <file>`.
5. **Check.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" --mode full --target <repo>`.
6. **Report.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/report.mjs" <stack> --target <repo>`.

Steps 4-6 are scripts, not instructions to the model. That is deliberate: a
rule a tool can enforce does not belong in prose, and that includes the rule
that says to verify the output.

The scripts live with the plugin and the working directory is the repo being
set up, so they are always addressed through `${CLAUDE_PLUGIN_ROOT}`. A relative
path here resolves against the target repo, where these files do not exist.

## What comes out, and what does not

Written every time: two lint configs, tsconfig, formatter, CLAUDE.md with an
empty Gotchas section, and the planted checker registered as
`npm run harness:check`.

Layer directories are written **only into a repo with no code under `fsdRoot`**.
On an empty repo they are the point — a layer graph with nowhere to put anything
is a document. On a repo that already has code, `src/entities/.gitkeep` for a
layer that repo never had is a directory nobody asked for, and the policies do
not need it to exist. The absent layers are named in the report instead.

`package.json` gets three scripts — `harness:check`, `lint`, `format` — and the
missing dev dependencies. `format` is not a convenience: the generated import
order is a rule the report counts as enforced, and a formatter no command runs
enforces nothing. An existing script or version pin of the repo's own is never
replaced, and the file keeps its own indentation and key order.

The lint config is two files on purpose. `eslint.config.boundaries.mjs` holds the
generated boundary policies and is regenerated on every run;
`eslint.config.mjs` spreads it in and is the repo's to edit. Report it that way.
A repo told it owns one file and then finding its layer graph frozen after one
added rule is the failure this split exists to prevent.

Written only where nothing is in the way. A file already on disk that this
plugin did not write is left alone and reported as `exists, left alone` — a
repo's own `babel.config.js` or `CLAUDE.md` is not ours to replace. The
manifest records what we wrote, so a re-run refreshes those and nothing else.

Written only if an answer calls for it:

| Artifact | Answer key | Condition |
| --- | --- | --- |
| `## Safety Boundaries` in CLAUDE.md | `safetyBoundaries` | Q2 is non-empty |
| `.claude/references/architecture.md` | `exceptions` | Q5 is non-empty |
| `.claude/skills/verification/SKILL.md` | `verification` | Q3 is non-empty |

Q3 is itself calibrated: it is asked only while the calibration says the model
verifies its own work, because that is what makes repo-specific facts the only
part worth writing down. If a generation ever stops self-verifying, Q3 drops
and this skill is not proposed at all — the replacement is a different
question, not this one with a wider condition.

If those answers are empty, the artifacts are not created. That is the correct
outcome, not a gap to fill.

## The report is the deliverable

On a new repo, CLAUDE.md comes out nearly empty: no gotchas exist yet, and
every rule a linter can hold has been moved into the linter. The value is in
the generated configuration, so the report says exactly what was produced and
what is now enforced, with the unit for each number.

Never report a boundary count that `tests/verify-boundaries.mjs` has not
confirmed on this stack **and this pair of variants**. The variants change the
generated policies, so a count confirmed under the strict pair says nothing
about a repo that answered otherwise.
