# 컨텍스트 엔지니어링

Claude 5 세대 컨텍스트 엔지니어링의 정본. 이 문서의 모든 주장은 아래 Anthropic 공식 문서에서만 온다.

이 문서는 세대에 묶여 있다. 세대가 바뀌면 여기 적힌 것 중 일부가 틀린다. 세대와 무관한
판정 기준은 `principles/`에 따로 살고, 그쪽은 이 문서가 바뀌어도 그대로다 — 이름이 비슷하지만
다른 것이다.

| 약칭 | 문서 | 원문 |
| --- | --- | --- |
| **[NR]** | The new rules of context engineering for Claude 5 generation models | [references/01](references/01-new-rules-of-context-engineering-claude-5.md) |
| **[ECE]** | Effective context engineering for AI agents | [references/02](references/02-effective-context-engineering-for-ai-agents.md) |
| **[P5]** | Prompting Claude Opus 5 | [references/04](references/04-prompting-claude-opus-5.md) |

외부 글에서 유래한 구조 제안은 이 문서에 들어오지 않는다. [structure-patterns.md](structure-patterns.md)에 분리해 두었다.

**[P5]는 계층이 다르다.** [NR]·[ECE]는 컨텍스트 계층(CLAUDE.md·Skills·References)을 다루고, [P5]는 프롬프트 계층(응답 길이, 나레이션, effort, thinking 비활성 시 아티팩트)을 다룬다. 하네스 세팅과 무관한 절 — vision, effort sweep, 툴콜 텍스트 누출 — 은 이 문서로 올라오지 않았다. 올라온 것은 [§5](#5-모델이-이미-하는-일을-지시하지-않는다)에 모았다.

---

## 0. 출발점

Anthropic은 Claude Opus 5 · Claude Fable 5를 대상으로 **Claude Code 시스템 프롬프트의 80% 이상을 삭제했고, 코딩 평가에서 측정 가능한 성능 저하가 없었다** [NR].

이건 "프롬프트를 짧게 쓰자"는 스타일 조언이 아니다. 모델의 판단력이 올라가면서 **기존 지시의 상당 부분이 순가치가 음수가 되었다**는 관찰이다. 지우는 것이 유지하는 것보다 나았다.

프롬프트와 컨텍스트는 다르다. 프롬프트는 지금 이 요청 하나에 대한 구체적 지시고, 컨텍스트는 여러 요청에 걸쳐 공통으로 적용되므로 그만큼 구체적일 수 없다 [NR]. 컨텍스트 엔지니어링은 "무슨 말을 쓸까"가 아니라 **"어떤 컨텍스트 구성이 원하는 행동을 만들어낼 확률이 가장 높은가"**를 푸는 문제다 [ECE].

---

## 1. Then / Now — 6가지 전환

[NR]이 "이제는 신화가 된 기존 베스트 프랙티스"로 제시한 6개.

### 1) 규칙을 준다 → 판단을 맡긴다
*Then: Give Claude rules / Now: Let Claude use judgement*

초기 Claude Code는 파일 삭제 같은 최악의 시나리오를 막아야 했다. 그래서 항상 참이지는 않은 강한 지시를 넣었다. 옛 시스템 프롬프트:

> *In code: default to writing no comments. Never write multi-paragraph docstrings or multi-line comment blocks — one short line max. Don't create planning, decision, or analysis documents unless the user asks for them — work from conversation context, not intermediate files.* [NR]

이 지시는 일부 프롬프트에 대해 **틀렸다**. 사용자에게 자체 선호가 있을 수 있고, 아주 복잡한 코드는 여러 줄 주석 블록이 필요할 수도 있다. 구형 모델에서는 가드레일 없이 두면 주석이 자주 틀렸기 때문에 이 트레이드오프를 감수했을 뿐이다. 새 모델은 명시적 규칙 없이도 이 판단을 잘 처리한다 [NR].

새 시스템 프롬프트:

> *Write code that reads like the surrounding code: match its comment density, naming, and idiom.* [NR]

### 2) 예시를 준다 → 인터페이스를 설계한다
*Then: Give Claude examples / Now: Design interfaces*

툴 사용의 1순위 규칙은 예시 제공이었다. 최신 모델에서는 **예시가 오히려 모델을 특정 탐색 공간에 가둔다** [NR].

대신 툴·스크립트·파일의 설계를 생각한다 — Claude가 쓸 수 있는 파라미터가 무엇이고, 어떻게 더 표현력 있게 만들 수 있는가. Todo 툴의 경우 status를 `pending / in_progress / completed` 열거형으로 나열하는 것만으로 사용법이 암시된다. "하나만 in_progress로 유지하라"는 한 줄이 원하는 동작을 정의한다 [NR].

> 주의: [ECE]는 few-shot 예시를 "여전히 강력히 권장"한다. 단 엣지 케이스를 나열하지 말고 **다양하고 정본적인(canonical) 예시 집합**을 큐레이션하라고 말한다. 즉 [NR]이 폐기하는 것은 "툴 호출 예시로 행동을 못 박는 방식"이지 예시 일반이 아니다.

### 3) 전부 앞에 넣는다 → Progressive Disclosure
*Then: Put it all upfront / Now: Use progressive disclosure*

Claude Code는 코딩에 집중했기 때문에 시스템 프롬프트에 코드 리뷰와 검증 절차를 상세히 담고 있었다. 항상 필요하진 않지만, 필요할 때는 결정적인 정보였다 [NR].

지금은 검증과 코드 리뷰를 **각각의 Skill로 옮겼고**, Claude가 필요할 때 선택적으로 호출한다. Progressive disclosure는 Skill만의 것이 아니다. 일부 툴은 '**deferred loading**'이어서 에이전트가 ToolSearch로 정의를 찾아야 쓸 수 있다. 덕분에 툴을 더 많이 두면서도 필요해지기 전까지 컨텍스트를 잡아먹지 않는다 [NR].

같은 원리가 CLAUDE.md와 SKILL.md에도 적용된다. **"Claude가 못 찾을 테니 마주칠 수 있는 모든 관행을 중앙 저장소에 모아둬야 한다"는 것이 대표적 신화**다. 대신 적시에 로드될 수 있는 파일의 트리를 고려하라 [NR].

기반이 되는 메커니즘은 [ECE]의 **just-in-time 컨텍스트**다. 모든 데이터를 미리 처리하는 대신 가벼운 식별자(파일 경로, 저장된 쿼리, 웹 링크)만 유지하고 런타임에 툴로 동적 로드한다. 이는 인간 인지를 닮았다 — 우리는 코퍼스 전체를 암기하지 않고 파일 시스템·받은편지함·북마크 같은 외부 색인을 만들어 필요할 때 꺼낸다 [ECE].

식별자의 **메타데이터 자체가 신호**다. `tests` 폴더의 `test_utils.py`와 `src/core_logic/`의 `test_utils.py`는 에이전트에게 다른 의미다. 폴더 계층, 명명 규칙, 타임스탬프가 모두 정보다 [ECE].

트레이드오프도 명시되어 있다. 런타임 탐색은 사전 계산된 데이터를 꺼내는 것보다 **느리다**. 그리고 제대로 된 안내가 없으면 에이전트는 툴을 오용하거나 막다른 길을 쫓으며 컨텍스트를 낭비한다 [ECE].

### 4) 반복한다 → 툴 설명은 단순하게
*Then: Repeat yourself / Now: Simple tool descriptions*

과거 모델은 지시를 반복해줘야 했고, 컨텍스트 시작보다 끝에 있는 지시를 더 잘 따르는 경향이 있었다. 그래서 시스템 프롬프트에도 툴 언급을 넣고 툴 설명에도 지시를 넣었다 [NR].

이 반복을 삭제하고, **툴 사용법은 툴 설명에만** 두는 것으로 바꿨다 [NR].

### 5) CLAUDE.md에 메모리 → Auto-memory
*Then: Memory in CLAUDE.md files / Now: Auto-memory*

`#` 핫키로 CLAUDE.md에 자동 기록하도록 권장하던 방식은 끝났다. Claude가 작업과 사용자에게 관련된 메모리를 알아서 저장한다 [NR].

이는 [ECE]의 **structured note-taking(agentic memory)**과 같은 계열이다. 에이전트가 컨텍스트 윈도우 바깥의 메모리에 노트를 쓰고 나중에 다시 끌어온다. 컨텍스트 리셋 이후에도 자기 노트를 읽고 멀티시간 작업을 이어간다 [ECE].

### 6) 단순 Spec → Rich References
*Then: Simple specs / Now: Rich references*

플랜 모드는 마크다운 플랜 파일에 크게 의존해 왔다. 이제 Claude는 훨씬 복잡한 레퍼런스를 다룰 수 있다 [NR]:

- **HTML 아티팩트** — artifacts 기능으로 생성한 것
- **코드** — spec이 상세한 테스트 스위트일 수도, 다른 코드베이스에서 포팅할 함수일 수도 있다
- **Rubric** — 특정 분야에서 "좋은 API 설계란 무엇인가" 같은 취향을 Claude가 검증하게 만든다. dynamic workflows로 rubric을 든 verifier 에이전트를 띄운다

---

## 2. 계층별 역할

[NR]의 "Applying this to your context" 절.

### System Prompt

제품 컨텍스트에 강하게 묶인다. Claude가 **어떤 제품 안에서 무엇을 하고 있는지**를 알려준다. Claude Code를 쓴다면 이걸 수정할 일은 거의 없다. 하지만 **자체 에이전트 하네스를 만든다면 여기에 많은 시간을 써야 한다** [NR].

[ECE]는 시스템 프롬프트의 품질 기준을 **"right altitude"**로 정의한다. 두 실패 모드 사이의 골디락스 존이다:

- **너무 낮음** — 정확한 에이전트 동작을 끌어내려고 복잡하고 부서지기 쉬운 if-else 로직을 프롬프트에 하드코딩한다. 취약해지고 유지보수 복잡도가 시간이 갈수록 커진다.
- **너무 높음** — 모호하고 고수준인 가이드라서 원하는 출력에 대한 구체적 신호를 주지 못하거나, 공유된 맥락이 있다고 잘못 가정한다.
- **최적** — 행동을 효과적으로 안내할 만큼 구체적이되, 모델에게 강한 휴리스틱을 줄 만큼 유연하다 [ECE].

섹션으로 나누고(`<background_information>`, `<instructions>`, `## Tool guidance`, `## Output description` 등) XML 태그나 마크다운 헤더로 구분하되, **정확한 포매팅의 중요도는 모델이 유능해지면서 낮아지고 있다** [ECE].

목표는 기대 동작을 온전히 서술하는 **최소 정보 집합**이다. 여기서 minimal은 반드시 short를 뜻하지 않는다. 가장 좋은 모델로 최소 프롬프트를 먼저 테스트하고, 초기 테스트에서 발견한 실패 모드에 근거해 지시와 예시를 더한다 [ECE].

### CLAUDE.md

**가볍게 유지한다.** 레포가 무엇을 위한 것인지 짧게 서술하고, **토큰의 대부분은 코드베이스 안의 gotcha에 쓴다** [NR].

[NR]의 예시: 타입을 하나의 거대한 파일에만 모아두는 식으로 코드를 조직했다면, 그런 것이 gotcha다.

**Claude가 파일 시스템이나 레포를 보면 알 수 있는 '당연한' 것을 적지 않는다** [NR].

긴 섹션에는 progressive disclosure를 적극 쓴다. 예를 들어 작업 검증 방법에 고유한 지시가 여럿 있다면, **verification skill을 만들고 CLAUDE.md에서 참조**한다 [NR].

메커니즘 측면에서 CLAUDE.md는 하이브리드 전략의 "미리 넣는 쪽"이다 — CLAUDE.md는 앞단에 소박하게(naively) 컨텍스트로 들어가고, glob·grep 같은 프리미티브가 just-in-time 탐색을 담당한다 [ECE].

### Skills

**필요할 때 Claude가 정보를 찾게 해주는 가벼운 가이드**로 생각한다 [NR].

- **과도하게 제약하지 않는다.** 단, 매우 중요한 영역은 예외 [NR].
- 긴 Skill은 progressive disclosure를 최대한 적용해 **여러 파일로 쪼갠다** [NR].
- **당신·팀·제품에 고유한 의견, 지식, 관행을 인코딩할 때 가장 잘 작동한다** [NR].

### References

`@` 멘션으로 파일을 레퍼런스로 포함한다. 현재 플랜에 대한 심층 정보를 참조하게 해준다 [NR].

spec 파일, 목업, 심지어 코드베이스 전체가 될 수 있다. **일반적으로 코드로 된 파일을 선호해야 한다** — 모델이 아주 잘 아는 언어로 명확하고 고충실도(high-fidelity)의 지시를 주기 때문이다. 디자인이라면 **HTML 목업이 디자인 설명이나 스크린샷보다 대체로 더 나은 결과를 낸다** [NR].

### 계층 요약

| 계층 | 언제 로드되나 | 무엇을 담나 | 무엇을 담지 않나 |
| --- | --- | --- | --- |
| System Prompt | 항상 | 제품 컨텍스트, 에이전트의 정체와 임무 | 레포별 사실 |
| CLAUDE.md | 항상 (앞단 주입) | 레포가 뭔지 한 줄, gotcha, Skill/Reference 위치 | 파일 시스템으로 알 수 있는 것, 메모리성 기록 |
| Skills | 해당 작업일 때만 | 작업 절차, 팀·제품 고유의 의견 | 항상 필요한 정보, 과도한 절대 규칙 |
| References | 명시적으로 참조될 때 | 상세 지식 — 코드 > 테스트 > HTML 목업 > 산문 | 요약본 |

---

## 3. 지시 충돌이 왜 비용인가

이 레포에서 가장 중요한 진단이다. 정본의 근거는 두 갈래로 온다.

### 3.1 관찰된 현상

Anthropic이 자사 내부 Claude Code 사용 트랜스크립트를 읽었을 때, **하나의 요청 안에서 서로 충돌하는 메시지가 여럿** 발견됐다. 시스템 프롬프트·Skill·사용자 요청이 서로 부딪히면서 이런 것들이 동시에 존재했다 [NR]:

> "leave documentation as appropriate" / "DO NOT add comments"

[NR]의 진단 문장:

> 일반적으로 Claude는 사용자 의도를 해석해 올바른 답에 도달할 수 있다. **그러나 Claude는 무엇을 할지 결정하기 전에 이 겹치고 충돌하는 메시지들에 대해 더 신중하게 생각해야만 한다.**

핵심은 여기다. **충돌은 에이전트를 망가뜨리지 않는다. 에이전트에게 요금을 청구한다.** 결과는 대체로 여전히 맞다. 다만 그 정답에 도달하는 데 더 많은 것을 쓴다.

### 3.2 왜 그게 비싼가 — 메커니즘

[ECE]가 그 요금의 정체를 설명한다.

**컨텍스트는 한계수익이 체감하는 유한 자원이다.** 컨텍스트 윈도우의 토큰 수가 늘수록 그 컨텍스트에서 정보를 정확히 회수하는 모델의 능력이 떨어진다 — **context rot**. 어떤 모델은 더 완만하게 저하되지만, 이 특성은 **모든 모델에서 나타난다** [ECE].

인간에게 작업기억 용량 한계가 있듯 LLM에는 **attention budget**이 있다. **새로 들어오는 모든 토큰이 이 예산을 얼마간 소모한다** [ECE].

구조적 이유도 명시되어 있다. 트랜스포머는 모든 토큰이 다른 모든 토큰에 attend할 수 있고, 이는 n개 토큰에 대해 **n² 쌍관계**를 만든다. 컨텍스트 길이가 늘면 이 쌍관계를 포착하는 능력이 얇게 늘어나며, **컨텍스트 크기와 attention 초점 사이에 자연스러운 긴장**이 생긴다 [ECE].

이제 두 소스를 겹치면 충돌의 비용이 나온다. 충돌하는 지시는 **두 번 청구한다**:

1. **토큰 비용** — 지시 자체가 attention budget을 소모한다. 지워도 되는 지시였다면 이 소모는 순손실이다.
2. **추론 비용** — 모델이 "무엇을 할지 결정하기 전에 더 신중하게 생각"해야 한다 [NR]. 충돌 해소에 쓰인 attention은 실제 작업에 쓰이지 않은 attention이다.

그래서 [ECE]의 지도 원리는 이렇게 정식화된다:

> *good* context engineering means finding the *smallest possible* set of high-signal tokens that maximize the likelihood of some desired outcome.

충돌하는 지시는 정의상 **high-signal이 아니다**. 서로를 상쇄해 신호 대비 토큰 비율을 떨어뜨린다.

### 3.3 충돌이 생기는 구조적 이유

충돌은 누가 나쁜 규칙을 써서 생기지 않는다. **규칙의 소유 위치가 정해져 있지 않아서** 생긴다.

[NR]의 "Then: Repeat yourself"가 정확히 이 문제다. 같은 지시를 시스템 프롬프트에도, 툴 설명에도 두는 관행 자체가 충돌의 온상이었다. 두 사본은 시간이 지나면 갈라진다. 해법은 반복을 지우고 **한 곳에만 두는 것**이었다 [NR].

[ECE]도 같은 실패를 툴 쪽에서 지적한다:

> 가장 흔한 실패 모드 중 하나는 기능이 지나치게 겹치거나 어떤 툴을 써야 할지 모호한 결정 지점을 만드는 비대한 툴 세트다. **인간 엔지니어가 주어진 상황에서 어떤 툴을 써야 할지 단정할 수 없다면, AI 에이전트가 더 잘하리라 기대할 수 없다** [ECE].

이 기준은 지시에도 그대로 적용된다. **사람이 읽고 어느 지시가 이기는지 단정할 수 없다면, 모델도 못 한다.**

### 3.4 그래서 무엇을 하는가

정본이 제시하는 대응은 삭제와 소유권 확정이다.

- 최악의 시나리오를 막던 제약들은 **많은 경우 삭제해도 되고, 모델이 주변 컨텍스트와 판단을 쓰게 두면 된다** [NR].
- 반복은 제거하고 지시를 한 계층에만 둔다 [NR].
- 규칙을 남길 때는 **왜와 경계가 명확한 형태**로 남긴다 — [NR]이 새 시스템 프롬프트에서 절대 금지 대신 "주변 코드처럼 쓰라"는 한 줄로 바꾼 것이 그 예다.
- 최소 프롬프트에서 시작하고, 실제 실패 모드가 관측될 때만 지시를 추가한다 [ECE].

[ECE]의 결론 문장이 방향을 못 박는다:

> 더 똑똑한 모델은 더 적은 처방적(prescriptive) 엔지니어링을 요구한다.

---

## 4. 장기 작업에서의 컨텍스트 관리

[ECE]가 컨텍스트 윈도우를 초과하는 작업을 위해 제시하는 세 기법. 하네스 설계에 직접 관련된다.

- **Compaction** — 한계에 근접한 대화를 요약해 새 컨텍스트 윈도우로 재시작한다. 아키텍처 결정, 미해결 버그, 구현 세부는 보존하고 중복 툴 출력은 버린다. 압축 프롬프트는 **먼저 recall을 최대화해 튜닝한 뒤 precision을 올린다.** 가장 안전하고 가벼운 형태는 **tool result clearing**이다 [ECE].
- **Structured note-taking** — 컨텍스트 윈도우 밖 메모리에 노트를 쓰고 나중에 되가져온다. 최소 오버헤드로 지속 메모리를 만든다 [ECE].
- **Sub-agent architectures** — 서브에이전트가 깨끗한 컨텍스트 윈도우로 집중 작업을 하고, 수만 토큰을 탐색하더라도 **1,000~2,000 토큰의 압축된 요약만 반환**한다. 상세 검색 컨텍스트는 서브에이전트 안에 격리된다 [ECE].

선택 기준 [ECE]:

- Compaction — 광범위한 왕복이 필요한 작업의 대화 흐름 유지
- Note-taking — 명확한 마일스톤이 있는 반복적 개발
- Multi-agent — 병렬 탐색이 이득인 복잡한 리서치·분석

---

## 5. 모델이 이미 하는 일을 지시하지 않는다

[P5]가 더하는 층위다. 위 [§1](#1-then--now--6가지-전환)은 [NR]을 따라 **어떤 종류의 규칙이 낡았는지**를 말했고, [§3](#3-지시-충돌이-왜-비용인가)은 [ECE]를 따라 **왜 그게 비싼지**를 말했다. [P5]는 **Claude Opus 5가 실제로 어떻게 행동하는지**를 말한다. 그래서 지울 항목을 종류가 아니라 **이름으로** 짚을 수 있다.

원리는 §3의 충돌 비용과 같은 계열이되 대상이 다르다. §3은 *지시끼리* 부딪히는 경우였다. 여기서는 **지시가 모델의 기본 행동과 겹친다.** 겹친 지시는 상쇄되지 않고 **증폭된다** — [P5]의 표현으로 `compound with the model's own behavior`. 결과는 과잉 행동이고, 그 대가는 토큰이다.

### 5.1 지워야 하는 것

**과잉검증.** [P5]에서 가장 강한 문장이다.

> Claude Opus 5 verifies its own work without being told to. If your prompt contains explicit verification instructions ("include a final verification step for any non-trivial task," "use a subagent to verify"), **remove them**: instructions like these cause over-verification on Claude Opus 5, and removing them reduces wasted tokens with no loss in quality. **The same applies to legacy harness scaffolding that adds separate verification steps.** [P5]

`legacy harness scaffolding`이라고 하네스를 직접 지목한다. 이 레포가 다루는 대상이다. 이 진술이 [NR]의 verification skill 예시와 어떤 관계인지는 [structure-patterns.md §6](structure-patterns.md)에서 다룬다 — **결론부터 말하면 모순이 아니라 조건이 붙는다.**

**자기교정 재확인.** `double-check your answer`, `re-verify before responding` 류. [P5]는 이것을 검증 지시와 같은 부류로 묶고, 같은 이유로 지우라고 한다 — 비용만 늘고 결과는 나아지지 않는다 [P5].

**리뷰 범위 축소 지시.** 이건 지워야 하는 이유가 다르다. 낭비가 아니라 **역효과**다.

> If your review prompt says "only report high-severity issues" or "be conservative," the model may follow that instruction literally and report less; **ask it to report everything and filter in a separate pass instead.** [P5]

보수적으로 쓰라는 지시가 모델을 신중하게 만드는 게 아니라 **덜 보고하게** 만든다. 발견과 필터링을 한 지시에 섞지 말고 패스를 분리하라는 것이다.

### 5.2 반대로 새로 넣어야 하는 것

[P5]를 "지우기 문서"로만 읽으면 절반을 놓친다. Opus 5의 기본값이 이동한 방향 때문에 **이전에는 필요 없던 지시가 필요해진** 항목이 있다.

| 행동 | 기본값 | 대응 |
| --- | --- | --- |
| 사용자 응답 길이 | 이전 Opus보다 길다 | effort를 낮춰도 안 짧아진다. **명시적으로 간결함을 요구**해야 한다 [P5] |
| 작업 중 나레이션 | 곧 할 일을 자주 예고한다 | 줄이려면 **원하는 케이던스와 형태를 서술**한다. 하지 말라는 지시보다 원하는 스타일의 긍정 예시가 낫다 [P5] |
| 디스크에 쓰는 문서 길이 | 이전보다 길다 | 대화 장황함과 별개 축이다. **길이 캘리브레이션을 따로** 준다 [P5] |
| 작업 범위 | 요청에 없던 단계를 더하거나 스스로 재정의할 수 있다 | 좁은 작업에는 **범위를 명시적으로 제약**한다 [P5] |
| 서브에이전트 위임 | 이전 모델보다 적극적이다 | 어떤 상황이 위임 대상인지 안내하거나 **결정론적 상한**을 건다 [P5] |

여기서 [P5]가 제시하는 범위 제약 문구는 [NR]이 말한 **좋은 규칙의 형태**를 그대로 따른다 — 금지가 아니라 조건과 예외 경로가 있는 서술이다.

> Deliver what was asked, at the scope intended. Make routine judgment calls yourself, and check in only when different readings of the request would lead to materially different work. If the request seems mistaken or a better approach exists, say so in a sentence and continue with the task as asked rather than quietly narrowing, widening, or transforming it. [P5]

`NEVER expand scope` 같은 절대 금지가 아니다. **무엇을 스스로 판단하고 무엇을 물어야 하는지의 경계**를 준다. [NR]의 "주변 코드처럼 작성한다"와 같은 계열이다.

### 5.3 판정 기준

[P5]의 항목들은 하나의 질문으로 압축된다.

> **이 지시가 없으면 모델이 안 할 일인가?**

- 안 할 일이다 → 남긴다.
- 어차피 할 일이다 → 지운다. 겹치면 증폭되고, 증폭은 토큰이다.
- 기본값이 반대 방향이다 → **오히려 새로 써야 한다** (§5.2).

[ECE]의 정식화와 같은 자리로 수렴한다 — *최소한의 high-signal 토큰 집합*. 모델이 이미 하는 일을 적은 토큰은 정의상 signal이 아니다.

> 더 똑똑한 모델은 더 적은 처방적(prescriptive) 엔지니어링을 요구한다. [ECE]

단, [P5]가 보여주듯 **적은 것이 곧 짧은 것은 아니다.** 기본 행동이 원하는 것과 어긋나는 지점에는 새 지시가 들어간다. 줄일 곳과 채울 곳을 가르는 것은 길이가 아니라 **모델의 기본값이 어디에 있는가**다.

---

## 6. 이 레포가 취하는 입장

정본이 반복해서 말하는 한 문장:

> **"do the simplest thing that works"** [ECE]

그리고 [NR]의 마지막 권고는 도구화다 — 시스템 프롬프트·Skill·CLAUDE.md 전반을 단순화해야 하며, `/doctor`가 이를 자동으로 돕는다.

여기서 이 레포의 존재 이유가 나온다. **원칙은 이미 짧다. 어려운 것은 원칙이 아니라 적용이다.** 어떤 규칙이 이 레포의 gotcha이고 어떤 것이 지워도 되는 잔소리인지는 레포 바깥에서 알 수 없다. 그래서 이 마켓플레이스는 답을 배포하지 않고 **질문 세트를 배포한다**.
