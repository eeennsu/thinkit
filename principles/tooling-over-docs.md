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
| Path alias consistency | derived from `tsconfig.json` |

The claim "the tool enforces this" is only allowed once a fixture proves the
tool actually reports the violation. A rule that is half enforced and fully
deleted from the docs is worse than one that was never automated: the reader
believes it is covered.

`npm run harness:check` and the boundary fixtures exist so that the claim can
be re-tested rather than trusted.
