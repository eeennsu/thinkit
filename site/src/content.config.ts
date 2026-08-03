import { defineCollection, z } from "astro:content";
import { i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";
import { repoDocs } from "./loaders/repo-docs.mjs";

export const collections = {
  docs: defineCollection({
    // 11은 repo 루트 유래 엔트리에만 적용된다. 랜딩이 같은 컬렉션에 들어와도 이 숫자를
    // 건드리지 못한다 — 12로 고치면 repo 문서 하나가 사라져도 랜딩이 자리를 메워 통과한다.
    // REPO_ROOTS의 exclude로 빠진 것은 세지 않는다. 그래서 exclude에 오타를 내면 개수가
    // 맞지 않아 여기서 세운다.
    loader: repoDocs({ expectedRepoDocs: 10, localDir: "src/content/docs" }),
    schema: docsSchema(),
  }),
  // Starlight의 ko 번역에는 pagefind.* 키가 없다. 그러면 검색 결과 문구가 Pagefind 기본값,
  // 즉 영어로 나간다 — 검색창 라벨은 한국어인데 "7 results for gotcha"가 뜬다.
  // 이 키들은 Starlight 스키마에 없는 것이라 extend로 더한다.
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema({
      extend: z.object({
        "pagefind.clear_search": z.string().optional(),
        "pagefind.load_more": z.string().optional(),
        "pagefind.search_label": z.string().optional(),
        "pagefind.filters_label": z.string().optional(),
        "pagefind.zero_results": z.string().optional(),
        "pagefind.many_results": z.string().optional(),
        "pagefind.one_result": z.string().optional(),
        "pagefind.alt_search": z.string().optional(),
        "pagefind.search_suggestion": z.string().optional(),
        "pagefind.searching": z.string().optional(),
      }),
    }),
  }),
};
