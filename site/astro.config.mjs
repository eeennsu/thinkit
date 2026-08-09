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

// 공유 카드의 og:image는 절대 URL이어야 한다. 여기 한 번 적고 아래에서 둘 다 이 값을 쓴다 —
// 두 번 적으면 도메인을 옮길 때 하나만 따라오고, 따라오지 않은 쪽은 죽은 이미지가 된다.
//
// BASE와 같은 이유로 내보낸다. 링크 검사기가 "본문이 자기 사이트를 절대 URL로 가리키는가"를
// 판정하려면 그 도메인이 무엇인지 알아야 하고, 검사기에 다시 적으면 도메인을 옮긴 날
// 검사기만 옛 도메인을 찾는다.
export const SITE = "https://thinkit.eunsu.pro";

export default defineConfig({
  site: SITE,
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
      // 푸터만 감싼다. 라이선스는 한 페이지의 내용이 아니라 사이트 전체에 대한 사실이라
      // 모든 페이지에 나가야 하고, 랜딩 본문에 적으면 랜딩을 안 거친 독자에게는 없는 것이 된다.
      components: { Footer: "./src/components/Footer.astro" },
      // 가로로 넘치는 영역에 표시를 다는 일은 CSS가 할 수 없다 — 넘쳤는지를 CSS는 모른다.
      // 그리고 안 넘치는 것까지 표시를 달면 그 표시는 아무것도 뜻하지 않게 된다. 그래서 재고
      // 단다. 코드 블록과 표 두 종류가 같은 이유로 넘치므로 한 곳에서 본다 — 두 곳에 적으면
      // 한쪽만 고쳐지는 날이 온다.
      head: [
        // og:image가 없으면 공유 카드가 제목과 설명만 든 채로 나간다. 이미지는 커밋된 자산이
        // 아니라 scripts/og-image.mjs가 빌드 전에 만든 것이다 — 색을 custom.css에서 읽으므로
        // 강조색을 바꾸면 카드도 따라온다.
        { tag: "meta", attrs: { property: "og:image", content: `${SITE}/og.png` } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        {
          tag: "meta",
          attrs: { property: "og:image:alt", content: "thinkit — 하네스 세팅을 묻는 Claude Code 플러그인" },
        },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        {
          tag: "script",
          content: `
addEventListener("DOMContentLoaded", () => {
  const mark = (el) => {
    // 표시는 background-image만 얹으므로 폭을 바꾸지 않는다. 그래서 붙은 채로 다시 재도 값이
    // 같다 — 재기 전에 벗길 필요가 없다.
    const scrollable = el.scrollWidth > el.clientWidth + 1;
    el.classList.toggle("is-scrollable", scrollable);
    // 스크롤되는 영역은 키보드로도 닿아야 한다 (WCAG 2.1.1).
    if (scrollable) el.tabIndex = 0; else el.removeAttribute("tabindex");
    // 가장자리 덮개는 블록이 실제로 칠해진 색이어야 한다. 코드 블록 배경은 shiki 테마에서
    // 오므로 CSS에 리터럴로 적으면 테마를 바꾸는 순간 덮개만 다른 색으로 뜬다.
    //
    // 투명한 배경은 넘긴다. 투명을 그대로 덮개 색으로 쓰면 덮개가 아무것도 덮지 못하고,
    // 끝까지 밀어도 "더 있다"는 표시가 남아 거짓말을 한다. 그때는 CSS의 페이지 배경
    // 기본값으로 떨어지는 편이 낫다 — 표가 이미 그렇게 돈다.
    if (el.tagName === "PRE") {
      const bg = scrollable ? getComputedStyle(el).backgroundColor : "";
      const opaque = bg && !/^(transparent$|rgba\\(.*,\\s*0\\s*\\))/.test(bg);
      if (opaque) el.style.setProperty("--thinkit-code-bg", bg);
      else el.style.removeProperty("--thinkit-code-bg");
    }
  };
  const all = () => document.querySelectorAll("#before-after pre, .sl-markdown-content table").forEach(mark);
  all();
  // 한 번 재고 끝내지 않는다. 폭은 창 크기와 폰트 로딩에 따라 바뀌고 둘 다 첫 측정 뒤에
  // 일어난다. 테마 전환은 코드 블록 배경색을 바꾼다.
  addEventListener("resize", all);
  document.fonts && document.fonts.ready.then(all);
  new MutationObserver(all).observe(document.documentElement, { attributeFilter: ["data-theme"] });
});
`,
        },
      ],
      // 사이드바를 자동 생성하지 않는 이유는 순서 때문이다. 이 문서들은 파일명 순으로 읽는
      // 것이 아니라 정본 -> 구조 -> 판정 기준 순으로 읽는다. 그리고 여기 적은 slug가 실재하지
      // 않으면 Starlight가 빌드를 세운다 — 로더의 매핑에 대한 두 번째 검사다.
      sidebar: [
        // fsd-rationale은 자기 그룹을 갖지 않는다. 항목 하나를 담은 그룹은 그룹이 아니라
        // 들여쓰기이고, 사이드바에 층만 하나 더한다.
        {
          label: "근거",
          items: [
            { slug: "docs/canon" },
            { slug: "docs/structure-patterns" },
            { slug: "docs/modules/fsd-rationale" },
          ],
        },
        {
          label: "판정 기준",
          items: [
            { slug: "docs/principles/gotcha-vs-repo-visible" },
            { slug: "docs/principles/tooling-over-docs" },
            { slug: "docs/principles/ownership-map" },
            { slug: "docs/principles/safety-boundaries" },
            { slug: "docs/principles/boundary-convention" },
          ],
        },
        // 설계 기록과 캘리브레이션 메모는 여기 없다. 사이드바에서만 빼면 내비게이션 없는
        // 페이지로 남아 검색에만 잡히므로, 발행 자체를 하지 않는다 — repo-docs.mjs의 exclude다.
        {
          label: "원문 아카이브",
          items: [
            { slug: "docs/references/01-new-rules-of-context-engineering-claude-5" },
            { slug: "docs/references/02-effective-context-engineering-for-ai-agents" },
            { slug: "docs/references/04-prompting-claude-opus-5" },
          ],
        },
      ],
    }),
  ],
});
