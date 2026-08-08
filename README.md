# thinkit

레포의 하네스 — `CLAUDE.md`, 스킬, 레퍼런스, 린트 경계 — 를 세팅하고 같은 기준으로 계속 감사하는 Claude Code 플러그인.

**하네스를 대신 써주는 도구가 아니라, 계속 얇게 유지시켜주는 도구다.** 완성된 규칙 문장이
아니라 질문 세트와 판정 기준을 실어 나른다. 무엇을 왜 묻는지, 답이 비면 어떻게 되는지는
[thinkit.eunsu.pro](https://thinkit.eunsu.pro/#무엇을-묻나)에 있다.

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

둘은 **같은 판정 기준을 시점만 다르게** 적용한다. 기준은 `principles/rules.json` 한 파일에
살아서, 부트스트랩이 통과시킨 것을 감사가 잡아내는 일은 생기지 않는다. 스택은 플러그인이
아니라 인자다.

## 아키텍처는 슬롯이다

레포의 경계 규약은 `modules/<name>/`이 소유하고 인터뷰의 첫 질문이 고른다. 스택 프로필이
지목하는 모듈은 확인받으러 들고 가는 제안이지 답이 아니다.

```
fsd     레이어 방향, 슬라이스 격리, 슬라이스 public API를 린트 규칙으로 강제
none    경계 규약을 도구가 판정하지 않는다
```

`none`을 고르면 경계 설정과 레이어 디렉터리와 경계 플러그인 의존성이 빠지고, 산문·포매터·
tsconfig·심어진 체커는 그대로 나간다. 보고서는 강제되는 경계를 0으로 세면서 그것이 구멍이
아니라 답이라고 적는다. 우리가 모델링하지 않은 자기 규약을 가진 레포도 여기 해당한다 —
틀린 그래프는 없는 그래프보다 나쁘다.

## 요구사항

Node 18.18+ (ESLint 9의 요구). `package.json`은 없으면 만들고, 있으면 스크립트 두어 개와
빠진 devDependency만 더한다 — **들여쓰기와 키 순서는 그 레포 것을 그대로 두고**, 이미 있는
`lint`·`format` 스크립트나 버전 핀은 덮지 않는다. RN 계열은 프레임워크가 제공하는 babel
프리셋이 설치돼 있어야 한다. 없으면 조용히 통과하지 않고 `MODULE_NOT_FOUND`로 크래시한다.
그게 옳은 실패 모드다.

## 개발

```
node tests/verify-profiles.mjs                        설치 불필요
node tests/verify-scaffold.mjs                        설치 불필요
node tests/verify-brownfield.mjs                      설치 불필요
node tests/verify-harness-surface.mjs                 설치 불필요
node tests/verify-harness-surface.mjs --self-test     설치 불필요
node tests/verify-boundaries.mjs   --sandbox <dir>
node tests/verify-rules.mjs        --sandbox <dir>
node tests/verify-import-order.mjs --sandbox <dir>
```

앞의 셋은 아무것도 설치하지 않고 돈다. 나머지 셋은 실제 ESLint와 Prettier로 돌고, 위반
픽스처만으로는 올바른 config와 모든 것을 차단하는 config를 구분하지 못하므로 **대조군**이
함께 들어간다. 각 테스트가 무엇을 증명하고 왜 그 형태인지는
[docs/design-log.md](docs/design-log.md)에 있다.

**이 테스트들이 통과하지 않은 스택의 규칙 수는 보고하지 않는다.**

## 더 읽을 것

|                           |                                                          |
| ------------------------- | -------------------------------------------------------- |
| 컨텍스트 엔지니어링       | [docs/canon.md](docs/canon.md)                           |
| 하네스 파일 배치 패턴     | [docs/structure-patterns.md](docs/structure-patterns.md) |
| 무엇을 왜 그렇게 정했는지 | [docs/design-log.md](docs/design-log.md)                 |
| 세대 의존 값의 위치       | [docs/calibration-notes.md](docs/calibration-notes.md)   |
| 원문 아카이브             | [docs/references/](docs/references/)                     |

기여자가 어기면 안 되는 것은 [CLAUDE.md](CLAUDE.md)에 있다. 한 규칙에 소유자는 하나다.
