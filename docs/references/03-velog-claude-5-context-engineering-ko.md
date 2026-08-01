<!--
  ARCHIVED SOURCE — 본문 원문 보존본. 요약·재구성 없음.
  네비게이션/푸터/관련글/뉴스레터 등 문서 외 요소만 제거했다.
-->

# Claude 5 시대의 Context Engineering: CLAUDE.md부터 Skills까지

| | |
| --- | --- |
| Source | <https://velog.io/@kyu_ios_dev/2607271> |
| Author | 이경규 (velog @kyu_ios_dev) |
| Published | n/a |
| Retrieved | 2026-08-01 |
| Authority | 2차 (구조 제안 참고용 — 정본과 어긋나면 정본 우선) |

---
#### Claude 5 시대의 Context Engineering: CLAUDE.md부터 Skills까지

![원문 상단 썸네일 이미지](https://velog.velcdn.com/images/kyu_ios_dev/post/83d6186a-451a-4d6f-b52a-734ae95a883f/image.png)

Claude Code를 처음 쓰면 대부분 이런 식으로 시작한다.

```text
프로젝트를 분석해줘.
이 구조에 맞게 기능을 추가해줘.
테스트도 작성해줘.
```

조금 사용하다 보면 같은 설명을 계속 반복하게 된다.

```text
이 프로젝트는 MVVM입니다.
Swift 6을 사용합니다.
관련 없는 파일은 수정하지 마세요.
새 라이브러리는 함부로 추가하지 마세요.
테스트를 실행하지 않았다면 통과했다고 말하지 마세요.
```

그래서 자연스럽게 `CLAUDE.md`를 만들게 된다.

그다음에는 더 많은 규칙을 넣는다.

```text
Architecture
Coding Convention
Git Rules
Test Rules
UI Rules
Networking Rules
Review Rules
Release Rules
Security Rules
```

처음에는 잘 관리하는 것처럼 보인다.

하지만 파일이 점점 길어진다.

```text
CLAUDE.md

2 KB
↓
10 KB
↓
30 KB
↓
모든 규칙이 들어간 거대한 Context 파일
```

2026년 Claude 5 세대에서는 이 접근을 다시 생각할 필요가 있다.

Anthropic도 최근 Claude Code의 Context Engineering 방식을 크게 바꿨다.

핵심은 간단하다.

```text
모든 것을 처음부터 넣지 않는다.

항상 필요한 것만 CLAUDE.md에 둔다.

특정 작업에 필요한 지식은
Skill과 Reference로 필요할 때 불러온다.
```

---

## 1. 먼저 Context Engineering이 뭔가

Claude에게 전달되는 정보는 사용자가 방금 입력한 Prompt 하나가 전부가 아니다.

Claude Code에서는 여러 정보가 함께 Context를 만든다.

대략 이런 구조다.

```text
User Prompt

+ System Prompt

+ CLAUDE.md

+ Memory

+ Skills

+ References

+ 현재 읽은 코드

+ Tool 결과

= 현재 Claude가 판단하는 Context
```

그래서 같은 Prompt를 입력하더라도 Context 구성이 다르면 결과가 달라진다.

예를 들어

```text
로그인 에러 처리를 수정해줘.
```

라고만 입력했는데 `CLAUDE.md`에 다음 내용이 있으면

```text
기존 MVVM 구조를 유지한다.
View에서 NetworkClient를 직접 호출하지 않는다.
```

Claude는 이를 기본 규칙으로 참고한다.

Anthropic은 Prompt와 Context를 구분한다.

Prompt는 현재 요청에 구체적인 지시를 주는 데 적합하고, Context는 여러 요청에 공통적으로 영향을 주기 때문에 훨씬 일반적인 정보가 들어간다.

---

## 2. Claude를 처음 쓰는 사람은 이것만 세팅하면 된다

처음부터 복잡한 Context Pack을 만들 필요는 없다.

다음 정도면 충분하다.

```text
MyProject/
├── CLAUDE.md
├── Sources/
├── Tests/
└── ...
```

그리고 `CLAUDE.md`부터 만든다.

예를 들어 iOS 프로젝트라면 이렇게 시작한다.

```markdown
# Project

This is an iOS application written in Swift 6 and SwiftUI.

## Architecture

- Follow the existing architecture.
- Keep business logic outside SwiftUI Views.
- Reuse existing services and repositories before creating new ones.

## Scope

- Make the smallest change necessary for the task.
- Do not modify unrelated files.
- Do not add external dependencies unless required.

## Validation

- Run relevant tests after changing behavior.
- Do not report tests as passed unless they were actually executed.

## Important Gotchas

- Networking errors are converted through `AppErrorMapper`.
- Shared colors and typography must come from `DesignSystem`.
- Do not edit generated files under `Generated/`.
```

처음에는 이 정도로 끝내도 된다.

---

## 3. 최신 Claude에서는 CLAUDE.md를 짧게 가져가는 게 중요하다

예전에는 이런 생각을 하기 쉬웠다.

```text
Claude가 알아야 할 내용은
전부 CLAUDE.md에 넣자.
```

지금 Anthropic의 권장 방향은 반대에 가깝다.

`CLAUDE.md`는 가볍게 유지한다.

특히 다음 두 종류를 중심으로 둔다.

```text
1. Repository가 무엇인지

2. 코드만 봐서는 쉽게 알기 힘든 Gotcha
```

Anthropic도 최신 가이드에서 `CLAUDE.md`는 Repository를 짧게 설명하고, 대부분의 토큰을 코드베이스 특유의 주의사항에 쓰라고 권장한다. 파일 구조만 보면 알 수 있는 당연한 내용은 굳이 다시 적지 말라고 설명한다.

예를 들어 이런 내용은 가치가 낮다.

```markdown
## Folder Structure

Sources 폴더에는 소스 코드가 있습니다.
Tests 폴더에는 테스트가 있습니다.
Resources 폴더에는 리소스가 있습니다.
```

Claude가 파일 시스템을 보면 알 수 있다.

반대로 이런 내용은 가치가 높다.

```markdown
## Gotchas

- `LegacyAuthService`는 이름과 달리 아직 Production에서 사용 중이다.
- `Generated/API.swift`는 직접 수정하지 말고 generator를 실행해야 한다.
- `UserSession.shared`를 새 코드에서 사용하지 않는다.
- 모든 API 오류는 `AppErrorMapper`를 거쳐야 한다.
```

이건 파일 구조만 봐서는 바로 판단하기 어렵다.

---

## 4. 기존 Context Pack에서 가장 먼저 줄여야 할 것

Claude용 Context Pack을 크게 만들어뒀다면 먼저 중복을 찾는다.

예를 들어 이런 구성이 있다고 해보자.

```text
CLAUDE.md

Coding Style

- 함수는 작게 작성한다.
- 이름을 명확하게 작성한다.
- 필요한 경우 주석을 작성한다.
- 복잡한 코드는 설명한다.
- 기존 코드 스타일을 따른다.
```

Claude 5 세대에서는 이것을 대부분 지울 수 있다.

Anthropic이 실제 Claude Code 시스템 프롬프트에서 예전에 사용하던 세부 규칙 중 하나가 이런 형태였다.

```text
주석을 기본적으로 쓰지 않는다.
여러 줄 docstring을 만들지 않는다.
계획 문서를 만들지 않는다.
```

새로운 방식에서는 훨씬 간단하게 바뀌었다.

```text
주변 코드처럼 작성한다.
주석 밀도, 이름, 관용적 스타일을 맞춘다.
```

최신 모델의 판단력을 더 활용하는 방식이다.

우리 Context Pack도 비슷하게 바꿀 수 있다.

### 이전

```markdown
- 함수 이름은 명확해야 한다.
- 변수 이름은 의미가 있어야 한다.
- 불필요한 주석은 작성하지 않는다.
- 필요한 경우 짧은 주석을 작성한다.
- 긴 주석은 지양한다.
- 기존 Swift 스타일을 유지한다.
```

### 변경

```markdown
- Match the surrounding code's naming, structure, comment density, and Swift idioms.
```

한 줄이면 된다.

---

## 5. Claude에게 규칙을 너무 많이 주지 않는다

이전 Context Pack에서 특히 줄여야 하는 부분은 강한 절대 규칙이다.

```text
절대 주석을 작성하지 마라.

무조건 새 파일을 만들지 마라.

항상 테스트를 먼저 작성하라.

절대 Repository를 수정하지 마라.

항상 계획을 작성한 뒤 작업하라.
```

실제 개발에서는 상황에 따라 맞을 수도 있고 틀릴 수도 있다.

Claude 5 세대에서는 이런 규칙이 오히려 판단을 방해할 수 있다.

Anthropic도 이전 시스템 프롬프트와 Skills, 사용자 요청 사이에서 서로 충돌하는 지시가 발생했고, 최신 모델에서는 많은 규칙을 삭제해 모델 판단에 맡기는 방향으로 변경했다고 설명한다.

좋은 규칙은 이유와 경계가 명확하다.

```markdown
- Avoid modifying unrelated files.
- Preserve existing public APIs unless the task requires an API change.
- Ask before introducing a new external dependency.
```

반면 이런 것은 과하다.

```markdown
- NEVER create a new file.
- NEVER modify more than 3 files.
- ALWAYS use protocol abstraction.
- ALWAYS create mocks.
```

---

## 6. 예제보다 Interface를 잘 만든다

예전에는 Claude에게 Tool 사용 예제를 많이 제공하는 것이 도움이 됐다.

예를 들어

```text
Tool을 이렇게 호출해라.

Example 1
Example 2
Example 3
```

하지만 Anthropic은 최신 모델에서 예제가 오히려 Claude의 탐색 범위를 좁힐 수 있다고 설명한다.

이제는 **Tool Interface 자체를 잘 설계하는 것**을 더 중요하게 본다.

예를 들어 이런 Tool이 있다고 하자.

```ts
runTest(command: string)
```

Claude에게 긴 사용 예제를 제공하는 것보다

```ts
type TestRequest = {
  target: string;
  scope: "unit" | "integration" | "all";
  timeoutSeconds: number;
};
```

처럼 Interface 자체에서 선택 가능한 행동을 보여주는 편이 낫다.

Context Pack에서도 같은 원칙을 적용한다.

### 이전

```markdown
테스트 예제:

xcodebuild test ...
xcodebuild test ...
xcodebuild test ...
```

### 변경

```markdown
For test execution, use the project's verification skill.
```

실제 명령과 상세 절차는 Skill 쪽에 둔다.

---

## 7. 가장 큰 변화는 Progressive Disclosure다

이번 Anthropic 글에서 가장 중요한 부분 중 하나다.

예전 Context Pack은 보통 이런 구조였다.

```text
CLAUDE.md

Architecture
Testing
Review
Security
Git
Release
UI
API
Performance
Accessibility
Migration
```

Claude가 어떤 작업을 하든 전부 Context에 들어간다.

하지만 로그인 버그 하나를 수정하는 데 Release 규칙이나 Accessibility 검증 전체가 필요한 것은 아니다.

그래서 구조를 바꾼다.

```text
CLAUDE.md

→ 항상 필요한 내용

Skills

→ 특정 작업에서만 필요한 절차

References

→ 더 상세한 자료
```

Anthropic도 Code Review와 Verification 정보를 시스템 프롬프트에서 분리해 각각 Skill로 옮겼으며, Claude가 필요할 때 선택적으로 로드하도록 변경했다고 설명한다.

---

## 8. 기존 Context Pack을 이런 구조로 바꾸면 된다

예전에 이런 식으로 관리했다면

```text
.claude/
└── context/
    ├── architecture.md
    ├── coding-style.md
    ├── testing.md
    ├── review.md
    ├── security.md
    ├── ui.md
    ├── git.md
    └── release.md

CLAUDE.md
```

이제는 다음처럼 바꾸는 편이 낫다.

```text
Project/
├── CLAUDE.md
│
├── .claude/
│   ├── skills/
│   │   ├── verification/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   │       └── ios-testing.md
│   │   │
│   │   ├── code-review/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   │       └── review-rubric.md
│   │   │
│   │   └── ui-validation/
│   │       ├── SKILL.md
│   │       └── references/
│   │           ├── swiftui.md
│   │           └── figma.md
│   │
│   └── references/
│       ├── architecture.md
│       ├── api-contract.md
│       └── design-system.md
│
├── Sources/
└── Tests/
```

핵심 구조는 이것이다.

```text
CLAUDE.md
→ 길잡이

Skill
→ 작업 절차

Reference
→ 상세 지식

Code
→ 가장 정확한 실제 기준
```

---

## 9. CLAUDE.md는 일종의 Router처럼 만든다

CLAUDE.md에 모든 내용을 넣지 않고 어디에 무엇이 있는지를 알려준다.

예를 들어

```markdown
# Project

Swift 6 + SwiftUI 기반 iOS 애플리케이션이다.

## Architecture

Follow existing module boundaries and dependency direction.

Detailed architecture reference:

- `@.claude/references/architecture.md`

## Verification

Use the verification skill when behavior changes.

## UI Work

For SwiftUI visual changes, use the UI validation skill.

Design system reference:

- `@.claude/references/design-system.md`

## Important Gotchas

- `Generated/` is generated code and must not be edited manually.
- Production networking errors must pass through `AppErrorMapper`.
- New external dependencies require approval.
```

이 정도면 된다.

CLAUDE.md 자체가 문서 저장소가 아니라 **Context Navigation Map** 역할을 한다.

---

## 10. Verification은 Skill로 분리한다

기존 Context Pack에서 테스트 관련 내용이 길었다면 가장 먼저 Skill로 옮기기 좋다.

```text
.claude/
└── skills/
    └── verification/
        ├── SKILL.md
        └── references/
            └── ios-testing.md
```

`SKILL.md`

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

For iOS-specific test commands and simulator issues:

- `references/ios-testing.md`
```

여기에 `xcodebuild` 전체 설명을 넣지 않는다.

필요할 때 `ios-testing.md`를 읽는다.

이게 Progressive Disclosure다.

---

## 11. Code Review도 Skill로 옮긴다

```text
.claude/
└── skills/
    └── code-review/
        ├── SKILL.md
        └── references/
            └── review-rubric.md
```

`SKILL.md`

```markdown
---
name: code-review
description: Use when reviewing a diff, pull request, or completed implementation.
---

# Code Review

Review the change against the requested behavior and existing architecture.

Prioritize:

1. Correctness
2. Regression risk
3. Scope violations
4. Security
5. Missing validation

Do not spend significant review effort on style that already matches surrounding code.

Use `references/review-rubric.md` when a detailed review is required.
```

평소 기능 구현에는 이 Context가 들어갈 필요가 없다.

Review가 필요할 때만 Claude가 불러오게 한다.

---

## 12. Architecture 문서는 Reference로 남긴다

Architecture 전체를 `CLAUDE.md`에 넣는 것도 피하는 것이 좋다.

```text
.claude/
└── references/
    └── architecture.md
```

예를 들어

```markdown
# Architecture

## Modules

App
↓
Feature
↓
Domain
↓
Data

## Dependency Rules

- Feature may depend on Domain.
- Domain must not depend on UI.
- Data implements Domain repository interfaces.

## Exceptions

`LegacyPayment` still bypasses the repository abstraction.
Do not use this structure for new code.
```

특정 작업에서 Architecture 확인이 필요하면 Claude가 이 파일을 읽는다.

---

## 13. 설명보다 Code Reference를 더 적극적으로 사용한다

Anthropic의 새 글에서 꽤 중요한 변화다.

Reference는 꼭 Markdown 문서일 필요가 없다.

오히려 실제 코드가 더 좋은 Reference가 될 수 있다.

예를 들어 새로운 화면을 만들어야 한다면

```text
이 화면은 MVVM입니다.
ViewModel은 이렇게 만들고
Repository는 이렇게 만들고...
```

라고 50줄 설명하는 것보다

```text
@Sources/Profile/ProfileViewModel.swift
@Sources/Profile/ProfileRepository.swift
```

같이 잘 만들어진 기존 구현을 Reference로 주는 편이 정확하다.

UI도 마찬가지다.

스크린샷 하나보다 HTML Mockup처럼 구조가 있는 Reference가 모델에게 더 높은 fidelity의 정보를 줄 수 있다고 Anthropic은 설명한다.

---

## 14. Context Pack에서 반복 문장을 제거한다

다음처럼 같은 규칙이 여러 곳에 있을 필요가 없다.

```text
CLAUDE.md

테스트를 실행해야 한다.
```

```text
verification/SKILL.md

테스트를 실행해야 한다.
```

```text
review/SKILL.md

테스트를 실행해야 한다.
```

```text
Agent Prompt

테스트를 실행해야 한다.
```

Anthropic도 최신 Claude에서는 시스템 프롬프트와 Tool 설명 양쪽에 같은 지시를 반복하던 방식을 제거했다고 설명한다.

규칙의 소유 위치를 하나로 만든다.

```text
Verification 행동
→ verification Skill

Repository 금지 사항
→ CLAUDE.md

Tool 사용법
→ Tool description

현재 작업 요구사항
→ User Prompt
```

이렇게 분리한다.

---

## 15. Memory를 CLAUDE.md에 계속 쌓지 않는다

예전에는 Claude가 기억해야 할 내용을 `CLAUDE.md`에 계속 추가하는 방식도 많이 사용했다.

```text
우리는 항상 이것을 선호한다.

지난번에 이런 결정을 했다.

사용자는 이런 스타일을 좋아한다.

이 버그 때문에 이렇게 했다.
```

계속 쌓이면 결국 CLAUDE.md가 회의록처럼 변한다.

Anthropic은 이제 이런 개인적·작업 지속성 정보는 Auto-memory 쪽에 맡기고, `CLAUDE.md`를 Memory 저장소처럼 쓰지 않는 방향을 권장한다.

CLAUDE.md에는 **Repository의 지속적인 사실**만 남긴다.

좋은 예:

```text
Generated/는 직접 수정하면 안 된다.
```

나쁜 예:

```text
지난주 사용자와 이야기했는데 버튼은 파란색을 좋아한다고 했다.
```

---

## 16. Context Pack에 남겨야 하는 강한 규칙도 있다

모든 규칙을 지우라는 뜻은 아니다.

잘못하면 큰 문제가 생기는 영역은 강한 제약을 유지해야 한다.

예를 들어

```text
Production 배포

DB Migration

Secret

결제

개인정보

Signing

보안
```

관련 규칙이다.

```markdown
## Safety Boundaries

- Never expose secrets or credentials.
- Production deployment requires explicit user approval.
- Database destructive migrations require explicit approval.
- Do not modify signing credentials.
```

Anthropic도 Skills를 지나치게 제약하지 말라고 하면서, 중요한 영역에서는 강한 제약이 적절할 수 있다고 설명한다.

---

## 17. 처음 쓰는 사람을 위한 최소 Context 세팅

복잡하게 생각할 필요 없다.

처음에는 아래 세 개면 충분하다.

```text
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

### CLAUDE.md

```markdown
# Project

Swift 6 + SwiftUI iOS application.

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

- Do not edit `Generated/`.
- API errors must pass through `AppErrorMapper`.
```

### verification/SKILL.md

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

### architecture.md

```markdown
# Architecture

App
→ Feature
→ Domain
→ Data

- UI must not call networking directly.
- Data implements repository interfaces from Domain.
- New code must not use `LegacyServiceLocator`.
```

이 정도만 있어도 Context Engineering의 기본 구조가 만들어진다.

---

## 18. 실제 작업은 이렇게 시작한다

Claude Code를 프로젝트 루트에서 실행한다.

```bash
claude
```

그다음 처음부터 긴 지시를 넣을 필요가 없다.

```text
LoginViewModel의 로그인 실패 처리를 수정해줘.

서버 원문 대신 사용자에게 안전한 메시지를 보여주고
관련 테스트까지 검증해줘.
```

Claude는 기본 Context에서 `CLAUDE.md`를 참고한다.

행동 변경이 있으므로 Verification Skill을 활용할 수 있다.

필요하면 Architecture Reference를 읽는다.

전체 흐름은 이런 형태가 된다.

```text
User Prompt

↓️

CLAUDE.md
항상 필요한 Repo Context

↓️

관련 코드 탐색

↓️

필요한 Reference 로드

↓️

코드 수정

↓️

Verification Skill 로드

↓️

테스트

↓️

결과 보고
```

매번 Architecture, Test Rule, Git Rule을 전부 Prompt에 붙일 필요가 없다.

---

## 19. Claude 5 기준 Context Pack은 이렇게 생각하면 쉽다

예전 구조가 이런 식이었다면

```text
┌─────────────────────────┐
│       CLAUDE.md         │
│                         │
│ Architecture            │
│ Coding Rule             │
│ Test                    │
│ Review                  │
│ UI                      │
│ Security                │
│ Git                     │
│ Release                 │
│ Examples                │
│ Memories                │
│ Tool Instructions       │
└─────────────────────────┘
```

지금은 이렇게 바꾸는 편이 낫다.

```text
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

CLAUDE.md가 모든 지식을 담는 곳이 아니라 Context를 찾아가는 출발점이 된다.

---

## 20. 기존 Context Pack을 수정하는 체크리스트

기존 Claude Context Pack을 가지고 있다면 다음 순서대로 정리하면 된다.

### 지운다

```text
Claude가 코드만 봐도 알 수 있는 내용

일반적인 Clean Code 설명

너무 세세한 코딩 스타일 규칙

Tool 사용 예제 반복

서로 다른 파일에 중복된 규칙

오래된 개인 Memory
```

### CLAUDE.md에 남긴다

```text
Repository 목적

중요한 Architecture 경계

코드에서 바로 알기 힘든 Gotcha

절대 건드리면 안 되는 영역

Skill과 Reference 위치
```

### Skill로 옮긴다

```text
Verification

Code Review

Release

Migration

Security Review

UI Validation
```

### Reference로 옮긴다

```text
Architecture 상세 설명

API Contract

Design System

Migration Guide

제품 Spec

Rubric
```

### 가능하면 코드로 대체한다

```text
긴 구현 설명
→ 좋은 기존 구현 파일

API 사용 설명
→ 실제 타입과 테스트

UI 설명
→ HTML Artifact나 구현 Reference

Validation 설명
→ 실행 가능한 Test Suite
```

---

## 21. `/doctor`로 Context를 점검한다

Anthropic은 이번 변경과 함께 Claude Code에서 Context를 정리하는 데 도움을 주는 `claude doctor`를 소개했다.

Claude Code 안에서는

```text
/doctor
```

를 사용할 수 있다.

Anthropic은 이 기능이 Skills와 `CLAUDE.md`의 크기를 적절하게 조정하는 데 도움을 주도록 만들었다고 설명한다.

기존에 큰 Context Pack을 운영하고 있다면 한 번 확인해볼 만하다.

특히 다음 문제를 찾아보는 것이 좋다.

```text
CLAUDE.md가 너무 긴가

Skill이 너무 많은 책임을 갖고 있는가

같은 규칙이 반복되는가

항상 필요하지 않은 내용이 기본 Context에 있는가

Claude의 판단을 지나치게 제한하고 있는가
```

---

## 22. 내가 지금 Context Pack을 만든다면

iOS 프로젝트 기준으로는 이 정도 구조부터 시작할 것 같다.

```text
MyApp/
│
├── CLAUDE.md
│
├── .claude/
│   │
│   ├── skills/
│   │   │
│   │   ├── verification/
│   │   │   ├── SKILL.md
│   │   │   └── ios-testing.md
│   │   │
│   │   ├── code-review/
│   │   │   ├── SKILL.md
│   │   │   └── review-rubric.md
│   │   │
│   │   └── ui-validation/
│   │       ├── SKILL.md
│   │       └── swiftui-validation.md
│   │
│   └── references/
│       ├── architecture.md
│       ├── design-system.md
│       └── api-contract.md
│
├── Sources/
│
└── Tests/
```

그리고 `CLAUDE.md`는 되도록 한눈에 읽히게 유지한다.

```markdown
# MyApp

Swift 6 + SwiftUI application.

## Architecture

Follow existing module boundaries.

Detailed reference:
- `@.claude/references/architecture.md`

## Working Rules

- Match surrounding code.
- Keep changes scoped to the task.
- Ask before adding dependencies.
- Do not edit generated code.

## Validation

Behavior changes must be verified.

Use:
- verification skill
- code-review skill when reviewing a completed change

## UI

Reuse existing DesignSystem.

Detailed reference:
- `@.claude/references/design-system.md`

## Gotchas

- `LegacyAuthService` is still used in production.
- All API errors go through `AppErrorMapper`.
- `Generated/` must never be edited manually.
```

이 정도면 충분하다.

필요한 순간에 Claude가 아래로 내려간다.

```text
CLAUDE.md
↓
Skill
↓
Reference
↓
Code
```

---

## 23. 가장 중요한 변화

Claude Context Engineering의 방향은 꽤 분명해졌다.

예전에는

```text
Claude가 실수하지 않도록
가능한 많은 규칙을 미리 알려준다.
```

에 가까웠다면,

Claude 5 세대에서는

```text
Claude가 판단할 수 있는 부분은 맡긴다.

중요한 경계만 알려준다.

필요한 전문 지식은
필요한 순간에 찾을 수 있게 만든다.
```

에 가까워졌다.

Anthropic이 말하는 변화도 거의 이 흐름이다.

```text
Then
Rules

Now
Judgement
```

```text
Then
Examples

Now
Interfaces
```

```text
Then
Everything upfront

Now
Progressive disclosure
```

```text
Then
Repeated instructions

Now
Simple tool descriptions
```

```text
Then
Memory in CLAUDE.md

Now
Auto-memory
```

```text
Then
Simple specs

Now
Rich references
```

---

## 24. 마무리

좋은 Claude Context Pack은 큰 Context Pack이 아니다.

Claude가 현재 작업에 필요한 정보를 빠르게 찾을 수 있는 구조다.

처음 Claude Code를 사용하는 개발자라면 복잡하게 시작할 필요도 없다.

```text
CLAUDE.md
+
Verification Skill
+
Architecture Reference
```

세 개부터 시작하면 된다.

그리고 프로젝트가 커지면 필요한 작업만 Skill로 추가한다.

```text
Code Review
UI Validation
Release
Security
Migration
```

기존 Context Pack이 이미 크다면 이번 Claude 5 기준으로 다음 질문을 해보는 것이 좋다.

```text
이 내용이 모든 작업에서 정말 필요한가?

Claude가 코드만 봐도 알 수 있지 않은가?

Skill로 필요할 때만 불러올 수 있지 않은가?

Reference나 실제 코드로 보여주는 편이 낫지 않은가?

같은 규칙을 다른 곳에서도 반복하고 있지 않은가?
```

한 줄로 정리하면 이렇다.

```text
Claude 5 Context Engineering은
더 많이 알려주는 기술이 아니라,
필요한 정보를 필요한 순간에 찾게 만드는 설계다.
```

앞으로 Claude Code를 잘 세팅한다는 것은 거대한 `CLAUDE.md`를 만드는 것이 아니다.

**작은 CLAUDE.md를 중심으로 Skill, Reference, 실제 코드를 계층적으로 연결해 Claude가 스스로 필요한 Context를 찾아가게 만드는 것이다.**

## 참고 자료

- **Anthropic — The new rules of context engineering for Claude 5 generation models**
  Claude 5 세대에서 Context Engineering 방식을 어떻게 바꿔야 하는지 정리한 공식 글.
  핵심 내용은 작은 `CLAUDE.md`, Progressive Disclosure, Skills 분리, Auto-memory, Rich References다.

- **Claude Code Documentation**
  `CLAUDE.md`, Skills, Memory, Reference 파일 등 Claude Code의 실제 Context 구성과 사용법을 확인할 수 있는 공식 문서.

- **Anthropic — Context Engineering**
  Prompt 하나가 아니라 System Prompt, Memory, Skills, Tool 결과, 코드와 Reference까지 포함한 전체 Context를 어떻게 설계할지 설명하는 Anthropic의 기본 개념 자료.

### 핵심 참고 포인트

Claude 5 세대에서는 모든 규칙을 처음부터 Context에 넣기보다,

`CLAUDE.md → 필요한 Skill → 필요한 Reference → 실제 코드`

순으로 필요한 정보를 점진적으로 불러오는 구조가 권장된다.

특히 Anthropic은 최신 Claude Code에서 시스템 프롬프트를 80% 이상 줄이고도 코딩 평가에서 측정 가능한 성능 저하가 없었다고 설명하고 있으며, `CLAUDE.md` 역시 Repository 설명과 코드만 봐서는 알기 어려운 Gotcha 위주로 가볍게 유지하는 것을 권장한다.
