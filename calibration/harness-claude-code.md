
# 캘리브레이션: Claude Code 하네스

```json
{
  "axis": "harness",
  "harness": "claude-code",
  "values": {
    "memory_location": {
      "value": "auto-memory",
      "note": "하네스가 스스로 기억을 저장한다. CLAUDE.md는 메모리 저장소가 아니다.",
      "source": "NR - Then: Memory in CLAUDE.md files / Now: Auto-memory"
    },
    "progressive_disclosure_mechanisms": {
      "value": ["skills", "ToolSearch를 통한 지연 도구 로딩", "@로 언급하는 레퍼런스"],
      "source": "NR - Then: Put it all upfront / Now: Use progressive disclosure"
    },
    "rightsizing_tool": {
      "value": "claude doctor",
      "source": "NR - Try simplifying"
    }
  }
}
```

모델 세대와는 별개의 축이다. 이 값들은 레포가 어떤 하네스로 굴러가는지에 달렸지, 뒤에
어떤 모델이 있는지에 달리지 않았다. 같은 Opus 5라도 다른 하네스에서는 `/doctor`도,
auto-memory도, ToolSearch도 없다.

떼어 놓은 이유는, 새 모델 세대가 조용히 새 제품 기능을 주장하지 않게 하고 새 하네스
버전이 모델 변화처럼 보이지 않게 하려는 것이다.

`claude-md.memory-log`가 소비한다 (CLAUDE.md의 메모리 로그는 하네스가 그것을 놓을 다른
자리를 가졌을 때만 발견이 된다).

`source`의 영어는 인용이라 번역하지 않는다. 아카이브된 영어 원문의 절 제목을 그대로
가리킨다.
