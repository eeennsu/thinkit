
# 캘리브레이션: Claude 5 세대

```json
{
  "axis": "model",
  "generation": "claude-5",
  "values": {
    "model_defaults": {
      "value": {
        "self_verification": "on",
        "self_correction": "on",
        "narration": "high",
        "response_length": "long",
        "written_document_length": "long",
        "scope_expansion": "likely",
        "subagent_delegation": "eager"
      },
      "phrases": [
        "include a final verification step",
        "use a subagent to verify",
        "double-check your answer",
        "re-verify before responding",
        "do not think",
        "do not reason",
        "최종 검증 단계를 포함",
        "서브에이전트로 검증",
        "답을 다시 확인",
        "응답 전에 재검증",
        "생각하지 마라",
        "추론하지 마라"
      ],
      "source": "P5 - Response length and verbosity; User-facing progress updates; Written deliverable length; Task scope and over-verification; Controlling subagent spawning; Self-correction"
    },
    "review_instruction_form": {
      "value": { "cutoff_instructions": "harmful", "required_form": "전부 보고하고, 필터링은 별도 패스에서" },
      "phrases": [
        "only report high-severity",
        "be conservative",
        "높은 심각도만 보고",
        "심각도가 높은 것만",
        "보수적으로",
        "진짜 문제만"
      ],
      "source": "P5 - Code review and bug-finding"
    },
    "claude_md_budget": {
      "value": null,
      "unset_reason": "숫자를 제시하는 1차 소스가 없다. 강제는 `claude doctor`에 위임한다.",
      "source": null
    }
  }
}
```

모델 세대와 함께 움직이는 값들. 축 자체는 `principles/`에 살고, 그 축 위의 위치만 여기
있다.

모든 값은 `source`를 지닌다. 1차 소스 인용이 없는 값은 `null`이고 unset으로 다뤄진다 —
스킬은 탈락시키거나 묻지, 추측하지 않는다.

`source`와 `phrases`의 영어는 번역하지 않는다. `source`는 아카이브된 영어 원문의 절
제목을 그대로 가리키는 인용이고, 번역하면 가리키던 절을 찾을 수 없다. `phrases`는 감사
대상 하네스에서 찾을 문자열이므로 영어 하네스와 한국어 하네스 양쪽 항목을 함께 둔다 —
영어 항목을 지우면 영어로 쓰인 하네스에서 컷오프 지시를 놓친다.

## model_defaults

> Claude Opus 5는 시키지 않아도 자기 작업을 검증한다. 프롬프트에 명시적인 검증 지시가
> 있다면 ... 지워라 ... 별도 검증 단계를 덧붙이는 레거시 하네스 뼈대에도 똑같이
> 적용된다.

소비자는 둘이다.

- 인터뷰 **Q3**는 오직 `self_verification: on`이기 때문에 존재한다. 어떤 세대가 그것을
  `off`로 뒤집으면 Q3는 탈락하고 검증 스킬은 제안되지 않는다. 인터뷰의 나머지는 바뀌지
  않는다.
- `instruction.duplicates-model-default`는 `phrases`를 판단 패스의 출발점으로 쓰지,
  자동 실패로 쓰지 않는다.

기본값은 반대 방향으로도 움직인다 — 응답, 문서, 서술, 범위, 위임 모두 전보다 길거나
넓게 돈다. 그 방향은 지울 지시가 아니라 *더할* 지시를 낳고, 그래서 이 값은 지울 것들의
목록이 아니라 표다.

## review_instruction_form

> 리뷰 프롬프트에 "높은 심각도 문제만 보고하라"거나 "보수적으로 하라"가 있으면, 모델은
> 그 지시를 문자 그대로 따라 덜 보고할 수 있다. 대신 전부 보고하게 하고 별도 패스에서
> 필터링하라.

`review.cutoff-instruction`이 소비한다. 캘리브레이션 항목 중 유일하게
`severity: error`다 — 컷오프 지시는 토큰을 낭비하는 게 아니라 발견을 없앤다.

## claude_md_budget

일부러 unset이다. 1차 소스가 크기 조정을 위해 가리키는 도구는 `/doctor`다. `check.mjs`는
토큰 추정치를 여전히 보고하되, 판정하지 않는다. 숫자를 보고하는 것과 숫자를 판정하는
것은 다른 행위이고, 우리에게 없는 임계값이 필요한 쪽은 두 번째뿐이다.

## 여기 없는 것

세대에 의존하는 관찰 일곱 개(규칙/판단 다이얼 위치, 레퍼런스 복잡도 상한, 프롬프트 형식의
격식, 지시 위치 편향, 실효 컨텍스트 예산, effort 기본값, thinking 비활성 시의 부산물)는
`docs/calibration-notes.md`에 기록되어 있다. 어떤 스킬이나 스크립트도 그것들을 소비하지
않는다. 아무도 읽지 않는 값은 메모이고, 메모로 정리해 두었다.
