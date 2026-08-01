---
description: Audit an existing repo harness against the principles
argument-hint: [--fix]
---

Run the `harness-audit` skill.

Report every finding, sorted by severity. Do not suppress low-severity ones —
filtering is the reader's pass, not yours.

With `--fix`, apply only findings whose remedy is mechanical (a missing
section, an unregistered script). Never auto-edit prose.
