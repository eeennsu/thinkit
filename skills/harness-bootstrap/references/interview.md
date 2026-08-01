# Interview

Seven questions. Each is here because its answer cannot be found by reading the
repository — or, for the last two, because what the repository shows is a
description of the past that the owner still has to accept or reject as the
rule going forward. That is the only filter.

Each entry carries `axis`. A `principle` question is asked in every generation.
A `calibrated` question exists because of a value in `calibration/`, and drops
when that value moves.

Write the answers to a JSON file and pass it to `scaffold.mjs --answers`. Each
entry below names the key it is read from; the list-valued ones take one string
per item, and omitting a key means the same as answering it empty.

```json
{
  "projectName": "…", "oneLine": "…",
  "severity": "error", "greenfield": false,
  "safetyBoundaries": [], "verification": [], "exceptions": [],
  "publicApi": "enforced", "sliceCoupling": "isolated"
}
```

`severity` is Q4's answer and takes `error`, `warn` or `off`. `greenfield` only
sets its default (`false` → `warn`) and is ignored when `severity` is given. An
unknown severity stops the run: it is written straight into the generated rule,
where eslint rejects it as a config error and the whole lint run stops — on a
file the repo owner did not write.

The last two take one of the values `modules/fsd/layers.json` declares under
`variants`. An unknown value stops the run; there is no fallback, because a
typo that quietly produced the strict config would be reported as the repo's
answer.

---

## Q1 — What is this repo for? One line.

```yaml
id: Q1
axis: principle
writes: CLAUDE.md first line
```

Ask even when a README exists — read it first and offer its first line back
for confirmation rather than asking cold.

If the answer is empty: leave the placeholder and say so in the report. Do not
invent a description from the file listing.

---

## Q2 — Does anything here leave the repo or fail irreversibly?

Store deploys, payments, personal data, signing keys or certificates,
production databases, anything that spends money.

```yaml
id: Q2
axis: principle
key: safetyBoundaries
writes: "## Safety Boundaries" (only when non-empty)
```

The general direction is fewer constraints. This is the exception, and which
areas qualify is a property of the repo, not of the model. Ask; do not ship a
list.

If the answer is empty: **write no Safety Boundaries section.** An invented
boundary teaches the reader to skim the section that was meant to stop them.

For each item, capture the approval path as well as the prohibition. A rule
with no way out gets worked around the first time it is wrong.

---

## Q3 — In this repo, what about verification could the model not work out on its own?

Prompts: a device or simulator that must be running, a native build that has
to happen first, a gate that must not be skipped, something that cannot run
locally at all, a suite whose green does not mean what it looks like.

```yaml
id: Q3
axis: calibrated
key: verification
calibrated_by: model_defaults.self_verification
on_value:
  "on": ask          # the model already verifies; only repo-specific facts are worth writing
  "off": drop        # a future generation that does not self-verify needs a different question, not this one
writes: .claude/skills/verification/SKILL.md (only when non-empty)
```

This question exists only because the current calibration says the model
verifies its own work unprompted. So "verify your work" is already covered and
writing it down costs tokens twice. What is left is what the repo knows and
the model cannot.

If the answer is empty: **create no verification skill.** This is the default
outcome for a new repo and it is correct.

Stack overlays may add context to this question. The overlay path is the
`questions` field of the resolved stack profile — a stack without that field has
no overlay, and the file is never looked for by convention. A path that is
declared and missing stops the run rather than being read as "no overlay":
`tests/verify-profiles.mjs` holds both directions, so an overlay nothing
declares is a failing test rather than a question set that quietly stopped
being asked.

An overlay only applies while the question is alive; it must not resurrect a
dropped question.

---

## Q4 — Should new boundary rules start as errors or warnings?

```yaml
id: Q4
axis: principle
key: severity
values: [error, warn, off]
writes: the severity of both boundary rules in eslint.config.boundaries.mjs
default: error on an empty repo, warn when code already exists
```

Not a generation question and not a taste question: on an existing codebase,
`error` drowns the first run and the rule gets disabled, which enforces
nothing. Read the repo for the default, then confirm.

---

## Q5 — Where does the repo already break its own rules, and should new code be exempt?

```yaml
id: Q5
axis: principle
key: exceptions
writes: .claude/references/architecture.md (Exceptions), only when non-empty
```

Only meaningful on a repo with existing code. Recording the violations keeps a
reader — human or model — from studying the legacy and concluding it is the
convention.

If the answer is empty: **write no architecture.md.** The dependency direction
is already enforced by the linter, and the layer list is visible in the file
system. With no exceptions to record, the file would hold nothing that is not
already available.

---

## Q6 — Is a slice reachable only through its index, or do callers import files inside it?

```yaml
id: Q6
axis: principle
key: publicApi
values: [enforced, open]
writes: whether the boundary policies target index.* (eslint.config.boundaries.mjs)
default: read the repo, then confirm
```

Read first, the same way Q4 does. Count the `index.*` files sitting at a slice
root against the imports that reach past one:

```
slice roots with an index   find <fsdRoot>/{entities,features,widgets} -maxdepth 2 -name 'index.*'
imports that reach inside   grep -roE "from '@(entities|features|widgets)/[^']+/[^']+'"
```

A repo with no slice-root index files and hundreds of deep imports has already
answered `open`; offer that and confirm. Answering `enforced` there is a
migration, not a setting — say so, and let the owner choose it deliberately.

This is not a taste question. `enforced` on a repo built without public APIs
reports every existing import, and a rule that fires on all of the code is a
rule someone turns off within the day.

---

## Q7 — May a slice import a sibling slice of its own layer?

```yaml
id: Q7
axis: principle
key: sliceCoupling
values: [isolated, same-layer]
writes: whether each sliced layer gets a self-allow policy (eslint.config.boundaries.mjs)
default: read the repo, then confirm
```

Read it the same way: how many files under `features/` import `@features/`. A
repo where that is common has answered `same-layer`.

Ask it separately from Q6 even when both answers point the same way. They are
independent axes — a repo can keep public APIs and still let siblings talk —
and asking them as one question makes the looser answer arrive by accident.

Whichever way both go, layer direction survives: `entities` importing
`features` is reported under every combination. That is the floor, and it is
not offered as a choice.

---

## Read, not asked

Two more keys reach `scaffold.mjs`, and neither is a question. They are
repo-visible — read them, do not ask.

| Key | Read from | Falls back to |
| --- | --- | --- |
| `routingRoot` | the directory where routes or navigators are registered | `profile.routingRoot` |
| `routingImports` | the layers those files already import | `layers.json` `routing.mayImport` |

`routingRoot` may sit inside `fsdRoot` (`src/navigators/`) or beside it
(`app/`). Both work; the routing element is registered ahead of the layers, so
one inside `fsdRoot` still matches routing.

---

## Not asked

| Not asked | Why |
| --- | --- |
| Which architecture | The stack profile decides. FSD for all four stacks. Q6 and Q7 set how tightly it is held, not whether it applies |
| Type strictness, formatting | Fixed defaults, enforced by config. Preferences cost nothing when decided for you and cost arguments when left open |
| Package manager, test runner, monorepo | Detectable |
| Framework, language | Detectable |
| "What are your gotchas?" | A new repo has none. Asking produces invented ones, and a wrong gotcha is worse than a missing one. The section ships empty on purpose |
