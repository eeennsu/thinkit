규칙을 미리 적어두는 배치가 어떤 모습인지 보여주는 발췌다. 아래 두 규칙은 둘 다 ESLint가
판정할 수 있다 — `prefer-const`와 `no-else-return`.

````markdown title="AGENTS.md (발췌)"
### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```
````

인용 대상은 활발히 관리되는 공개 프로젝트다. 이 레포가 틀렸다는 예가 아니다 —
**규칙을 미리 많이 주는 것이 정석이던 배치**가 실제로 어떤 모양인지 보여주는 예다.

- 출처: [anomalyco/opencode — AGENTS.md](https://github.com/anomalyco/opencode/blob/f44423609b03a47baf8a771c821a1de17046309f/AGENTS.md)
- 인용 시점: 2026-08-02
- 라이선스: MIT
- 발췌 범위: 66~96행 (전문 아님)
