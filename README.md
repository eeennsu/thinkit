# thinkit

레포의 하네스(CLAUDE.md / Skills / References / 린트 경계)를 세팅하는 Claude Code 플러그인.

소개와 문서: <https://eeennsu.github.io/thinkit>

**CLAUDE.md를 만들어주는 도구가 아니라, 계속 얇게 유지시켜주는 도구다.**

전제가 뒤집혔기 때문이다. 규칙을 미리 많이 주는 것이 정석이었는데, 이제는 그 규칙들이
서로 충돌해 모델이 판정에 추론을 쓰게 만든다. 충돌은 에이전트를 망가뜨리지 않고
**요금을 청구한다** — 답은 대체로 맞고, 거기 도달하는 데 더 많이 쓴다. 그래서 하네스 세팅의
일은 무엇을 적을지 고르는 것이 아니라 **무엇을 안 적어도 되는지 판정하는 것**이 되었다.
1차 소스와 근거는 [docs/principles.md](docs/principles.md)에, 지금 어느 세대를 기준으로
판정하는지는 [calibration/index.json](calibration/index.json)에 있다.

이 판정을 레포마다 처음부터 다시 하는 대신, 판정 자체를 재사용 가능한 형태로 묶은 것이
이 플러그인이다. 그래서 실어 나르는 것은 완성된 규칙 문장이 아니라 **질문 세트와 판정 기준**이다.
세팅을 대신 써주지 않는다. 레포 소유자가 답해야만 정해지는 것을 묻고, 그 답으로 구성한다.
남의 레포에 맞는 답은 우리가 알 수 없고, 지어낸 답은 없는 것보다 나쁘다.

내용을 싣기 시작하면 어떻게 되는지는 분명하다. 미리 채운 템플릿을 뿌리는 순간 이 도구는
**가이드가 지우라던 바로 그 파일을 4개 스택에 자동 생산하는 도구**가 된다.

## 설치

```
/plugin marketplace add eeennsu/thinkit
/plugin install thinkit@eeennsu
```

## 두 개의 명령

```
/harness-bootstrap <rn-cli|rn-expo|react|next>   제로베이스 레포에 하네스를 세팅
/harness-audit [--fix]                            이미 세팅된 레포를 같은 기준으로 감사
```

둘은 **같은 판정 기준을 시점만 다르게** 적용한다. 기준은 `principles/rules.json` 한 파일에 산다.
부트스트랩이 통과시킨 것을 감사가 잡아내는 일은 생기지 않는다.

스택은 플러그인이 아니라 인자다. 스택마다 플러그인을 설치하지 않는다.

## 무엇을 묻나

일곱 개. 각 질문은 **파일 시스템을 읽어서는 답을 알 수 없다** — 또는 마지막 둘처럼
읽어서 알 수 있는 건 과거의 서술일 뿐이고 앞으로의 규칙으로 받아들일지는 소유자가 정해야 한다 —
는 이유 하나로 거기 있다.

|     | 질문                                                              | 답이 비면                              |
| --- | ----------------------------------------------------------------- | -------------------------------------- |
| Q1  | 이 레포는 뭘 하는 것인가, 한 줄로                                 | 자리표시자를 남기고 보고서에 밝힌다    |
| Q2  | 코드가 레포 바깥으로 나가거나 되돌릴 수 없게 실패하는 지점이 있나 | Safety Boundaries 섹션을 만들지 않는다 |
| Q3  | 검증에서 모델이 스스로 알아낼 수 없는 것이 있나                   | verification 스킬을 만들지 않는다      |
| Q4  | 경계 규칙을 `error`로 막을까 `warn`으로 시작할까                  | 빈 레포는 error, 코드가 있으면 warn    |
| Q5  | 규칙을 이미 어기고 있는데 당장 못 고치는 곳이 있나                | architecture.md를 만들지 않는다        |
| Q6  | 슬라이스는 index로만 닿나, 안쪽 파일을 직접 import하나            | 레포를 읽어 제안하고 확인받는다        |
| Q7  | 같은 레이어의 형제 슬라이스끼리 import해도 되나                   | 레포를 읽어 제안하고 확인받는다        |

Q6·Q7은 취향이 아니다. 공개 API가 없는 레포에 `enforced`를 걸면 기존 import가 전부 걸리고,
전부 걸리는 규칙은 그날 안에 꺼진다. 둘은 **따로** 묻는다 — 독립된 축이고, 묶어 물으면
느슨한 쪽 답이 사고로 딸려온다.

**"답이 비면" 열이 이 플러그인의 절반이다.** 빈 답에 대한 올바른 산출물은 대개 산출물 없음이다.
지어낸 Safety Boundary는 읽는 사람에게 그 섹션을 건너뛰는 법을 가르친다.

묻지 않는 것: 아키텍처, 타입 엄격도, 포매팅, 패키지 매니저, 모노레포 여부.
전부 탐지되거나 고정 기본값이다. 정해주면 공짜고, 열어두면 논쟁이 된다.

## 레포에 무엇이 생기나

**설정 파일** — `eslint.config.mjs`, `eslint.config.boundaries.mjs`, `tsconfig.json`,
`prettier.config.mjs` (RN 계열은 `babel.config.js`도).
경로 별칭은 한 표에서 나와 tsconfig와 번들러 설정으로 동시에 간다.

린트 config가 두 개인 이유는 소유권이다. 경계 정책은 레이어 그래프에서 생성되므로
`eslint.config.boundaries.mjs`가 전부 소유하고 매번 다시 만든다. `eslint.config.mjs`는
그걸 spread해 들여올 뿐인 **레포의 파일**이다. 한 파일이었다면 규칙 한 줄을 더하는 순간
`edited-locally`가 되어 레이어 그래프가 그날 상태로 얼어붙는다.

**CLAUDE.md** — 얇다. 얇은 게 성공이다. 대신 완료 보고가 산출물 목록으로 나온다:
생성된 파일, 도구가 강제하는 규칙 수, CLAUDE.md 근사 토큰, check 통과 여부.

**조건부 산출물** — Q2·Q3·Q5에 답이 있을 때만.

**심는 파일 두 개** — `.claude/harness/check.mjs`와 세대 무관 규칙 사본.
`package.json`에 `harness:check`로 등록되므로 스킬 없이도 CI에서 돈다. 어텐션 비용은 0이다.

심은 파일은 매니페스트의 해시로 네 상태를 구분한다 — `current` / `outdated` /
`edited-locally` / `missing`. **`edited-locally`는 절대 자동으로 덮지 않는다.**
차이를 드러내고 병합은 소유자가 한다.

## 경계 규칙

레이어 방향과 슬라이스 격리를 `eslint-plugin-boundaries` 하나가 소유한다.
`import/no-restricted-paths`는 쓰지 않는다 — 인접한 일을 두 플러그인이 나눠 가지면 규칙이 갈라진다.

린터가 강제할 수 없는 판정만 문서로 남는다. 경계 말고도 네 개가 더 도구로 간다 —
`rules-of-hooks`, `exhaustive-deps`, `no-console`, `no-unused-vars`(`^_`로 예외).
전부 "작동하는 코드처럼 보이는 실수"고, 안 넣으면 CLAUDE.md에 문장으로 남아
매 요청마다 값을 치른다. 목록과 근거는 [principles/tooling-over-docs.md](principles/tooling-over-docs.md).

> 리졸버 없이 boundaries를 쓰면 import가 해석되지 않고, 해석되지 않은 대상은 기본값에 따라
> **전부 건너뛴다.** config는 멀쩡해 보이고 위반은 0건이다. 생성되는 config는
> `no-unknown-dependencies`를 켜서 이 침묵을 경고로 바꾼다. 근거는
> [docs/design-log.md](docs/design-log.md).

## 빈 Gotchas는 버그가 아니다

세팅 직후 CLAUDE.md의 Gotchas 섹션은 비어 있다. 의도한 것이다.

gotcha는 정의상 레포 안에서 겪어봐야 아는 것이고, 새 레포에는 아직 없다.
추측으로 채운 gotcha는 틀린 gotcha이며, **틀린 gotcha는 빈 섹션보다 나쁘다.**
빈 제목은 채울 자리를 표시한다.

`--fix`도 이 원칙을 지킨다. 없는 제목은 만들지만 내용은 채우지 않는다.

## 요구사항

Node 18.18+ (ESLint 9의 요구). `package.json`은 없으면 만든다 — 있으면 스크립트 두어 개와
빠진 devDependency만 더하고, **들여쓰기와 키 순서는 그 레포 것을 그대로 둔다.**
이미 있는 `lint`·`format` 스크립트나 버전 핀은 덮지 않는다.
RN 계열은 프레임워크가 제공하는 babel 프리셋이 설치돼 있어야 한다 —
없으면 조용히 통과하지 않고 `MODULE_NOT_FOUND`로 크래시한다. 그게 옳은 실패 모드다.

## 더 읽을 것

|                               |                                                          |
| ----------------------------- | -------------------------------------------------------- |
| 원칙과 그 근거                | [docs/principles.md](docs/principles.md)                 |
| 구조 패턴, 2차 소스 출처 분리 | [docs/structure-patterns.md](docs/structure-patterns.md) |
| 무엇을 왜 그렇게 정했는지     | [docs/design-log.md](docs/design-log.md)                 |
| 세대 의존 값의 위치           | [docs/calibration-notes.md](docs/calibration-notes.md)   |
| 원문 아카이브                 | [docs/references/](docs/references/)                     |

기여자가 어기면 안 되는 것은 [CLAUDE.md](CLAUDE.md)에 있다. 한 규칙에 소유자는 하나다.

## 개발

```
node tests/verify-profiles.mjs                        설치 불필요
node tests/verify-scaffold.mjs                        설치 불필요
node tests/verify-boundaries.mjs   --sandbox <dir>
node tests/verify-rules.mjs        --sandbox <dir>
node tests/verify-import-order.mjs --sandbox <dir>
```

앞의 둘은 아무것도 설치하지 않고 돈다. 그래서 **항상 돌 수 있는 테스트**다.

`verify-profiles`는 스택 프로필이 한 약속을 지키는지 본다 — 생성된 config가 이름으로
import하는 패키지가 devDependencies에 다 있는지, `files[]`의 템플릿이 실재하는지,
`questions` 경로가 실재하는지, 그리고 **참조되지 않는 `questions.json`이 없는지**.
마지막 항목이 양방향인 이유는, 한쪽만 보면 아무도 안 읽는 질문 세트가 조용히 남기 때문이다.

`verify-scaffold`는 입력이 틀렸을 때 스크립트가 뭘 하는지 본다 — 없는 `--answers` 파일,
망가진 JSON, 오타 난 `severity`, 우리가 쓰지 않은 prettier config, 심어지지 않은 checker.
전부 **조용히 지나가던** 경로였고, 레포에 관한 진실을 보고하는 게 일인 도구에서
조용한 오답은 가장 나쁜 결함이다.

`verify-boundaries`는 실제 ESLint로 4개 스택 × 변형 4쌍에 위반과 **대조군**을 돌린다.
스택 목록은 `listStacks()`에서 나온다 — 하드코딩하면 새 스택이 목록 없이 추가되고,
그 스택은 규칙 수가 확인되지 않은 채로, 아무 말 없이 출고된다.
대조군이 핵심이다 — 부정 픽스처만으로는 올바른 config와 모든 import를 차단하는 config를
구분하지 못한다. 둘 다 위반을 전부 잡는다. 대조군 하나는 `.ts` 파일인데,
나머지가 전부 `.js`라서 **TypeScript를 아예 파싱 못 하는 config**를 아무도 못 잡기 때문이다.

`verify-rules`는 경계 밖 규칙 네 개가 실제로 발화하는지, 그리고 `^_` 탈출구가
실제로 놓아주는지를 본다. 기대 ruleId 집합이 **정확히** 일치해야 통과한다 —
"최소 하나 포함"이면 옆 파일까지 물어뜯는 규칙을 통과시킨다.

`verify-import-order`는 생성된 prettier config가 실제로 레이어 순서대로 재정렬하는지,
그리고 side-effect import를 **넘지 않는지**를 본다. 입력은 일부러 기대 출력의 역순이다 —
반쯤 정렬된 입력은 아무것도 하지 않은 플러그인도 통과시킨다. 안 도는 포매터는
"손으로 정렬한 것처럼 보이는" 파일을 낳고, 그건 아무도 보고하지 않는다.

이 테스트들이 통과하지 않은 스택의 규칙 수는 보고하지 않는다.
