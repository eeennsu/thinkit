# thinkit

레포의 하네스(CLAUDE.md / Skills / References / 린트 경계)를 세팅하는 Claude Code 플러그인.

세팅을 대신 써주지 않는다. **레포 소유자가 답해야만 정해지는 것을 묻고, 그 답으로 구성한다.**
남의 레포에 맞는 답은 우리가 알 수 없고, 지어낸 답은 없는 것보다 나쁘다.

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

다섯 개. 각 질문은 **파일 시스템을 읽어서는 답을 알 수 없다**는 이유 하나로 거기 있다.

| | 질문 | 답이 비면 |
| --- | --- | --- |
| Q1 | 이 레포는 뭘 하는 것인가, 한 줄로 | 자리표시자를 남기고 보고서에 밝힌다 |
| Q2 | 코드가 레포 바깥으로 나가거나 되돌릴 수 없게 실패하는 지점이 있나 | Safety Boundaries 섹션을 만들지 않는다 |
| Q3 | 검증에서 모델이 스스로 알아낼 수 없는 것이 있나 | verification 스킬을 만들지 않는다 |
| Q4 | 경계 규칙을 `error`로 막을까 `warn`으로 시작할까 | 빈 레포는 error, 코드가 있으면 warn |
| Q5 | 규칙을 이미 어기고 있는데 당장 못 고치는 곳이 있나 | architecture.md를 만들지 않는다 |

**"답이 비면" 열이 이 플러그인의 절반이다.** 빈 답에 대한 올바른 산출물은 대개 산출물 없음이다.
지어낸 Safety Boundary는 읽는 사람에게 그 섹션을 건너뛰는 법을 가르친다.

묻지 않는 것: 아키텍처, 타입 엄격도, 포매팅, 패키지 매니저, 모노레포 여부.
전부 탐지되거나 고정 기본값이다. 정해주면 공짜고, 열어두면 논쟁이 된다.

## 레포에 무엇이 생기나

**설정 파일** — `eslint.config.mjs`, `tsconfig.json`, `prettier.config.mjs`
(RN 계열은 `babel.config.js`도). 경로 별칭은 한 표에서 나와 tsconfig와 번들러 설정으로 동시에 간다.

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

린터가 강제할 수 없는 판정만 문서로 남는다.

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

Node 18.18+ (ESLint 9의 요구), 대상 레포에 `package.json`.
RN 계열은 프레임워크가 제공하는 babel 프리셋이 설치돼 있어야 한다 —
없으면 조용히 통과하지 않고 `MODULE_NOT_FOUND`로 크래시한다. 그게 옳은 실패 모드다.

## 더 읽을 것

| | |
| --- | --- |
| 원칙과 그 근거 | [docs/principles.md](docs/principles.md) |
| 구조 패턴, 2차 소스 출처 분리 | [docs/structure-patterns.md](docs/structure-patterns.md) |
| 무엇을 왜 그렇게 정했는지 | [docs/design-log.md](docs/design-log.md) |
| 세대 의존 값의 위치 | [docs/calibration-notes.md](docs/calibration-notes.md) |
| 원문 아카이브 | [docs/references/](docs/references/) |

기여자가 어기면 안 되는 것은 [CLAUDE.md](CLAUDE.md)에 있다. 한 규칙에 소유자는 하나다.

## 개발

```
node tests/verify-boundaries.mjs --sandbox <dir>
```

실제 ESLint로 4개 스택 전부에 위반 3건과 **대조군 2건**을 돌린다.
대조군이 핵심이다 — 부정 픽스처만으로는 올바른 config와 모든 import를 차단하는 config를
구분하지 못한다. 둘 다 위반 3/3을 잡는다.

이 테스트가 통과하지 않은 스택의 경계 규칙 수는 보고하지 않는다.
