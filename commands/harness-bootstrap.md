---
description: 주어진 스택으로 레포 하네스를 세운다
argument-hint: <rn-cli|rn-expo|react|next>
---

스택 `$1`에 대해 `harness-bootstrap` 스킬을 실행한다.

스택 인자가 `${CLAUDE_PLUGIN_ROOT}/stacks/$1/profile.json`을 고른다. 프로필에
`"abstract": true`가 있으면 실행을 거부한다 — abstract 프로필은 확장되기 위해서만 있다.

스택이 주어지지 않았으면 abstract가 아닌 프로필을 나열하고 어느 것인지 묻는다.
