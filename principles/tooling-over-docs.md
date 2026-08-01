# If a tool can enforce it, the doc must not repeat it

A rule in a document is a request. A rule in a linter is a fact. Keeping both
costs tokens on every request and lets the two drift apart.

```
Can a linter, formatter, type checker, hook, permission setting, or CI job
decide this?
  yes -> move it there and delete the sentence
  no  -> it may stay in the document
```

What this repo moves into tooling:

| Rule | Tool |
| --- | --- |
| Layer dependency direction | `boundaries/dependencies` policies |
| Slice isolation inside a layer | same rule, `default: "disallow"` |
| Public API (no deep imports) | same rule, `fileInternalPath` selector |
| Type strictness | `tsconfig.json` |
| Formatting | Prettier |
| Import order matching the layer graph | `@ianvs/prettier-plugin-sort-imports`, `importOrder` generated from `layers.json` |
| Path alias consistency | derived from `tsconfig.json` |
| Hook call order, stale dependency arrays | `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` |
| Debug output left behind in a change | `no-console` |
| Bindings left unused after a refactor | `@typescript-eslint/no-unused-vars`, `^_` to opt out |

The last three are there because of who writes the code now. Each one is a
sentence a repo would otherwise put in CLAUDE.md and pay for on every request,
and each describes a mistake that reads as working code. The `^_` prefix is not
decoration: a rule with no way to say "yes, on purpose" gets switched off whole
the first time it is inconvenient.

The claim "the tool enforces this" is only allowed once a fixture proves the
tool actually reports the violation. A rule that is half enforced and fully
deleted from the docs is worse than one that was never automated: the reader
believes it is covered.

`npm run harness:check`, `tests/verify-boundaries.mjs`, `tests/verify-rules.mjs`
and `tests/verify-import-order.mjs` exist so that the claim can be re-tested
rather than trusted. A row may be added to the table above only once a fixture in
one of them has watched the tool report the violation, and watched a legitimate
case stay clean.

Two of those rows carry a second obligation, because their tool is a formatter
rather than a linter. Formatting and import order are only enforced while
something runs Prettier, so the bootstrap registers a `format` script and
`tests/verify-scaffold.mjs` holds it there. A generated config that no command
invokes is a preference, and counting it as an enforced rule is the exact claim
this file exists to forbid.
