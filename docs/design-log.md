# 설계 기록 — thinkit 플러그인

무엇을 왜 그렇게 정했는지의 기록. 원칙은 [principles.md](principles.md),
구조 근거는 [structure-patterns.md](structure-patterns.md).

## 정체성

제로베이스 레포에 기초 하네스를 한 번에 세팅하고, 이미 세팅된 레포는 같은 기준으로 감사한다.
bootstrap과 audit은 **같은 판정 기준을 시점만 다르게** 적용한다 → 기준은 `principles/rules.json` 하나에 산다.

플러그인은 하나(`thinkit`)고 레포 루트가 곧 플러그인 루트다. 스택은 플러그인이 아니라 **인자**다 —
`/harness-bootstrap rn-cli`.

## 확정된 문법 — eslint-plugin-boundaries v7.1.0

v6에서 개명·변경된 것들이라 v6 예시를 그대로 쓰면 안 된다.

| 항목 | 정본 | 비고 |
| --- | --- | --- |
| 정책 배열 키 | `policies` | v6의 `rules`에서 개명 |
| 타입 셀렉터 | `type` = 첫 타입, `types` = 전체 배열 | 둘 다 유효 |
| 템플릿 | `{{ }}` | `${ }`는 deprecated |
| 메시지 변수 | `{{policy.index}}` | v6의 `{{rule.index}}`에서 개명 |
| 내부 import | `checkInternals`, 기본 `false` | 같은 엘리먼트 안은 검사 안 함 |
| 매칭 모드 | `mode`는 deprecated | `mode:"full"`은 `partialMatch:false`로 |

근거: [migration v6→v7](https://www.jsboundaries.dev/docs/releases/migration-guides/v6-to-v7/) ·
[policies](https://www.jsboundaries.dev/docs/policies/) ·
[selectors](https://www.jsboundaries.dev/docs/selectors/) ·
[dependencies](https://www.jsboundaries.dev/docs/rules/dependencies/)

`/docs/rules/dependencies/`의 옵션 스키마 블록은 아직 `rules`로 적혀 있다 — **갱신 안 된 v6 잔재다.** 그 페이지만 보면 틀린다.

## 실측으로 확인된 것

### 리졸버는 필수이고, 없으면 조용히 실패한다

리졸버 설정이 없으면 import가 파일로 해석되지 않는다. 그러면 boundaries는 대상을 unknown으로 보고,
`checkUnknownLocals`가 기본 `false`라 **전부 건너뛴다.** config는 정상으로 보이고 위반은 0건이다.

두 겹으로 막는다. 프로필이 리졸버를 스택별로 명시하고(`resolver.devDependency`까지),
생성되는 config가 `boundaries/no-unknown-dependencies`를 켠다 — 해석 실패가 조용한 통과가 아니라
경고로 나온다.

### 대조군 없는 픽스처는 틀린 config를 통과시킨다

리졸버 없이 `checkUnknownLocals: true`만 켠 변형은 **위반 3건을 전부 잡았다.** 부정 픽스처만으로는 3/3 통과다.
실제로는 모든 import가 unknown → default deny에 걸려 **전부 차단하는 config**였다.

→ 대조군은 둘 다 필요하다. 정방향 하나로는 부족하다.

| 대조군 | 무엇을 증명하나 |
| --- | --- |
| `features/c` → `entities/x` | public API를 통한 정방향 import가 해석되고 통과한다 |
| `features/d` → `./helper` | `checkInternals`가 false로 남아 슬라이스 내부는 검사되지 않는다 |

린트되지 않은 파일은 메시지가 0건이라 대조군으로선 통과처럼 보인다. 그래서 `verify-boundaries.mjs`는
**결과에 없는 대조군을 clean이 아니라 fail로 센다.**

### RN 계열은 babel 프리셋이 없으면 죽는다

`eslint-import-resolver-babel-module`이 `babel.config.js`를 로드하므로 거기 적힌 프리셋이 설치돼 있어야 한다.
없으면 MODULE_NOT_FOUND로 **크래시한다** — 조용한 통과가 아니라서 이게 옳은 실패 모드다.
프리셋은 프레임워크(react-native / expo)가 가져오는 것이라 하네스가 버전을 고정하지 않는다.

### 설치 실측 (2026-08-01)

| 패키지 | engines | peerDependencies |
| --- | --- | --- |
| eslint 9.39.5 | node `^18.18 \|\| ^20.9 \|\| >=21.1` | — |
| eslint-plugin-boundaries 7.1.0 | node `>=18.18` | eslint `>=6.0.0` |
| typescript-eslint 8.65.0 | node `^18.18 \|\| ^20.9 \|\| >=21.1` | eslint `^8.57 \|\| ^9 \|\| ^10`, typescript `>=4.8.4 <6.1.0` |

## 승인된 설계 판정

1. **단일 플러그인.** 스택은 인자. `${CLAUDE_PLUGIN_ROOT}` 문제가 사라진다.
2. **4스택**: `rn-cli` `rn-expo` `react` `next`. 전부 FSD를 쓰므로 `modules/fsd`는 선택이 아니라 기본.
   RN 둘의 공통분모는 `rn-base`라는 abstract 프로필로 뺀다 — `extends`는 한 단계만 허용한다.
3. **repo-visible 감지**: 구조적인 것(코드펜스 트리, 경로형 줄, 확장자 나열)만 machine.
   산문은 judgement로 내린다. **스택 키워드 blacklist 금지** — 오탐이 크다.
4. **대상 레포에 SKILL.md를 심지 않는다.** audit 스킬은 플러그인에 있다.
   `.claude/harness/check.mjs`와 principle 축 규칙만 심고 package.json 스크립트로 등록한다. 어텐션 비용 0.
5. **CLAUDE.md가 얇은 건 성공이다.** 대신 완료 보고를 산출물 목록으로 만든다 —
   생성 파일, 강제되는 규칙 수, CLAUDE.md 근사 토큰, check 통과 여부.
   **빈 Gotchas가 버그가 아니라 사용법이라는 게 보고에서 드러나야 한다.**
6. **boundaries가 레이어 방향과 슬라이스 격리를 모두 소유한다.**
   `import/no-restricted-paths`는 뺀다 — 두 플러그인이 인접한 일을 하면 안 된다.
   강제 못 하는 것만 `modules/fsd/rationale.md`에 판정 기준으로 남긴다.
7. **전부 보고하고 severity로 정렬한다.** 덜 보고하지 않는다 ([P5]). `--baseline`은 v1에서 뺀다.
8. **세대 의존 항목은 calibration 축으로 분리한다.** 값이 없으면 판정하지 않고 이유와 함께 info로 드러낸다.
   심을 때는 principle 축만 심는다 — calibration 값은 세대가 바뀌는 순간 낡는다.

### 심은 check.mjs의 노후화 (판정 #4 후속)

`.claude/harness/manifest.json`에 버전과 콘텐츠 해시를 기록한다. audit은 네 상태로 보고한다:

- `current`
- `outdated` → 재생성 제안
- `edited-locally` → 수동 병합 안내. **절대 자동으로 덮지 않는다**
- `missing`

## 인터뷰 질문 (5개 이내, 파일 시스템에서 알 수 없는 것만)

| # | 질문 | 답이 비면 |
| --- | --- | --- |
| Q1 | 이 레포는 뭘 하는 것인가? 한 줄로 | README/package.json에 있으면 확인만 |
| Q2 | 코드가 레포 바깥으로 나가는 지점이 있나? (스토어, 결제, 개인정보, 서명키, 프로덕션 DB) | Safety Boundaries 섹션을 **만들지 않는다** |
| Q3 | 검증에서 모델이 스스로 알아낼 수 없는 것이 있나? | verification Skill을 **만들지 않는다** ← 기본 |
| Q4 | 경계 규칙을 `error`로 막을까 `warn`으로 시작할까 | 제로베이스 error, 기존 코드 warn |
| Q5 | (audit 전용) 규칙을 어기는데 당장 못 고치는 곳이 있나? | `architecture.md`를 **만들지 않는다** |

묻지 않는 것: FSD 여부, TS strict, prettier 취향, 패키지 매니저, 모노레포 여부(전부 탐지 또는 기본값).
**Gotcha는 묻지 않는다** — 제로베이스엔 없다. 빈 섹션으로 출고한다.

## 검증 상태 (2026-08-01)

```
node scripts/scaffold.mjs <stack> --target <dir>     4스택 전부 통과
  --answers 있음                                     Q2·Q3·Q5 조건부 산출물 생성 확인
  --answers 없음                                     같은 산출물이 생기지 않음을 확인
node scripts/check.mjs --mode full --target <dir>    machine/judgement 분리 동작
node scripts/check.mjs --fix                         3종 수리, edited-locally 미변경 확인
node scripts/report.mjs <stack> --target <dir>       harness:check pass
node tests/verify-boundaries.mjs --sandbox <dir>     4/4 스택, 위반 3 + 대조군 2
```

마지막 줄이 나머지의 전제다. **`verify-boundaries.mjs`가 확인하지 않은 스택의 경계 규칙 수는 보고하지 않는다.**
샌드박스에는 eslint 툴체인과 RN 프리셋(`@react-native/babel-preset`, `babel-preset-expo`)이 설치돼 있어야 한다.

조건부 산출물은 **양방향으로** 확인해야 한다. 답이 있을 때 생기는 것만 보면,
답이 없을 때도 생기는 회귀를 놓친다 — 그 회귀가 바로 이 플러그인이 하지 않겠다고 한 일이다.

## 심는 파일의 단일 소유권

`scripts/lib/planted.mjs`가 심을 파일의 목록과 내용을 모두 가진다. `scaffold.mjs`는 부트스트랩 때
쓰고 `check.mjs --fix`는 낡은 것을 갱신하는데, 둘이 각자 목록을 만들면 갈라진다.
**플러그인과 어긋난 planted 파일은 이 플러그인이 남의 레포에서 잡아내는 바로 그 결함이다.**

`--fix`가 고치는 것은 전부 가산적이다 — 없는 제목, 등록 안 된 스크립트, 심은 그대로인 낡은 파일.
`edited-locally`는 건드리지 않고, 산문은 절대 고치지 않는다.
planted 사본은 정본 내용을 갖고 있지 않으므로 스스로 갱신하지 않고 재부트스트랩을 안내한다.

## 남은 것

- `modules/fsd/rationale.md`가 "가능하지만 안 한다"로 남겨둔 두 건: `@x` cross-import, 세그먼트 규칙.
  레포가 실제로 요구하기 전에는 설계하지 않는다.
- 배포 경로(npm / marketplace 등록)와 LICENSE. **아직 착수하지 않았다.**

## README와 CLAUDE.md의 경계

README는 **아직 clone하지 않은 사람**을 향하고, CLAUDE.md는 **레포를 이미 읽을 수 있는 모델**을
향한다. `repo-visible 정보를 생성하지 않는다`가 README에 걸리지 않는 이유가 이것이다 —
`ls` 한 번이면 아는 것과, 설치를 결정하기 전에는 알 수 없는 것은 같은 문장이라도 값이 다르다.

대신 실제 위험은 중복 소유권이다. README는 CLAUDE.md의 금지 조항을 **재진술하지 않고 링크한다.**
다만 "빈 Gotchas는 버그가 아니다"는 양쪽에 남아 있다. 한쪽은 기여자에게 내리는 명령이고
다른 쪽은 사용자에게 하는 설명이라 화행이 다르지만, **금지 #3이 바뀌면 README가 함께 낡는다.**
알고 감수한 것이다. README는 모델이 로드하는 하네스가 아니므로 "어느 지시가 이기나"는 생기지 않는다.

이 레포 자신에 `check.mjs`를 돌리면 `claude-md.gotcha-section`이 warn으로 뜬다.
CLAUDE.md에 `## Gotchas` 대신 `## 어기면 안 되는 것`이 있어서다. **영어 제목을 덧붙여 통과시키지 않는다** —
이 레포는 하네스를 심는 쪽이지 심어진 쪽이 아니고, 규칙을 만족시키려고 제목을 다는 것은
이 플러그인이 다른 레포에서 잡아내는 바로 그 종류의 장식이다.
