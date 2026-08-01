# Structure Patterns

2차 소스가 제안하는 **파일 배치 패턴**. 원칙이 아니라 구조다.

| 약칭 | 문서 | 권위 |
| --- | --- | --- |
| **[V]** | [Claude 5 시대의 Context Engineering: CLAUDE.md부터 Skills까지](references/03-velog-claude-5-context-engineering-ko.md) — 이경규, velog | **2차. 참고용.** |
| **[NR]** | [The new rules of context engineering for Claude 5 generation models](references/01-new-rules-of-context-engineering-claude-5.md) | 1차 (정본) |
| **[ECE]** | [Effective context engineering for AI agents](references/02-effective-context-engineering-for-ai-agents.md) | 1차 (정본) |
| **[P5]** | [Prompting Claude Opus 5](references/04-prompting-claude-opus-5.md) | 1차 (정본) |

> **읽는 법.** 이 문서의 구조 제안은 [V]에서 왔고, [V]는 1차가 아니다. 정본과 어긋나면 정본이 이긴다. 어디까지가 [V]의 창작인지는 [§8 출처 분리 표](#8-출처-분리--1차와-2차의-차이)에 정리했다. 원칙 자체는 [principles.md](principles.md)를 본다.
>
> [V]의 예시는 전부 Swift/iOS 기준이었다. 여기서는 전부 걷어내고 언어 중립 형태로 옮겼다. `Sources/`, `Tests/`, `AppErrorMapper`, `DesignSystem` 같은 원문의 구체 명칭은 자리표시자로 바꿨다.

---

## 1. CLAUDE.md를 Router로 본다

[V]의 중심 주장이다.

> CLAUDE.md 자체가 문서 저장소가 아니라 **Context Navigation Map** 역할을 한다. [V §9]

CLAUDE.md에 모든 내용을 넣지 않고 **어디에 무엇이 있는지**를 알려준다. Claude는 필요한 순간에 아래로 내려간다:

```
CLAUDE.md
   ↓
Skill
   ↓
Reference
   ↓
Code
```

각 계층의 성격 [V §8]:

```
CLAUDE.md   → 길잡이
Skill       → 작업 절차
Reference   → 상세 지식
Code        → 가장 정확한 실제 기준
```

Router 형태의 CLAUDE.md 골격 [V §9, §22 — 언어 중립화]:

```markdown
# <Project>

<한 줄로 이 레포가 뭔지>

## Architecture

Follow existing module boundaries and dependency direction.

Detailed reference:
- `@.claude/references/architecture.md`

## Working Rules

- Match surrounding code.
- Keep changes scoped to the task.
- Ask before adding dependencies.
- Do not edit generated code.

## Validation

Use the verification skill when behavior changes.

## Gotchas

- <코드만 봐서는 알 수 없는 사실 1>
- <코드만 봐서는 알 수 없는 사실 2>
```

**Router 관점의 대가.** [NR]은 CLAUDE.md에 대해 "레포를 짧게 서술하고 **토큰의 대부분은 gotcha에 쓰라**"고 말한다. [V]의 Router 프레이밍은 무게중심을 gotcha에서 네비게이션으로 옮긴다. 위 골격에서 Gotchas는 여러 섹션 중 하나로 밀려 있다. 이 긴장은 [§8 표](#8-출처-분리--1차와-2차의-차이) 항목 8에서 다룬다.

---

## 2. 디렉터리 배치

[V §8]이 제안하는 전체 배치 (언어 중립화):

```
Project/
├── CLAUDE.md
│
├── .claude/
│   ├── skills/
│   │   ├── verification/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   │       └── <runner-specific-notes>.md
│   │   │
│   │   ├── code-review/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   │       └── review-rubric.md
│   │   │
│   │   └── <task-name>/
│   │       ├── SKILL.md
│   │       └── references/
│   │           └── <detail>.md
│   │
│   └── references/
│       ├── architecture.md
│       ├── api-contract.md
│       └── design-system.md
│
└── <source tree>
```

두 종류의 `references/`가 있다는 점이 이 배치의 핵심이다:

| 위치 | 범위 | 언제 읽히나 |
| --- | --- | --- |
| `.claude/skills/<name>/references/` | 그 Skill 전용 | 해당 Skill이 로드되고, 그 안에서 더 깊이 들어갈 때 |
| `.claude/references/` | 레포 전역 | CLAUDE.md나 Skill이 `@` 멘션으로 가리킬 때 |

### SKILL.md의 모양

[V §10] (언어 중립화):

```markdown
---
name: verification
description: Use when code behavior changes and the implementation must be validated before completion.
---

# Verification

Determine the smallest relevant validation scope.

## Workflow

1. Identify changed behavior.
2. Find existing related tests.
3. Run the smallest relevant test set first.
4. Expand validation only when needed.
5. Report the exact commands executed.
6. Never report a test as passed unless it was executed successfully.

## Additional Reference

For runner-specific commands and environment issues:

- `references/<runner-specific-notes>.md`
```

[V]가 강조하는 지점: **여기에 테스트 러너 전체 설명을 넣지 않는다.** 필요할 때 `references/` 아래 파일을 읽게 한다. 이게 progressive disclosure다 [V §10].

같은 형태로 code-review Skill도 만든다. 리뷰 우선순위는 SKILL.md에 두고, 상세 rubric은 `references/review-rubric.md`로 내린다 [V §11].

> **[P5] 주의 — 리뷰 Skill에 범위 축소 지시를 쓰지 않는다.** `only report high-severity issues`나 `be conservative` 같은 문구를 쓰면 Claude Opus 5는 **문자 그대로 따라서 덜 보고한다.** 전부 보고하게 하고 **필터링은 별도 패스로 분리**하라는 것이 정본의 지시다 [P5]. 위 SKILL.md의 우선순위 목록(Correctness → Regression risk → …)은 *순서*를 주는 것이지 *컷오프*를 주는 것이 아니어야 한다. 이 구분이 무너지면 Skill이 리뷰 품질을 깎는다.
>
> 같은 절의 `Do not spend significant review effort on style that already matches surrounding code`는 반대로 안전하다. 무엇을 보고할지가 아니라 어디에 노력을 쓸지를 말하고, [NR]의 "주변 코드처럼 작성한다"와 같은 근거를 공유한다.

> **[V] 내부 불일치.** [V §10]·[V §11]은 Skill 상세 자료를 `<skill>/references/` 서브디렉터리에 두는데, [V §22]의 최종 제안 트리에서는 같은 파일이 `<skill>/` 바로 아래로 평탄화된다. 원문이 두 가지 배치를 모두 보여준다. 어느 쪽도 1차 소스가 규정한 것이 아니다 ([§8](#8-출처-분리--1차와-2차의-차이) 항목 11).

---

## 3. 마이그레이션 체크리스트

[V §20]. 이미 큰 컨텍스트 팩을 가진 레포를 정리하는 순서다. 다섯 개의 처분 바구니가 있다.

### 지운다

```
Claude가 코드만 봐도 알 수 있는 내용
일반적인 Clean Code 설명
너무 세세한 코딩 스타일 규칙
Tool 사용 예제 반복
서로 다른 파일에 중복된 규칙
오래된 개인 Memory
```

[P5]가 이 바구니에 **이름이 붙은 항목**을 추가한다. 위 여섯 개가 "이런 종류"였다면 아래는 지울 문장을 그대로 짚는다 [P5]:

```
"모든 비자명한 작업에 최종 검증 단계를 포함하라"
"서브에이전트를 써서 검증하라"
"답을 다시 확인하라" / "응답 전에 재검증하라"
"높은 심각도만 보고하라" / "보수적으로 판단하라"
"생각하지 마라" / "추론하지 마라"
```

앞의 네 줄은 모델이 어차피 하는 일이라 **겹치면 증폭**된다. 마지막 줄은 성격이 다르다 — thinking을 끄지 말라는 지시는 오히려 내부 태그 누출을 늘린다 [P5]. 근거는 [principles.md §5](principles.md).

**그리고 이 바구니에는 짝이 있다.** [P5]에 따르면 Opus 5의 기본값이 이동해서 **새로 써야 하는** 지시도 생겼다 — 응답 길이, 나레이션 케이던스, 문서 길이, 작업 범위, 서브에이전트 상한. 마이그레이션을 "지우기"로만 돌리면 이쪽을 놓친다 ([principles.md §5.2](principles.md)).

### CLAUDE.md에 남긴다

```
Repository 목적
중요한 Architecture 경계
코드에서 바로 알기 힘든 Gotcha
절대 건드리면 안 되는 영역
Skill과 Reference 위치
```

### Skill로 옮긴다

```
Verification
Code Review
Release
Migration
Security Review
UI Validation
```

### Reference로 옮긴다

```
Architecture 상세 설명
API Contract
Design System
Migration Guide
제품 Spec
Rubric
```

### 가능하면 코드로 대체한다

```
긴 구현 설명      → 좋은 기존 구현 파일
API 사용 설명     → 실제 타입과 테스트
UI 설명           → HTML Artifact나 구현 Reference
Validation 설명   → 실행 가능한 Test Suite
```

이 다섯 번째 바구니가 [V]에서 가장 실질적인 부분이다. [NR]도 같은 방향을 말한다 — 코드로 된 파일이 모델이 잘 아는 언어로 고충실도 지시를 주고, HTML 목업이 디자인 설명이나 스크린샷보다 낫다 [NR].

### 판정 질문

[V §24]가 각 항목에 던지라고 하는 질문:

```
이 내용이 모든 작업에서 정말 필요한가?
Claude가 코드만 봐도 알 수 있지 않은가?
Skill로 필요할 때만 불러올 수 있지 않은가?
Reference나 실제 코드로 보여주는 편이 낫지 않은가?
같은 규칙을 다른 곳에서도 반복하고 있지 않은가?
```

[V §21]이 `/doctor` 점검 시 함께 보라고 하는 증상:

```
CLAUDE.md가 너무 긴가
Skill이 너무 많은 책임을 갖고 있는가
같은 규칙이 반복되는가
항상 필요하지 않은 내용이 기본 Context에 있는가
Claude의 판단을 지나치게 제한하고 있는가
```

---

## 4. 규칙의 소유 위치 매핑

[V §14]. 같은 규칙이 CLAUDE.md에도, SKILL.md에도, 에이전트 프롬프트에도 있을 이유가 없다. **규칙의 소유 위치를 하나로 만든다.**

```
Verification 행동      → verification Skill
Repository 금지 사항   → CLAUDE.md
Tool 사용법            → Tool description
현재 작업 요구사항     → User Prompt
```

표로 옮기면:

| 규칙의 종류 | 소유 위치 | 근거 |
| --- | --- | --- |
| 작업 절차 (검증, 리뷰, 릴리스) | 해당 Skill | [NR] — 검증·코드리뷰를 시스템 프롬프트에서 Skill로 분리 |
| 레포 고유의 금지·주의사항 | CLAUDE.md | [NR] — 토큰 대부분을 gotcha에 |
| 툴 사용법 | Tool description | [NR] — "Now: Simple tool descriptions" |
| 이번 요청에만 적용되는 요구 | User Prompt | [NR] — 프롬프트는 구체적, 컨텍스트는 일반적 |
| 상세 지식 (아키텍처, 계약, spec) | Reference 파일 | [NR] — `@` 멘션 레퍼런스 |

한 규칙이 두 칸에 들어가면 그건 충돌 후보다. [principles.md §3](principles.md)이 왜 그게 비용인지 다룬다.

---

## 5. 강한 제약을 유지해야 하는 영역

[V §16]. **모든 규칙을 지우라는 뜻이 아니다.** 잘못하면 큰 문제가 생기는 영역은 강한 제약을 유지한다.

[V]가 나열하는 영역:

```
Production 배포
DB Migration
Secret
결제
개인정보
Signing
보안
```

[V]가 제시하는 형태:

```markdown
## Safety Boundaries

- Never expose secrets or credentials.
- Production deployment requires explicit user approval.
- Database destructive migrations require explicit approval.
- Do not modify signing credentials.
```

정본 쪽 근거: [NR]은 Skill에 대해 "과도하게 제약하지 말라 — **단, 매우 중요한 영역은 예외**"라고 말한다. **어느 영역이 그 예외인지는 [NR]이 열거하지 않는다.** 위 7개 목록은 [V]의 판단이다 ([§8](#8-출처-분리--1차와-2차의-차이) 항목 4).

이 영역들의 공통점은 **되돌릴 수 없거나 레포 바깥으로 나간다**는 것이다. 강한 제약이 정당화되는 이유는 "모델이 못 미더워서"가 아니라 실패 비용이 비대칭이기 때문이다.

### 좋은 규칙 / 과한 규칙

[V §5]가 대비시키는 두 형태:

경계와 이유가 명확한 규칙 — 남긴다:

```markdown
- Avoid modifying unrelated files.
- Preserve existing public APIs unless the task requires an API change.
- Ask before introducing a new external dependency.
```

과한 규칙 — 지운다:

```markdown
- NEVER create a new file.
- NEVER modify more than 3 files.
- ALWAYS use protocol abstraction.
- ALWAYS create mocks.
```

차이는 강도가 아니라 **조건이 붙어 있는가**다. 위쪽은 "unless the task requires", "Ask before"처럼 예외 경로가 있다. 아래쪽은 상황과 무관하게 참이라고 주장한다 — 실제로는 상황에 따라 틀린다.

---

## 6. 최소 세팅 3종

[V §17, §24]. 처음 시작할 때 이것만 있으면 된다.

> **[P5]가 이 절에 직접 반대 압력을 건다.** 먼저 읽어야 한다.
>
> > Claude Opus 5 verifies its own work without being told to. If your prompt contains explicit verification instructions … **remove them** … The same applies to **legacy harness scaffolding that adds separate verification steps.** [P5]
>
> [V]의 "최소 3종"은 세 개 중 하나를 **verification Skill**로 놓는다. [P5]는 검증 절차를 덧붙이는 하네스 스캐폴딩을 지목해 지우라고 한다. 정면으로 부딪히는 것처럼 보인다.
>
> **모순이 아니라 조건이 붙는다.** [NR]의 원문 조건은 *"작업 검증 방법에 **고유한(unique)** 지시가 여럿 있다면"* 이다. 즉 정본이 승인한 것은 **레포 고유의 검증 지식**이지 "검증하라"는 절차 자체가 아니다. [P5]가 지우라는 것은 후자다.
>
> 가르는 질문은 하나다:
>
> ```
> 이 Skill이 담은 것이
>   "검증을 하라"인가            → 지운다. 모델이 이미 한다
>   "이 레포에서 검증은 이렇게 한다"인가 → 남긴다. 모델이 알 수 없다
> ```
>
> 이 기준으로 아래 [V §17]의 6단계 SKILL.md를 읽으면 **1~4단계는 대부분 지워도 되는 일반 절차**다. 남는 것은 레포 바깥에서 알 수 없는 것 — 실제 명령, 환경 특이사항, 통과 기준, 건너뛰면 안 되는 게이트 — 뿐이다.
>
> 그래서 이 레포가 배포할 질문은 "검증 Skill을 만드시겠습니까"가 아니라 이것이다:
>
> ```
> 당신 레포의 검증에서, 모델이 스스로 알아낼 수 없는 것은 무엇입니까?
> ```
>
> 그 답이 비어 있으면 **verification Skill을 만들지 않는 것이 정본에 맞다.** 근거는 [principles.md §5](principles.md).

```
Project/
├── CLAUDE.md
│
└── .claude/
    ├── skills/
    │   └── verification/
    │       └── SKILL.md
    │
    └── references/
        └── architecture.md
```

세 구성요소의 역할:

| # | 파일 | 담는 것 |
| --- | --- | --- |
| 1 | `CLAUDE.md` | 레포가 뭔지 한 줄, 작업 방식 몇 줄, Skill/Reference 위치, gotcha |
| 2 | `.claude/skills/verification/SKILL.md` | 행동이 바뀌었을 때 무엇을 어떻게 검증하는지 |
| 3 | `.claude/references/architecture.md` | 모듈 경계와 의존 방향, 그리고 그 예외 |

### 1. CLAUDE.md

```markdown
# <Project>

<한 줄 설명>

## Working Style

- Follow existing architecture and surrounding code style.
- Make the smallest change necessary.
- Avoid unrelated modifications.
- Ask before adding external dependencies.

## Validation

Use the verification skill when behavior changes.

## References

Architecture:
- `@.claude/references/architecture.md`

## Gotchas

- <코드만 봐서는 알 수 없는 사실>
```

### 2. verification/SKILL.md

```markdown
---
name: verification
description: Use when implementation changes behavior and needs validation.
---

# Verification

1. Identify the changed behavior.
2. Find relevant existing tests.
3. Run the smallest relevant test set.
4. Expand validation only if needed.
5. Report exactly what was executed.
6. Never claim a test passed without execution.
```

### 3. architecture.md

```markdown
# Architecture

<Layer A>
→ <Layer B>
→ <Layer C>

- <의존 방향 규칙>
- <구현 책임 규칙>
- <신규 코드에서 쓰면 안 되는 것>

## Exceptions

<규칙을 아직 위반하고 있는 기존 구성요소와, 신규 코드에는 적용하지 말라는 명시>
```

`architecture.md`의 **Exceptions 절**이 [V]에서 가장 잘 설계된 부분이다. 규칙과 그 규칙을 아직 지키지 않는 레거시를 한 파일에 같이 두면, 모델이 레거시를 보고 "이게 이 레포의 관행이구나"라고 오독하는 것을 막는다.

### 그다음

프로젝트가 커지면 필요한 작업만 Skill로 추가한다 [V §24]:

```
Code Review
UI Validation
Release
Security
Migration
```

---

## 7. 요청이 처리되는 흐름

[V §18]이 그리는 전체 흐름 (언어 중립화):

```
User Prompt
   ↓
CLAUDE.md            항상 필요한 Repo Context
   ↓
관련 코드 탐색
   ↓
필요한 Reference 로드
   ↓
코드 수정
   ↓
Verification Skill 로드
   ↓
테스트
   ↓
결과 보고
```

핵심은 **매번 Architecture, Test Rule, Git Rule을 전부 프롬프트에 붙일 필요가 없다**는 것 [V §18].

구조를 그림으로 보면 [V §19]:

```
              CLAUDE.md
                  │
        ┌─────────┴─────────┐
        │                   │
     Gotchas           Navigation
                            │
          ┌─────────────────┼────────────────┐
          │                 │                │
       Skills          References          Code
          │                 │                │
     Verification      Architecture      Existing
     Code Review       API Spec          Patterns
     UI Validation     Design Spec       Tests
```

---

## 8. 출처 분리 — 1차와 2차의 차이

**이 절이 이 문서에서 가장 중요하다.** 위의 구조 제안 중 무엇이 Anthropic의 권고이고 무엇이 [V]의 창작인지 구분한다.

### 8.1 [V]가 1차에 없는 내용을 추가한 지점

| # | [V]의 주장 | 1차 소스의 실제 내용 | 판정 |
| --- | --- | --- | --- |
| 1 | `.claude/references/` 디렉터리에 레포 전역 레퍼런스를 둔다 | [NR]은 "`@` 멘션으로 파일을 레퍼런스로 포함"한다고만 말한다. **경로도 디렉터리 이름도 규정하지 않는다.** | **2차 고유.** 합리적 관례지만 정본 근거 없음 |
| 2 | `.claude/skills/<name>/references/<detail>.md` 서브디렉터리 배치 | [NR]은 긴 Skill을 "여러 파일로 나눠 쪼개라"고만 말한다. `references/`라는 이름도, 서브디렉터리라는 형태도 규정하지 않는다. | **2차 고유.** 게다가 [V] 내부에서도 배치가 엇갈린다 (항목 11) |
| 3 | "최소 세팅 3종" = CLAUDE.md + verification Skill + architecture Reference | [NR]은 verification skill을 만들어 CLAUDE.md에서 참조하라는 **예시**를 든다. 그것도 *"검증 방법에 **고유한** 지시가 여럿 있다면"*이라는 조건 아래다. "이 세 개로 시작하라"는 처방은 없다 | **2차 고유.** 정본의 조건부 예시를 무조건적 온보딩 레시피로 승격시킨 것. [P5]가 이 승격을 뒤집는다 → [§6](#6-최소-세팅-3종), 항목 14 |
| 4 | 강한 제약 유지 영역 7개 목록 (Production 배포 / DB Migration / Secret / 결제 / 개인정보 / Signing / 보안) | [NR]은 "매우 중요한 영역은 예외"라고만 말하고 **어떤 영역인지 열거하지 않는다** | **2차 고유 확장.** 목록 자체는 타당해 보이나 정본 승인은 없음 |
| 5 | 규칙 소유 위치 4분할 매핑 (Skill / CLAUDE.md / Tool description / User Prompt) | [NR]은 "반복을 지우고 툴 사용법은 툴 설명에 둔다"까지만 말한다. 4분할 매핑은 [NR]의 여러 진술을 [V]가 종합한 것 | **2차 종합.** 정본과 모순되지 않지만 정본이 만든 표는 아님 |
| 6 | 마이그레이션 5분류 체크리스트 (지운다 / 남긴다 / Skill / Reference / 코드) | [NR]에는 마이그레이션 절차가 없다. 정본의 처방은 `/doctor`를 쓰라는 것 | **2차 고유.** 개별 항목 대부분은 정본 주장으로 환원되지만, 절차 형태는 [V]의 것 |
| 7 | `architecture.md`의 `## Exceptions` 절 (규칙과 레거시 예외를 한 파일에) | 1차에 대응 서술 없음 | **2차 고유.** 좋은 아이디어지만 [V]의 것 |

### 8.2 [V]가 1차와 어긋나거나 무게중심을 옮긴 지점

| # | 쟁점 | [V] | 1차 | 어떻게 처리하나 |
| --- | --- | --- | --- | --- |
| 8 | **CLAUDE.md의 주된 역할** | "Context Navigation Map" — 어디에 무엇이 있는지 알려주는 Router가 본질 [V §9] | [NR]: 레포를 **짧게** 서술하고 "**토큰의 대부분(most of the tokens)을 gotcha에 쓰라**" | **정본 우선.** Router는 유용한 은유지만, 라우팅 표가 gotcha를 밀어내면 [NR]을 어긴 것이다. [V]의 예시 CLAUDE.md들에서 Gotchas는 마지막 한 섹션이다 |
| 9 | **예시(example)의 지위** | "예제보다 Interface를 잘 만든다" — 예제는 탐색 범위를 좁힌다 [V §6] | [NR]은 **툴 사용 예시**에 대해 그렇게 말한다. 반면 [ECE]는 few-shot 예시를 "**여전히 강력히 권장**"하며, 엣지 케이스 나열 대신 **다양하고 정본적인 예시 집합**을 큐레이션하라고 한다 | **[V]가 과잉 일반화.** 폐기 대상은 "툴 호출 예시로 행동을 못 박기"지 예시 일반이 아니다 |
| 10 | **왜 그래야 하는가** | 이유를 "Anthropic이 그렇게 바꿨다"로 처리한다. 메커니즘 설명 없음 | [ECE]: context rot, attention budget, n² 쌍관계 — 컨텍스트가 **한계수익 체감하는 유한 자원**이기 때문 | **[V]에 없는 층위.** 근거 없이 형식만 따라 하면 어느 항목을 지워도 되는지 판단할 수 없다. [principles.md §3](principles.md) 참조 |
| 11 | **Skill 배치의 내부 일관성** | §10·§11은 `<skill>/references/<file>.md`, §22는 `<skill>/<file>.md` | 1차는 배치를 규정하지 않음 | **[V] 내부 불일치.** 둘 중 하나를 고르는 것은 이 레포의 결정이지 정본 준수 문제가 아니다 |
| 12 | **속도 트레이드오프** | 언급 없음 | [ECE]: 런타임 탐색은 사전 계산된 데이터 조회보다 **느리다**. 안내가 부실하면 에이전트가 막다른 길을 쫓으며 컨텍스트를 낭비한다 | **[V]에 누락.** progressive disclosure는 공짜가 아니다 |
| 13 | **장기 작업 기법** | 다루지 않음 | [ECE]: compaction / structured note-taking / sub-agent architectures와 각각의 선택 기준 | **[V] 범위 밖.** 하네스를 만든다면 [principles.md §4](principles.md)가 필요하다 |
| 14 | **검증을 별도 절차로 두는 것** | 최소 세팅 3종의 한 축 [V §17] | [P5]: 모델은 시키지 않아도 자기 작업을 검증한다. 명시적 검증 지시와 **검증 단계를 덧붙이는 하네스 스캐폴딩은 지우라**. 지워도 품질 손실 없이 토큰만 준다 | **정본 우선.** Skill이 담은 것이 *절차*면 지우고, *레포 고유 지식*이면 남긴다. 가르는 질문은 [§6](#6-최소-세팅-3종) |
| 15 | **새로 써야 하는 지시** | 다루지 않음 — 마이그레이션을 삭제 방향으로만 그린다 | [P5]: Opus 5는 응답·문서가 길어지고, 나레이션이 잦고, 범위를 넓히고, 위임을 자주 한다. 원치 않으면 **명시적으로 써야** 한다 | **[V] 누락.** "지운다" 바구니만 있고 "채운다" 바구니가 없다 → [§3](#3-마이그레이션-체크리스트), [principles.md §5.2](principles.md) |

### 8.3 [V]가 1차를 정확히 옮긴 지점

아래는 [V]의 서술이 정본과 일치한다. 그대로 써도 된다.

| [V]의 주장 | 정본 근거 |
| --- | --- |
| 시스템 프롬프트 80% 이상 삭제, 측정 가능한 성능 저하 없음 | [NR] |
| CLAUDE.md는 가볍게, 레포 설명 + 코드만 봐선 알기 힘든 gotcha 중심 | [NR] |
| 폴더 구조 설명처럼 파일 시스템으로 알 수 있는 내용은 가치 없음 | [NR] |
| 세세한 코딩 스타일 규칙 → "주변 코드처럼 작성한다" 한 줄로 대체 | [NR] (원문 그대로 인용) |
| Anthropic이 code review·verification을 시스템 프롬프트에서 Skill로 분리 | [NR] |
| 시스템 프롬프트와 툴 설명 양쪽에 같은 지시를 반복하던 방식 제거 | [NR] |
| 개인·작업 지속성 정보는 Auto-memory로, CLAUDE.md를 메모리 저장소로 쓰지 않음 | [NR] |
| 설명보다 실제 코드를 Reference로 주는 편이 정확 | [NR] |
| 스크린샷보다 HTML 목업이 더 높은 fidelity | [NR] |
| Skill을 과도하게 제약하지 말되 중요 영역은 예외 | [NR] |
| Rubric도 Reference의 한 형태 | [NR] |
| `/doctor`로 Skill과 CLAUDE.md 크기를 점검 | [NR] |
| Prompt는 구체적, Context는 여러 요청에 공통이라 일반적 | [NR] |
| 절대 규칙이 최신 모델의 판단을 오히려 방해할 수 있음 | [NR] |

---

## 9. 이 레포가 [V]에서 취하는 것

| 취한다 | 취하지 않는다 |
| --- | --- |
| 마이그레이션 5분류 체크리스트 — 질문 세트의 뼈대로 유용하다 | "최소 3종 세팅"을 기본값으로 배포하는 것 — 어떤 Skill이 필요한지는 레포마다 다르다 |
| 규칙 소유 위치 매핑 — 충돌 탐지의 실행 가능한 형태다 | 강한 제약 7개 영역을 그대로 배포하는 것 — 해당 여부는 레포가 답해야 한다 |
| `architecture.md`의 Exceptions 절 아이디어 | Router 프레이밍을 gotcha보다 앞세우는 것 — [NR]과 어긋난다 |
| `<skill>/SKILL.md` + `references/` 배치 (§10 쪽 형태로 통일) | 예시 일반을 폐기하는 해석 — [ECE]와 어긋난다 |
| [P5]의 판정 질문 — "이 지시가 없으면 모델이 안 할 일인가" | verification Skill을 기본 산출물로 찍어내는 것 — [P5] 항목 14 |
| [P5]가 짚은 "채워야 하는 것" 목록 — 삭제 일변도 마이그레이션의 사각지대다 | 리뷰 Skill에 `only report high-severity` 류 컷오프를 넣는 것 — 역효과다 [§2](#2-디렉터리-배치) |

전부, **내용을 배포하는 것이 아니라 질문을 배포한다**는 제약 아래에서다. 자세한 것은 [CLAUDE.md](../CLAUDE.md).
