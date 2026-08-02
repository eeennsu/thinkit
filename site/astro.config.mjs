import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { remarkRepoLinks } from "./src/plugins/remark-repo-links.mjs";

// base는 여기 한 번만 산다. 링크 다시 쓰기(remark)와 링크 검사(scripts/verify-links.mjs)가
// 둘 다 이 값을 읽는다. 세 곳에 적으면 배포 경로만 바뀌었을 때 둘이 갈라진다.
//
// 커스텀 도메인은 루트로 서빙된다. 하위 경로가 없으므로 접두사도 없다 — 빈 문자열이다.
// 다시 `<user>.github.io/<repo>` 아래로 내려가면 여기를 "/thinkit"으로 되돌리는 것이
// 전부이고, verify-links가 그때 접두사 검사를 스스로 켠다.
export const BASE = "";

export default defineConfig({
  site: "https://thinkit.eunsu.pro",
  base: `${BASE}/`,
  markdown: {
    processor: unified({ remarkPlugins: [[remarkRepoLinks, { base: BASE }]] }),
  },
  integrations: [
    starlight({
      title: "thinkit",
      // 로케일 하나. 번역본이 없으므로 갈라질 사본 자체가 없고, 경로 접두사도 붙지 않는다.
      // Starlight 내장 ko UI 문자열이 사이드바·검색·목차에 그대로 쓰인다.
      locales: {
        root: { label: "한국어", lang: "ko" },
      },
      customCss: ["./src/styles/custom.css"],
      // 사이드바를 자동 생성하지 않는 이유는 순서 때문이다. 이 문서들은 파일명 순으로 읽는
      // 것이 아니라 원칙 -> 구조 -> 기록 순으로 읽는다. 그리고 여기 적은 slug가 실재하지
      // 않으면 Starlight가 빌드를 세운다 — 로더의 매핑에 대한 두 번째 검사다.
      sidebar: [
        {
          label: "원칙",
          items: [
            { slug: "docs/principles" },
            { slug: "docs/structure-patterns" },
            { slug: "docs/design-log" },
            { slug: "docs/calibration-notes" },
          ],
        },
        {
          label: "판정 기준",
          items: [
            { slug: "docs/principles/gotcha-vs-repo-visible" },
            { slug: "docs/principles/tooling-over-docs" },
            { slug: "docs/principles/ownership-map" },
            { slug: "docs/principles/safety-boundaries" },
          ],
        },
        {
          label: "모듈",
          items: [{ slug: "docs/modules/fsd-rationale" }],
        },
        {
          label: "원문 아카이브",
          items: [
            { slug: "docs/references/01-new-rules-of-context-engineering-claude-5" },
            { slug: "docs/references/02-effective-context-engineering-for-ai-agents" },
            { slug: "docs/references/03-velog-claude-5-context-engineering-ko" },
            { slug: "docs/references/04-prompting-claude-opus-5" },
          ],
        },
      ],
    }),
  ],
});
