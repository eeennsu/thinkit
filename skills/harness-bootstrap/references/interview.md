# 인터뷰

일곱 개 질문. 각각이 여기 있는 이유는 그 답을 레포를 읽어서 찾을 수 없기 때문이다 —
마지막 두 개는, 레포가 보여주는 것이 과거에 대한 서술일 뿐이고 앞으로의 규칙으로
받아들일지 말지는 소유자가 정해야 하기 때문이다. 필터는 그것 하나뿐이다.

각 항목은 `axis`를 지닌다. `principle` 질문은 모든 세대에서 묻는다. `calibrated` 질문은
`calibration/`의 값 때문에 존재하고, 그 값이 움직이면 탈락한다.

답은 JSON 파일에 쓰고 `scaffold.mjs --answers`로 넘긴다. 아래 각 항목이 자기가 읽히는
키를 지목한다. 목록형은 항목당 문자열 하나씩 받고, 키를 빼는 것은 비워서 답하는 것과
같다.

```json
{
  "projectName": "…", "oneLine": "…",
  "severity": "error", "greenfield": false,
  "safetyBoundaries": [], "verification": [], "exceptions": [],
  "publicApi": "enforced", "sliceCoupling": "isolated"
}
```

`severity`는 Q4의 답이고 `error`, `warn`, `off`를 받는다. `greenfield`는 그 기본값만
정하고(`false` → `warn`) `severity`가 주어지면 무시된다. 모르는 severity는 실행을 멈춘다.
그 값은 생성된 규칙에 그대로 쓰이고, 거기서 eslint가 설정 오류로 거부해 린트 실행 전체가
멈춘다 — 레포 소유자가 쓰지 않은 파일에서.

마지막 두 개는 `modules/fsd/layers.json`이 `variants` 아래 선언한 값 중 하나를 받는다.
모르는 값은 실행을 멈추고, 대체 기본값은 없다. 오타가 조용히 엄격한 설정을 만들어내면
그것이 레포의 답으로 보고되기 때문이다.

---

## Q1 — 이 레포는 무엇을 위한 것인가? 한 줄로.

```yaml
id: Q1
axis: principle
writes: CLAUDE.md 첫 줄
```

README가 있어도 묻는다 — 먼저 읽고, 그 첫 줄을 되돌려 주며 확인받는 쪽으로 한다. 맨입으로
묻지 않는다.

답이 비면: 자리표시자를 남기고 보고서에 그렇게 적는다. 파일 목록에서 설명을 지어내지
않는다.

---

## Q2 — 여기서 레포 밖으로 나가거나 되돌릴 수 없게 실패하는 것이 있는가?

스토어 배포, 결제, 개인정보, 서명키나 인증서, 프로덕션 데이터베이스, 돈을 쓰는 모든 것.

```yaml
id: Q2
axis: principle
key: safetyBoundaries
writes: "## 안전 경계" (비어 있지 않을 때만)
```

전체 방향은 제약을 줄이는 쪽이다. 이것이 그 예외이고, 어느 영역이 해당하는지는 모델이
아니라 레포의 속성이다. 목록을 실어 나르지 말고 묻는다.

답이 비면: **안전 경계 섹션을 쓰지 않는다.** 지어낸 경계는 자기를 멈춰 세우려던 섹션을
읽는 이가 훑고 지나가도록 가르친다.

항목마다 금지와 함께 승인 경로도 받아 적는다. 빠져나갈 길이 없는 규칙은 처음 틀렸을 때
우회당한다.

---

## Q3 — 이 레포에서, 검증에 관해 모델이 스스로 알아낼 수 없는 것은 무엇인가?

실마리: 떠 있어야 하는 기기나 시뮬레이터, 먼저 돌아야 하는 네이티브 빌드, 건너뛰면 안 되는
게이트, 로컬에서 아예 돌릴 수 없는 것, 초록불이 보이는 것과 다른 뜻인 스위트.

```yaml
id: Q3
axis: calibrated
key: verification
calibrated_by: model_defaults.self_verification
on_value:
  "on": ask          # 모델이 이미 검증한다. 레포 고유 사실만 적을 값어치가 있다
  "off": drop        # 자기 검증을 하지 않는 세대에는 이 질문을 넓힐 게 아니라 다른 질문이 필요하다
writes: .claude/skills/verification/SKILL.md (비어 있지 않을 때만)
```

이 질문은 오직 현재 캘리브레이션이 모델은 시키지 않아도 자기 작업을 검증한다고 말하기
때문에 존재한다. 그래서 "작업을 검증하라"는 이미 덮여 있고, 적어두면 토큰을 두 번 쓴다.
남는 것은 레포가 알고 모델은 모르는 것이다.

답이 비면: **검증 스킬을 만들지 않는다.** 새 레포에서는 이것이 기본 결과이고 옳다.

스택 오버레이가 이 질문에 맥락을 더할 수 있다. 오버레이 경로는 확정된 스택 프로필의
`questions` 필드다 — 그 필드가 없는 스택은 오버레이가 없고, 관례로 파일을 찾아보는 일은
없다. 선언됐는데 없는 경로는 "오버레이 없음"으로 읽지 않고 실행을 멈춘다.
`tests/verify-profiles.mjs`가 양방향을 다 붙들고 있어서, 아무도 선언하지 않은 오버레이는
조용히 안 묻게 된 질문 집합이 아니라 실패하는 테스트가 된다.

오버레이는 질문이 살아 있는 동안에만 적용된다. 탈락한 질문을 되살려서는 안 된다.

---

## Q4 — 새 경계 규칙은 error로 시작할까, warning으로 시작할까?

```yaml
id: Q4
axis: principle
key: severity
values: [error, warn, off]
writes: eslint.config.boundaries.mjs의 경계 규칙 두 개의 severity
default: 빈 레포면 error, 코드가 이미 있으면 warn
```

세대 질문도 취향 질문도 아니다. 기존 코드베이스에서 `error`는 첫 실행을 익사시키고 규칙은
꺼지며, 그러면 아무것도 강제하지 않는다. 기본값은 레포를 읽어서 정하고, 그다음 확인받는다.

---

## Q5 — 레포가 이미 자기 규칙을 어기는 곳은 어디이고, 새 코드도 면제해야 하는가?

```yaml
id: Q5
axis: principle
key: exceptions
writes: .claude/references/architecture.md (예외), 비어 있지 않을 때만
```

코드가 이미 있는 레포에서만 뜻이 있다. 위반을 기록해 두면 읽는 쪽 — 사람이든 모델이든 —
이 레거시를 공부하고 그것을 관례로 결론짓는 일을 막는다.

답이 비면: **architecture.md를 쓰지 않는다.** 의존 방향은 이미 린터가 강제하고 레이어
목록은 파일 시스템에 보인다. 기록할 예외가 없으면 그 파일은 이미 구할 수 있는 것 말고는
아무것도 담지 않는다.

---

## Q6 — 슬라이스는 index로만 닿을 수 있는가, 아니면 호출자가 그 안의 파일을 직접 import하는가?

```yaml
id: Q6
axis: principle
key: publicApi
values: [enforced, open]
writes: 경계 정책이 index.*를 겨냥하는지 여부 (eslint.config.boundaries.mjs)
default: 레포를 읽고, 그다음 확인받는다
```

Q4와 같은 방식으로 먼저 읽는다. 슬라이스 루트에 앉은 `index.*` 파일 수와 그것을 지나쳐
들어가는 import 수를 센다.

```
index가 있는 슬라이스 루트   find <fsdRoot>/{entities,features,widgets} -maxdepth 2 -name 'index.*'
안으로 들어가는 import       grep -roE "from '@(entities|features|widgets)/[^']+/[^']+'"
```

슬라이스 루트 index 파일이 하나도 없고 깊은 import가 수백 개인 레포는 이미 `open`으로
답한 것이다. 그것을 제시하고 확인받는다. 거기서 `enforced`로 답하는 것은 설정이 아니라
마이그레이션이다 — 그렇게 말하고, 소유자가 의도적으로 고르게 한다.

취향 질문이 아니다. public API 없이 지어진 레포에서 `enforced`는 기존 import를 전부
보고하고, 코드 전체에 걸리는 규칙은 그날 안에 누군가 끄는 규칙이다.

---

## Q7 — 슬라이스가 같은 레이어의 형제 슬라이스를 import해도 되는가?

```yaml
id: Q7
axis: principle
key: sliceCoupling
values: [isolated, same-layer]
writes: 슬라이스가 있는 레이어마다 자기 허용 정책을 받는지 여부 (eslint.config.boundaries.mjs)
default: 레포를 읽고, 그다음 확인받는다
```

같은 방식으로 읽는다. `features/` 아래 파일 중 몇 개가 `@features/`를 import하는지. 그것이
흔한 레포는 `same-layer`로 답한 것이다.

두 답이 같은 방향을 가리켜도 Q6와 따로 묻는다. 독립된 축이고 — 레포가 public API를
유지하면서 형제끼리 말하게 둘 수도 있다 — 하나로 묶어 물으면 느슨한 쪽 답이 우연히
도착한다.

둘이 어느 쪽으로 가든 레이어 방향은 살아남는다. `entities`가 `features`를 import하는 것은
모든 조합에서 보고된다. 그것이 바닥이고, 선택지로 제시되지 않는다.

---

## 묻지 않고 읽는 것

키 두 개가 더 `scaffold.mjs`에 닿지만 둘 다 질문이 아니다. repo-visible이다 — 읽고, 묻지
않는다.

| 키 | 읽는 곳 | 없으면 |
| --- | --- | --- |
| `routingRoot` | 라우트나 네비게이터가 등록되는 디렉터리 | `profile.routingRoot` |
| `routingImports` | 그 파일들이 이미 import하는 레이어 | `layers.json`의 `routing.mayImport` |

`routingRoot`는 `fsdRoot` 안에 있을 수도(`src/navigators/`) 옆에 있을 수도(`app/`) 있다.
둘 다 된다. 라우팅 요소가 레이어보다 먼저 등록되므로 `fsdRoot` 안에 있어도 라우팅으로
매칭된다.

---

## 묻지 않는 것

| 묻지 않는 것 | 이유 |
| --- | --- |
| 어떤 아키텍처 | 스택 프로필이 정한다. 네 스택 전부 FSD. Q6과 Q7은 적용 여부가 아니라 얼마나 조이는지를 정한다 |
| 타입 엄격도, 포매팅 | 고정 기본값, 설정으로 강제. 취향은 정해주면 값이 안 들고 열어두면 논쟁 값이 든다 |
| 패키지 매니저, 테스트 러너, 모노레포 | 탐지 가능 |
| 프레임워크, 언어 | 탐지 가능 |
| "gotcha가 뭐죠?" | 새 레포엔 없다. 물으면 지어낸 것이 나오고, 틀린 gotcha는 없는 것보다 나쁘다. 섹션은 일부러 비워서 나간다 |
