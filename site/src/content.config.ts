import { defineCollection } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";
import { repoDocs } from "./loaders/repo-docs.mjs";

export const collections = {
  docs: defineCollection({
    // 13은 repo 루트 유래 엔트리에만 적용된다. 랜딩이 같은 컬렉션에 들어와도 이 숫자를
    // 건드리지 못한다 — 14로 고치면 repo 문서 하나가 사라져도 랜딩이 자리를 메워 통과한다.
    loader: repoDocs({ expectedRepoDocs: 13, localDir: "src/content/docs" }),
    schema: docsSchema(),
  }),
};
