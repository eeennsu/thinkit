---
name: harness-audit
description: 기존 레포의 하네스 — CLAUDE.md, 스킬, 레퍼런스, 에이전트 지시 — 를 검토해 충돌, repo-visible 채움글, 도구가 소유해야 할 규칙, 모델이 이미 하는 일을 되풀이하는 지시를 찾을 때 쓴다.
---

# 하네스 감사

## 순서

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" --mode full --target <repo> --json`
2. 기계 판정은 이미 끝난 것이다. 읽되, 다시 유도하지 않는다.
3. `pending: true`인 항목은 각자의 루브릭으로 직접 판정한다. 스크립트가 내릴 수 없는
   판단이 그것들이다.
4. **전부** 보고한다. 심각도 순으로 정렬한다.

체커는 플러그인과 함께 배포되고 작업 디렉터리는 감사 대상 레포이므로, `${CLAUDE_PLUGIN_ROOT}`로
주소를 잡는다. bootstrap된 레포에는 `.claude/harness/check.mjs`에 자기 사본도 있지만, 그 사본은
세대 무관 규칙만 지니므로 `--mode full`을 대신하지 못한다.

## 전부 보고한다

보고를 중요한 발견으로 좁히지 않는다. 심각도 필터로 시작하지도 않는다. 필터링은 읽는
사람에게 속한 별도의 패스다 — 생성 시점에 잘린 보고는 나중에 되돌릴 수 없다.

이것은 취향의 문제가 아니다. 현재 캘리브레이션에서 보수적으로 하라는 지시는 보고를
날카롭게 만드는 게 아니라 짧게 만들고, 그래서 `review.cutoff-instruction`이 이 플러그인
자신의 규칙 집합에서 error 심각도다.

정렬 순서: error, warn, info. 탈락한 캘리브레이션 항목은 이유와 함께 `info`로 보고하고
조용히 빼지 않는다 — 돌지 않은 검사가 통과한 검사처럼 보이면 안 된다.

## 판단 항목

`pending` 발견마다 자기 루브릭을 지목한다.

| 규칙 id | 루브릭 |
| --- | --- |
| `claude-md.repo-visible.prose` | `${CLAUDE_PLUGIN_ROOT}/principles/gotcha-vs-repo-visible.md` |
| `skill.without-repo-specific-content` | `${CLAUDE_PLUGIN_ROOT}/principles/gotcha-vs-repo-visible.md` |
| `rule.single-ownership` | `${CLAUDE_PLUGIN_ROOT}/principles/ownership-map.md` |
| `claude-md.memory-log` | `${CLAUDE_PLUGIN_ROOT}/principles/ownership-map.md` |
| `rule.absolute-without-exception` | `${CLAUDE_PLUGIN_ROOT}/principles/ownership-map.md` |
| `tooling.enforceable-rule-in-doc` | `${CLAUDE_PLUGIN_ROOT}/principles/tooling-over-docs.md` |
| `architecture.boundary-convention-unenforced` | `${CLAUDE_PLUGIN_ROOT}/principles/boundary-convention.md` |
| `instruction.duplicates-model-default` | `${CLAUDE_PLUGIN_ROOT}/skills/harness-audit/references/judgement-calls.md` |
| `review.cutoff-instruction` | `${CLAUDE_PLUGIN_ROOT}/skills/harness-audit/references/judgement-calls.md` |

id로 키를 잡는 것은 `check.mjs`가 발견에 id를 실어 보내기 때문이다. 서술로 키를 잡으면
손에 이미 있는 id를 되추론하게 된다. 경로가 `${CLAUDE_PLUGIN_ROOT}`인 것도 같은 이유다 —
상대 경로는 감사 대상 레포를 기준으로 풀리고 거기엔 이 파일들이 없다.

판정하기 전에 실제 파일을 읽는다. 인용한 줄이 없는 발견은 추측이다.

## 심어진 파일

`check.mjs`는 이 플러그인이 심은 것들의 상태를 보고한다. `current`, `outdated`,
`edited-locally`, `missing`, `unreadable`. `outdated`인 파일은 재생성을 제안한다. 로컬에서
수정된 것은 절대 덮어쓰지 않는다 — 차이를 드러내고 소유자가 병합하게 한다.

`outdated`는 플러그인 사본만 도달할 수 있는 판정이다. 대상 레포에 기록된 심기 버전을 지금
플러그인이 쓸 내용과 비교하는데, 심어진 사본에는 비교할 정본이 없다. 혼자 호출되면
`current`라고 보고하면서 거기서는 낡음을 확인할 수 없었다고 말한다. 그것을 최신 하네스로
읽지 않는다 — 그 답을 원하면 플러그인 자신의 `check.mjs`를 돌린다.

## --fix를 쓸 때

`--fix`가 하는 처치는 다섯이다. 넷은 더하고 하나는 지운다. 여섯 번째 처치 — 소유자의 답을
받아 적는 것 — 은 `--fix`가 아니라 모델이 하고, 위 「답을 받으면」이 소유한다. 스크립트는
소유자를 부를 수 없으므로 그 처치는 여기 표에 들어오지 않는다.

| 고치는 것 | 고치지 않는 것 |
| --- | --- |
| 빠진 `## 함정` 제목, 비워둔 채로 | 그 내용 — 지어낸 함정은 없느니만 못하다 |
| 설정 때 선언됐는데 사라진 `## 안전 경계` 제목, 비워둔 채로 | 그 내용 — 매니페스트의 선언을 도로 펼치면 소유자가 일부러 지운 경계가 되살아난다 |
| 등록되지 않은 `harness:check` 스크립트, 체커가 있는 레포에서 | 심어진 게 없는 레포의 같은 스크립트: 없는 파일을 가리키게 된다 |
| `outdated`거나 `missing`인 심어진 파일 | `edited-locally`인 것, 또는 `unreadable`인 매니페스트 |
| 코드펜스 안의 디렉터리 트리 | 그 위의 제목과 문장 — 트리 옆에 붙은 산문은 보통 규칙이다 |

트리만 기계가 혼자 지워도 되는 이유는 판정에 레포의 의도가 들어가지 않기 때문이다.
트리는 규칙이 아니라 파일 시스템에 대한 서술이고, 강제되는지 물을 것도 없다 — 강제할
것이 없다. 나머지 산문은 그렇지 않고, 그래서 아래 관문을 지난다.

두 제목 다 CLAUDE.md가 아니라 **산문이 사는 파일**로 간다. CLAUDE.md가 `@AGENTS.md` 한 줄인
포인터면 규칙도 함정도 AGENTS.md에 있고, 포인터에 붙은 제목은 자기가 속한 문서와 갈라진다.
import가 여럿이거나 CLAUDE.md가 자기 산문도 지니면 어느 쪽인지 알 수 없으므로 CLAUDE.md에
남는다.

`package.json`은 수리를 거쳐도 자기 들여쓰기와 마지막 개행 상태를 지킨다. 그건 레포의
파일이고, 키 하나 고치면서 전체를 다시 포매팅하면 그 파일의 모든 줄이 누군가의 diff에
올라간다.

산문은 절대 새로 쓰지 않는다. 지우는 것과 쓰는 것은 다르다 — 지우기는 이미 다른 곳이
소유한 규칙을 걷어내는 것이고, 쓰기는 우리가 모르는 레포에 대한 주장을 만드는 것이다.

## 산문을 지우기 전에 지나는 관문

이 관문은 **모델의 것이다.** 스크립트의 `--fix`에는 산문을 지우는 분기가 없다.

모델은 **자기 판단으로는** 편집하지 않는다. 편집하는 것은 소유자가 건넨 그 문자열뿐이고,
자리는 발견이 인용한 그 자리뿐이다.

예외는 `full` 한 줄이다. 거기서의 삭제는 새 주장을 만들지 않고 이미 도구가 소유한 규칙을
걷어내는 것이라, 소유자 입력 없이도 모델이 수행한다. 판정 근거는 `[enforced]` 표의 `full`
상태 하나뿐이고, `partial`·`none`·`unknown`에서는 어떤 삭제도 없다.

판단 항목을 처리하려면 `check.mjs`가 내놓는 `[enforced]` 표를 먼저 읽는다.
그 표는 대상 레포의 eslint·tsconfig·포매터 설정과 `package.json`을 실제로 읽어서, 규칙
하나하나가 **지금 그 레포에서** 어떤 상태인지 답한다.

| 상태 | 뜻 | 처치 |
| --- | --- | --- |
| `full` | 스코프 제한 없이 걸린다 | 문서에서 지운다. `[묻지 않음]` — 판정에 레포의 의도가 들어가지 않는다 |
| `partial` | 일부 경로에만 걸린다 | (a) 어느 경로가 비었는지 보고만 한다 (b) 소유자가 입력한 대체 줄로 그 줄을 교체한다 |
| `none` | 설정에 없다 | (a) 보고만 한다 (b) 도구로 옮긴다 |
| `unknown` | 설정을 읽지 못했다 | 지우지 않는다. `[묻지 않음]` — 읽지 못한 것은 답을 물을 근거가 아니다 |

`partial`과 `none`은 `AskUserQuestion`으로 묻는다. `full`과 `unknown`은 묻지 않는데,
그것이 판단을 아끼려는 것이 아니라 물을 것이 없기 때문이다 — `full`은 레포의 의도가
판정에 들어가지 않고, `unknown`은 답을 물을 근거 자체를 못 읽었다.

`partial` (b)의 교체 권한은 **발견이 인용한 그 줄 하나**에만 미치고, 소유자가 입력한 문장으로만
교체한다. 요약도 병합도 없다. 린터 설정을 넓히는 선택지는 없다 — `eslint.config.mjs`는
bootstrap이 레포의 몫으로 선언한 파일이다.

`partial`이 이 표의 존재 이유다. "widgets끼리 / features끼리 import 금지"가 한 줄인데
린터는 widgets 쪽만 막고 있으면, 지우는 순간 features 규칙은 아무 데도 없다. 올바른
처치는 줄을 쪼개는 것인데 그건 산문 쓰기라서 여기서 할 수 없다 — 멈추고 보고한다.

`none`과 `unknown`을 가르는 이유도 같다. 규칙이 없는 설정과 읽지 못한 설정은 둘 다
삭제를 막지만 소유자에게 하는 말이 다르고, 읽지 못한 것을 없는 것으로 보고하면 돌지
않은 검사가 통과한 검사처럼 보인다.

이 표는 규칙 id가 아니라 **린트 항목**으로 키를 잡는다 — `formatting`, `import-order`,
`no-explicit-any`, `layer-direction`, `slice-isolation`, `relative-imports`, `no-console`,
`unused-vars`, `package-manager`. 발견은 `tooling.enforceable-rule-in-doc` 같은 id를 지니고,
둘 사이의 매핑은 어디에도 없다. 그러므로 관문은 **도구가 소유할 수 있는 규칙에 대해서만**
돌고, 그 규칙이 어느 린트 항목에 해당하는지는 판정하는 쪽이 짚는다.

나머지 판단 항목 — `instruction.duplicates-model-default`, `review.cutoff-instruction`,
`claude-md.memory-log` 같은 것 — 은 도구 문제가 아니다. "이게 아직 유효한 방침인가"는 설정을
읽어서 답할 수 없으므로 지우지 않고 소유자에게 묻는다. 무엇을 묻는지는 아래 절이 지닌다.

## 소유자에게 묻는 것

`rules.json`이 `audit.asks`를 선언한 규칙은 그 질문을 `AskUserQuestion`으로 그대로 띄운다.
질문을 지어내지 않는다 — 여기 없는 것은 물을 것이 없는 것이다.

| 규칙 id | 언제 뜨나 |
| --- | --- |
| `claude-md.memory-log` | CLAUDE.md에 지난 작업의 기억이 섞였을 때 |
| `rule.absolute-without-exception` | 예외가 붙지 않은 절대 규칙이 있을 때 |
| `tooling.enforceable-rule-in-doc` | 도구가 소유할 수 있는 규칙이 문서에 남아 있을 때 |
| `skill.without-repo-specific-content` | 스킬에 이 레포 고유의 것이 없을 때 |
| `architecture.boundary-convention-unenforced` | 경계 규약이 있는지, 무엇이 그것을 강제하는지 읽어서 갈리지 않을 때 |
| `instruction.duplicates-model-default` | 기본값이 반대인 축에 지시가 비어 있을 때 |
| `review.cutoff-instruction` | 리뷰 보고를 잘라내라는 줄이 있을 때 |

뒤의 둘은 `axis: calibrated`에 `on_unset: drop`이다. 캘리브레이션이 그 값을 모르면 규칙
자체가 떨어지므로 질문도 뜨지 않는다. 정적으로는 일곱이고 한 번 도는 데 뜨는 것은 다섯일 수 있다.

`architecture.boundary-convention-unenforced`의 답은 **받아 적지 않는다.** 아래 「답을 받으면」이
소유하는 것은 산문이고, 경계 규약은 산문이 아니라 설정이 소유한다. 감사는 상태를 보고하고
어느 도구가 판정할 수 있는지 말하는 데서 멈춘다 — 설정을 쓰는 것은 부트스트랩이다. 여기서
쓰면 아키텍처가 다시 묻지 않고 심는 답이 된다.

## 답을 받으면

지우는 답은 지운다. **문장을 남기라는 답은 받아 적는다** — 우리가 쓰는 것이 아니라 소유자가
입력한 그 문자열을 우리가 소유한 제목 아래 기록하는 것이다.

- 소유자가 입력하지 않은 문장은 쓰지 않는다. 요약도 다듬기도 없다.
- 제목을 새로 만들지 않는다. 대상 제목이 없으면 기록하지 않고 보고한다.
- CLAUDE.md가 남을 가리키는 포인터(`@docs/rules.md`)면 기록하지 않는다. 그건 남의 산문이고
  CLAUDE.md와 같은 보호를 받는다. `@AGENTS.md`이고 그 AGENTS.md가 우리 것이면 기록하되,
  기록하는 경로는 `AGENTS.md`다 — 산문이 사는 파일이 대상이다.
- repo-visible이 되는 답은 기록하지 않는다. **이 경계는 판단이고 기계가 붙들지 않는다** —
  구조적 repo-visible만 검사가 있고, 타이핑된 산문의 repo-visible은 판단 항목이라 종료
  코드에서 빠진다. 덮여 있다고 믿지 않는다.

기록한 것은 매니페스트에 남긴다.

```json
"transcribed": [
  { "path": "AGENTS.md", "heading": "안전 경계", "sha": "<기록한 문자열의 sha>", "deleted": false }
]
```

`files`에 넣지 않는다. 그 배열의 `sha256`은 전체 파일 해시라, 우리가 심은 적 없는 파일이
영구히 `edited-locally`로 보고된다.

다시 묻기 전에 이 기록을 본다. `heading` 아래 섹션을 뽑아 해시하고 `sha`와 맞춘다.

| 비교 | 뜻 | 처치 |
| --- | --- | --- |
| 같다 | 우리가 적은 그대로다 | 다시 묻지 않는다 |
| 다르다 | 소유자가 고쳤다 | 그쪽이 정본이다. 다시 묻지 않는다 |
| 없다 | 소유자가 지웠다 | 다시 묻지 않는다. 항목을 **지우지 않고** `"deleted": true`를 단다 |

마지막 줄이 요점이다. 기록을 지우면 다음 실행이 답이 있었다는 사실을 잃고 같은 질문을 다시
띄운다. 소유자가 일부러 지운 것이 질문으로 되살아나는 것이고, 그건 이 플러그인이 다른
자리에서 금지한 실패다.

기록 직후 `--mode principles --json`을 다시 돌린다. 기록 전에 없던
`claude-md.repo-visible.structural`이 새로 들어오면 거부하고 되돌린다. 종료 코드로 걸지
않는다 — 그 규칙은 `warn`이라 떠도 0이다. 보는 것은 **발견 id 집합의 차분**이다.
쓰기 직전 대상 파일 내용을 잡아두고, 거부하면 그것을 다시 쓴다. 트랜잭션이 없으므로 그렇게 한다.
답을 여럿 기록하는 패스라면 스냅샷은 **쓰기마다** 뜬다.

심어진 파일을 갱신하려면 정본 내용이 필요하므로, 감사가 플러그인에서 돌 때만 작동한다.
혼자 호출된 심어진 사본은 낡음을 보고하고 bootstrap을 다시 돌리라고 말한다.

발견은 수리가 돌기 전에 측정하므로, 고쳐진 항목도 목록에 남고 그 아래 `[fixed]` 줄이
붙는다. 남은 상태를 보려면 `--fix` 없이 다시 돌린다.
