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

`.claude/harness/manifest.json`에 버전과 파일별 콘텐츠 해시를 기록한다. audit은 다섯 상태로 보고한다:

- `current`
- `outdated` → 재생성 제안
- `edited-locally` → 수동 병합 안내. **절대 자동으로 덮지 않는다**
- `missing`
- `unreadable` → 매니페스트 자체가 깨졌다. 심은 것의 기록이 없으므로 아무것도 수리하지 않는다

기록되는 버전은 `rules.json`의 버전 번호가 **아니라 심는 내용 전체의 해시**다
(`{rules 버전}-{해시}`). 심는 것의 절반은 `check.mjs`이고, 그 동작은 룰셋이 소유한
번호로 서술되지 않는다. 번호에만 걸어두면 **체커를 고칠 때마다 이미 옛날 사본을 든 레포에
`current`로 나간다.** 실제로 그랬다.

`outdated`는 플러그인 사본만 내릴 수 있는 판정이다 — 심은 사본에는 비교할 정본이 없다.
심은 사본은 `current`로 보고하되 "여기서는 노후 여부를 알 수 없다"를 함께 적는다.
모르는 것을 안심시키는 쪽으로 답하지 않는다.

## 인터뷰 질문 (파일 시스템에서 알 수 없는 것만)

| # | 답 키 | 질문 | 답이 비면 |
| --- | --- | --- | --- |
| Q1 | `projectName`·`oneLine` | 이 레포는 뭘 하는 것인가? 한 줄로 | README/package.json에 있으면 확인만 |
| Q2 | `safetyBoundaries` | 코드가 레포 바깥으로 나가는 지점이 있나? (스토어, 결제, 개인정보, 서명키, 프로덕션 DB) | Safety Boundaries 섹션을 **만들지 않는다** |
| Q3 | `verification` | 검증에서 모델이 스스로 알아낼 수 없는 것이 있나? | verification Skill을 **만들지 않는다** ← 기본 |
| Q4 | `severity` | 경계 규칙을 `error`로 막을까 `warn`으로 시작할까 | 제로베이스 error, 기존 코드 warn |
| Q5 | `exceptions` | (audit 전용) 규칙을 어기는데 당장 못 고치는 곳이 있나? | `architecture.md`를 **만들지 않는다** |
| Q6 | `publicApi` | 슬라이스는 index로만 닿나? | 레포를 읽어 제안하고 확인받는다 |
| Q7 | `sliceCoupling` | 형제 슬라이스끼리 import해도 되나? | 레포를 읽어 제안하고 확인받는다 |

원래 다섯이었고 레이어 그래프에 변형 축이 생기면서 일곱이 됐다. 답 키를 표에 넣은 것은
Q4 때문이다 — 이 질문만 `key:`가 적혀 있지 않아서, **답을 받아도 어느 키에 쓰는지 문서 어디에도
없었다.** 스택 오버레이(`questions.json`)는 프로필의 `questions` 필드가 가리키며,
선언과 실재는 `tests/verify-profiles.mjs`가 양방향으로 잡는다.

묻지 않는 것: FSD 여부, TS strict, prettier 취향, 패키지 매니저, 모노레포 여부(전부 탐지 또는 기본값).
**Gotcha는 묻지 않는다** — 제로베이스엔 없다. 빈 섹션으로 출고한다.

## 검증 상태 (2026-08-01)

```
node tests/verify-profiles.mjs                       설치 불필요. 프로필 약속 + 드리프트 16항목
node tests/verify-scaffold.mjs                       설치 불필요. 잘못된 입력 60항목
node scripts/scaffold.mjs <stack> --target <dir>     4스택 전부 통과
  --answers 있음                                     Q2·Q3·Q5 조건부 산출물 생성 확인
  --answers 없음                                     같은 산출물이 생기지 않음을 확인
node scripts/check.mjs --mode full --target <dir>    machine/judgement 분리 동작
node scripts/check.mjs --fix                         3종 수리, edited-locally 미변경 확인
node scripts/report.mjs <stack> --target <dir>       harness:check pass
node tests/verify-boundaries.mjs --sandbox <dir>     16/16 (4스택 x 변형 4쌍), 대조군에 .ts 포함
node tests/verify-rules.mjs --sandbox <dir>          6/6 (발화 4 + 대조군 2)
node tests/verify-import-order.mjs --sandbox <dir>   2스택, 레이어 순서 + side-effect 배리어
```

마지막 두 줄이 나머지의 전제다. **두 테스트가 확인하지 않은 스택의 규칙 수는 보고하지 않는다.**
샌드박스에는 eslint 툴체인, RN 프리셋(`@react-native/babel-preset`, `babel-preset-expo`),
그리고 `typescript-eslint` · `typescript` · `eslint-plugin-react-hooks`가 설치돼 있어야 한다.
셋 중 하나만 없어도 config가 로드 전에 죽어 **모든 케이스가 엉뚱한 이유로 실패한다** —
그래서 두 테스트 다 시작 전에 존재를 확인하고 이름을 찍는다.

조건부 산출물은 **양방향으로** 확인해야 한다. 답이 있을 때 생기는 것만 보면,
답이 없을 때도 생기는 회귀를 놓친다 — 그 회귀가 바로 이 플러그인이 하지 않겠다고 한 일이다.

## 린트 config를 두 파일로 쪼갠 이유 (2026-08-01)

계기는 실제로 굴러가는 RN 레포의 eslint config였다. 관심사가 다섯이었고 —
recommended 세트, TS 파서, prettier, RN 규칙, 프로젝트 규칙 — **경계 정책이 들어갈 자리가
없었다.** 우리는 그때까지 `eslint.config.mjs`라는 파일명 하나를 통째로 요구하고 있었다.

`putOwned`의 세 상태에서 이건 조용한 고장이다. 레포가 규칙 한 줄을 더하면 그 파일은
`edited-locally`가 되고, 그 뒤로 **레이어 그래프가 바뀌어도 경계 정책이 재생성되지 않는다.**
헤더 주석은 "boundaries 블록을 손대지 마라"라고 적혀 있었지만 실제로 잠기는 건 파일 전체였다.
주석이 약속한 범위와 코드가 잠그는 범위가 달랐다.

| 파일 | 소유자 | 재생성 |
| --- | --- | --- |
| `eslint.config.boundaries.mjs` | 플러그인 | 매번 |
| `eslint.config.mjs` | 레포 | 손대기 전까지만 |

실측 (react, publicApi=open으로 재부트스트랩):

```
edited-locally, left alone eslint.config.mjs        <- 레포가 추가한 줄 보존
written                    eslint.config.boundaries.mjs   <- fileInternalPath 10 -> 0
```

이게 이 분리가 사는 이유 전부다. 쪼개기 전이면 두 번째 줄이 일어나지 않는다.

## 경계 밖 규칙 네 개 (2026-08-01)

같은 config에서 가져온 것. 판정 기준은 **"안 넣으면 CLAUDE.md에 문장으로 남는가"** 하나다.

| 규칙 | 왜 |
| --- | --- |
| `react-hooks/rules-of-hooks` `exhaustive-deps` | 조건부 훅과 낡은 의존성 배열은 작동하는 코드처럼 읽힌다 |
| `no-console` | 남겨진 디버그 출력은 그걸 남긴 이유보다 오래 산다. `warn` — CLI 진입점엔 정당한 용도가 있다 |
| `@typescript-eslint/no-unused-vars` + `^_` | `^_`가 핵심이다. 예외를 말할 방법이 없는 규칙은 처음 불편할 때 통째로 꺼진다 |

**넣지 않은 것과 그 이유**가 목록만큼 중요하다. `eslint:recommended`와
`@typescript-eslint/recommended`는 뺐다 — 프리셋은 마이너 범프에서 자라고, 아무도
동의한 적 없는 규칙은 급할 때 꺼지면서 **잘 돌던 규칙까지 데려간다.** 규칙은 하나씩 이름을 적는다.
`no-explicit-any`는 레포의 답이지 기본값이 아니다. prettier 계열은 이미 `prettier.config.mjs`가
소유한다. RN 전용 규칙(`no-color-literals` 등)은 4스택 공통이 아니라 뺐다.

### TS 파서가 없었다

`typescript-eslint`는 장식이 아니라 구멍 메우기였다. 생성되는 config는 줄곧
`files: ['**/*.{ts,tsx,js,jsx}']`라고 주장하면서 **파서를 한 번도 설정하지 않았다.**
`verify-boundaries.mjs`의 픽스처가 전부 `.js`라서 16개 케이스가 전부 통과하는 동안
아무도 몰랐다. 실제 레포에서 `eslint .`는 첫 타입 주석에서 죽는다.

→ 대조군에 `.ts` 파일 하나를 넣었다. 파서가 없으면 parsing error 메시지가 뜨고,
대조군은 메시지가 하나라도 있으면 실패하므로 같은 방식으로 잡힌다.

`tseslint.configs.base`는 **배열이 아니라 config 객체 하나**다 (`recommended`는 배열).
spread하면 `TypeError: tseslint.configs.base is not iterable`로 죽는다.

### devDependencies는 이제 덮어쓰지 않는다

`scaffold.mjs`가 `...profile.devDependencies`로 병합하고 있어서, 레포가 고정해둔 버전을
우리 범위로 **덮어썼다.** 리졸버 항목만 기존 값을 보존하고 나머지는 아니었다 — 일관성도 없었다.
없는 이름만 추가하도록 고쳤다. RN이 자기 typescript를 고정하는 것처럼, 고정에는 대개 이유가 있다.

이걸 고치고 나서야 `typescript`를 devDependencies에 넣을 수 있었다. `@typescript-eslint`의
파서는 `typescript` 패키지를 런타임에 요구하므로 없으면 파서 설정이 무의미하다. 덮어쓰기가
살아 있는 동안에는 넣는 순간 RN/Expo가 고정한 버전을 우리 범위로 밀어냈을 것이다 —
babel 프리셋을 고정하지 않는 것과 같은 이유로 넣을 수 없던 항목이, 병합 규칙이 바뀌자 넣을 수 있게 됐다.

## 심는 파일의 단일 소유권

`scripts/lib/planted.mjs`가 심을 파일의 목록과 내용을 모두 가진다. `scaffold.mjs`는 부트스트랩 때
쓰고 `check.mjs --fix`는 낡은 것을 갱신하는데, 둘이 각자 목록을 만들면 갈라진다.
**플러그인과 어긋난 planted 파일은 이 플러그인이 남의 레포에서 잡아내는 바로 그 결함이다.**

`--fix`가 고치는 것은 전부 가산적이다 — 없는 제목, 등록 안 된 스크립트, 심은 그대로인 낡은 파일.
`edited-locally`는 건드리지 않고, 산문은 절대 고치지 않는다.
planted 사본은 정본 내용을 갖고 있지 않으므로 스스로 갱신하지 않고 재부트스트랩을 안내한다.

## 조용한 경로를 닫았다 (2026-08-01)

한 자리에서 나온 결함이 아니라 **한 종류**의 결함이었다. 전부 "틀린 답을 조용히 낸다"였고,
레포에 관한 진실을 보고하는 게 일인 도구에서 그건 크래시보다 나쁘다. 크래시는 보인다.

| 조용했던 것 | 실제 결과 |
| --- | --- |
| `--answers` 경로가 없으면 `{}`로 진행 | 인터뷰 전체가 버려지고, 엄격 기본값이 **레포의 답으로** 보고된다 |
| `severity` 오타 검증 없음 | eslint가 config 오류로 린트 전체를 멈춘다. 레포 소유자가 쓰지 않은 파일에서 |
| `report.mjs`가 `existsSync`로 prettier를 셈 | 남의 포매터 설정을 우리 것으로 세고, 있지도 않은 import 순서를 "강제됨"으로 출력 |
| 심은 `check.mjs`의 기본 모드가 `full` | `ERR_MODULE_NOT_FOUND`. 손으로 돌릴 가능성이 가장 큰 사본에서 |
| 매니페스트 버전이 룰셋 번호 | 체커를 고쳐도 옛 사본을 든 레포에 `current`로 나간다 |
| `machine` 규칙에 구현이 없으면 skip | 안 돈 검사와 통과한 검사가 구별되지 않는다. **이 플러그인이 남의 레포에서 잡는 그 결함** |
| `--fix`가 매니페스트 없이 `harness:check` 등록 | 없는 파일을 가리키는 스크립트를 만든다. 수리가 상태를 악화시킨다 |
| `--fix`가 `package.json`을 2칸으로 재포맷 | 키 하나 더하려고 남의 파일 전 줄을 diff에 올린다 |
| `tsconfig.json`을 `JSON.parse`로 직접 | 주석 하나에 보고서 전체가 죽는다. 진짜 tsconfig는 JSONC다 |
| 두 번째 실행이 자기가 쓴 tsconfig를 되읽음 | 우리가 만든 alias 표가 "레포가 원래 갖고 있던 표"로 보고되고, **같은 입력에 다른 매니페스트가 나온다** |
| 리스트 답을 문자열로 주면 `.length`가 3 | 답 세 개로 읽히고 `.map`에서 죽는다 — 파일이 이미 쓰인 뒤에 |
| `oneLine`을 객체로 주면 검증 없음 | `[object Object]`가 남의 CLAUDE.md 첫 줄로 **출고된다** |
| `routingRoot: "./app"` 통과 | 엘리먼트 패턴이 아무것도 매치 못 함. 정책은 생성되고 강제는 0건 |
| `routingRoot: "."` 통과 | 레포 루트가 라우팅 엘리먼트로 등록돼 뒤따르는 레이어를 삼킨다 |
| 하드코딩된 스택 목록 3곳 | 새 스택이 명령어 힌트에 없으면 **아무에게도 제안되지 않는다** |
| 오버레이가 없는 질문(Q8)을 가리켜도 무반응 | `questions` 필드와 같은 죽은 참조, 한 단계 아래에서 |

마지막 줄은 읽어서 찾은 게 아니라 `verify-scaffold`의 멱등성 검사가 잡았다. 그래서 두 테스트를
먼저 만들었다 — 설치가 필요 없어서 **항상 돌 수 있는** 테스트다. `verify-boundaries`류는
샌드박스가 있어야 돌고, 그래서 안 돌 때가 있고, 안 도는 테스트는 없는 테스트다.

소유권 판정은 한 곳으로 모았다. `ownedUnchanged()`는 "매니페스트에 기록됐고 아직 바이트가 같은
파일"을 돌려주고, prettier 카운트와 alias 읽기가 같은 답을 쓴다. **기록됨**과 **기록됐고 그대로임**은
다른 것이다 — 레포가 고친 config는 누가 만들었든 이제 그 레포의 답이다.

`format` 스크립트를 등록하는 이유도 같은 원칙이다. 생성된 import 순서를 "도구가 강제하는 규칙"으로
세면서 그 도구를 부르는 명령이 없으면, 그 숫자는 측정이 아니라 주장이다.

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

## 브라운필드에서 처음 돌려보고 고친 것

기존 하네스가 있는 실제 레포(Next 16, bun, 자체 `eslint.config.js`·`.prettierrc`,
`CLAUDE.md`가 `@AGENTS.md` 한 줄)에 처음 설치해봤다. 그린필드 픽스처가 만들 수 없는
실패 네 개가 나왔고, 전부 **읽기와 주장** 쪽이었지 생성 쪽이 아니었다.

**tsconfig를 두 스크립트가 서로 다른 이유로 못 읽었다.** `report.mjs`의 블록 주석 정규식은
`"@app/*": ["src/app/*"]`의 `/*`에서 매칭을 시작해 paths 블록을 먹었고, `alias.mjs`는 줄 주석만
벗겨서 `/* Bundler mode */` 배너에 죽었다. 둘 다 **정상적인** tsconfig에서 실패한 것이다 —
alias glob은 예외가 아니라 표준 형태다. 문자열 상태를 추적하는 스캐너를 `lib/jsonc.mjs`에 두고
양쪽이 같은 것을 쓴다. 결과: strict 플래그 `0 → 5`, alias `1 → 5`.

`path consistency 1`은 더 나빴다. 프로필 기본 alias를 세고 있었는데, 레포의 tsconfig는
`exists, left alone`이라 그 테이블은 **어디에도 쓰이지 않았다.** 존재하지 않는 파일을 세고 있었다.

**소유권과 강제력은 다른 축이다.** `putOwned`는 정확한 경로로 소유를 정하고, 도구는 **파일명
패밀리 위의 우선순위**로 효력을 정한다. ESLint는 `eslint.config.js`를 찾으면 `.mjs`를 보지 않고,
Prettier는 `.prettierrc`를 `prettier.config.mjs`보다 앞에 둔다. 그래서 두 문장이 동시에 참이었다 —
생성된 파일은 우리 것이고, 아무것도 그것을 로드하지 않는다. `report.mjs`는 앞의 사실만 보고
`total 25`를 출력했다. 실측은 `--print-config` 기준 boundaries 규칙 **0개**.

`lib/precedence.mjs`가 각 도구의 공표된 해석 순서를 들고 있고, 가려진 줄은 `generated but
shadowed`로 표시된 뒤 합계에서 빠진다. 같은 레포에서 `25 → 10`. **"이 경로가 비어 있다"는
"이 관심사를 아무도 소유하지 않는다"가 아니다.**

**CLAUDE.md가 `@AGENTS.md` 한 줄이면 audit이 아무것도 못 봤다.** 3토큰으로 측정하고, 산문을 읽는
규칙 전부가 산문이 없는 파일 위에서 돌아 아무것도 보고하지 않았다. import를 따라가게 하니
1356토큰이 되고 `directory tree in a fenced block`이 떴다 — 이 플러그인이 잡으라고 존재하는
바로 그 위반이 그때까지 안 보이고 있었다. `--fix`는 여전히 원본에 append한다. 확장본에 붙이면
import한 파일을 importer 안으로 인라인해놓고 수리라고 부르게 된다.

**프로필의 resolver 핀이 죽어 있었다.** `{...profile.devDependencies, [resolver.devDependency]: "*"}`에서
계산된 키가 뒤에 와서 `^4`를 `*`로 덮었다. 생성된 config가 아예 해석되느냐를 결정하는 그 의존성만
핀이 없었다. 순서를 뒤집었다.

테스트는 `tests/verify-brownfield.mjs`. 샌드박스가 필요 없다 — 검증 대상이 생성된 규칙이 무엇을
잡느냐가 아니라 **스크립트가 무엇을 읽고 무엇을 주장하느냐**이기 때문이다. 여기 있는 케이스는
전부 실제 레포에서 먼저 관측된 뒤에 적혔다.

**인터뷰 답이 갈 곳 없이 버려지고, 그 자리에 거짓 에러가 남았다.** CLAUDE.md가 이미 있는 레포에서
Q2의 안전 경계는 쓰일 자리가 없다 — 그 섹션이 사는 파일이 정확히 그 CLAUDE.md다. 그런데 매니페스트에는
`declared: true`가 기록됐고, 이후 모든 `harness:check`가 `"declared at setup but the section is gone"`을
`error`로 뱉었다. 사라진 게 아니라 **쓰인 적이 없다.** 영구히 실패하는 체크에 틀린 문장이 붙은 것이다.

이제 `declared`는 **답이 있고 그 파일을 우리가 썼을 때만** 참이다. 로컬에서 수정된 파일은 여전히 참으로
남는다 — 우리가 쓴 섹션을 레포가 지운 경우가 이 규칙이 존재하는 이유고, 그건 계속 잡아야 한다.

버려졌다는 사실 자체도 출력한다. `written` 목록의 `CLAUDE.md: exists, left alone`은 대개 무해한
결과라서, 답 하나가 증발했다는 신호로는 읽히지 않는다. 이 실행에서 레포 주인이 손대야 하는 유일한
항목이므로 요약에 `note`로 올린다.
