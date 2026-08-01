---
description: Set up a repo harness for a given stack
argument-hint: <rn-cli|rn-expo|react|next>
---

Run the `harness-bootstrap` skill for stack `$1`.

The stack argument selects `stacks/$1/profile.json`. Reject the run if the
profile has `"abstract": true` — abstract profiles exist only to be extended.

If no stack was given, list the non-abstract profiles and ask which one.
