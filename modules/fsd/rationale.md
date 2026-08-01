# FSD: what the tool decides, and what it does not

The layer graph in `layers.json` is the only place the decision lives. The
ESLint config is derived from it — never hand-written — so the two cannot
drift.

## Enforced (verified by fixtures)

| Constraint | How | Variant |
| --- | --- | --- |
| Layer direction | `boundaries/dependencies`, `default: "disallow"` plus one allow per downward pair | none — always on |
| Slice isolation | falls out of the default: each slice is its own element, and `checkInternals` is false, so `features/a -> features/b` matches no allow | `sliceCoupling` |
| Public API | the allow targets `fileInternalPath: index.*`, so a deep import matches no allow | `publicApi` |

`npm run harness:check` does not test these. The fixtures under `tests/`
do, and the count reported by `report.mjs` is only claimable after they pass —
for the stack *and* the variant pair, since a variant is a different config.

## The two axes, and the one that is not

`layers.json` declares `variants`. A repo answers them; a stack does not, so
two repos on the same stack can differ.

`publicApi: open` drops `fileInternalPath` from every allow. `sliceCoupling:
same-layer` adds one self-allow per sliced layer — isolation is the absence of
a policy, so permitting it takes an explicit one. That self-allow still goes
through the same target builder, or `same-layer` would hand a sibling the deep
import that `enforced` denies everyone else.

Layer direction is not an axis. It is what is left when both answers are the
loosest, and the fixture for it is expected to fail under every combination.

The axes exist because the alternative was worse in both directions: a repo
built without slice public APIs reports every import it has under the strict
config, and the rule gets disabled within the day — enforcing nothing while
the report claims four layers of public API. The looser config enforces less
and says so. A number that overstates is not a stricter number.

## Judgement, not enforced

The tool decides whether an import crosses a boundary. It cannot decide
whether the boundary was drawn in the right place. These stay with the reader:

- **Which slice a thing belongs to.** A "feature" that only holds data
  probably belongs in `entities`; the linter is happy either way.
- **When a shared helper has earned its place.** `shared` accepts everything
  from above, which makes it the default dumping ground.
- **Whether a widget is a widget.** The layer between `screens` and
  `features` is the one that erodes first.

## Deliberately out of scope in v1

**Cross-import between slices of the same layer (`@x`).** FSD has a sanctioned
escape hatch for entity-to-entity references, scoped to a declared surface. We
do not model it. `sliceCoupling: same-layer` is not that hatch — it is the
blunt version, on for the whole layer, with no record of which slice meant to
expose what. It exists because a repo that already cross-imports everywhere
needs a config that describes it; a repo choosing between them should choose
`isolated`. Model `@x` when a repo needs the scoped form, not before.

**Segment rules (`ui` / `model` / `api` / `lib`).** These look expressible:
segments are a capturable path level, so a policy could constrain them.
Excluded anyway. Segment layout is a convention with real exceptions, and a
rule that fires on correct code teaches people to disable the rule. This is a
"possible but not done" entry, not a "cannot" one.
