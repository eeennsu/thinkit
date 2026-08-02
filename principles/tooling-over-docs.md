# 도구가 강제할 수 있으면 문서가 되풀이하지 않는다

문서 속 규칙은 요청이다. 린터 속 규칙은 사실이다. 둘 다 두면 요청마다 토큰을 쓰고,
그러면서 서로 어긋난다.

```
린터·포매터·타입체커·훅·권한 설정·CI가 이것을 판정할 수 있는가?
  그렇다 -> 거기로 옮기고 문장을 지운다
  아니다 -> 문서에 남아도 된다
```

이 레포가 도구로 옮긴 것들:

| 규칙 | 도구 |
| --- | --- |
| 레이어 의존 방향 | `boundaries/dependencies` 정책 |
| 레이어 안 슬라이스 격리 | 같은 규칙, `default: "disallow"` |
| Public API (깊은 import 금지) | 같은 규칙, `fileInternalPath` 셀렉터 |
| 타입 엄격도 | `tsconfig.json` |
| 포매팅 | Prettier |
| 레이어 그래프와 일치하는 import 순서 | `@ianvs/prettier-plugin-sort-imports`, `layers.json`에서 생성한 `importOrder` |
| 경로 alias 일관성 | `tsconfig.json`에서 파생 |
| 훅 호출 순서, 낡은 의존성 배열 | `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` |
| 변경에 남은 디버그 출력 | `no-console` |
| 리팩터링 후 안 쓰이게 된 바인딩 | `@typescript-eslint/no-unused-vars`, 빠지려면 `^_` |

마지막 세 개는 지금 코드를 누가 쓰는지 때문에 있다. 각각은 레포가 아니었으면 CLAUDE.md에
넣고 요청마다 값을 치렀을 문장이고, 각각은 동작하는 코드처럼 보이는 실수를 서술한다.
`^_` 접두어는 장식이 아니다. "그렇다, 일부러다"라고 말할 방법이 없는 규칙은 처음 불편할 때
통째로 꺼진다.

"이건 도구가 강제한다"는 주장은 픽스처가 도구의 실제 보고를 확인한 뒤에만 허용된다.
절반만 강제되고 문서에서는 통째로 지워진 규칙은 자동화된 적 없는 규칙보다 나쁘다.
읽는 사람이 덮여 있다고 믿기 때문이다.

`npm run harness:check`, `tests/verify-boundaries.mjs`, `tests/verify-rules.mjs`,
`tests/verify-import-order.mjs`는 그 주장을 믿는 대신 다시 시험할 수 있게 하려고 있다.
위 표에 행을 더하려면, 그중 한 곳의 픽스처가 도구가 위반을 보고하는 것을 보고, 정상인
경우가 깨끗하게 남는 것도 본 뒤여야 한다.

그중 두 행은 의무가 하나 더 있다. 그 도구가 린터가 아니라 포매터이기 때문이다. 포매팅과
import 순서는 무언가 Prettier를 돌리는 동안에만 강제되므로, bootstrap이 `format` 스크립트를
등록하고 `tests/verify-scaffold.mjs`가 그것을 붙들어 둔다. 어떤 명령도 부르지 않는 생성된
설정은 취향이고, 그것을 강제된 규칙으로 세는 것이 바로 이 파일이 금지하려는 주장이다.
