// 레포의 마크다운을 복사하지 않고 읽는 컬렉션 로더. 문서를 site/ 안으로 옮기면 GitHub에서
// 읽히던 경로가 바뀌고, 복사본을 두면 두 벌이 갈라진다. 그래서 원본 위치를 그대로 두고
// 여기서 라우트만 붙인다. 원본 파일에 frontmatter를 더하지 않는 것도 같은 이유다 —
// GitHub는 YAML frontmatter를 표로 렌더해서 문서 첫 화면을 망친다.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");

// 소스 -> 라우트. 이 표가 라우트의 유일한 정의이고, remark 플러그인도 여기서 읽는다.
// 표를 두 벌 두면 링크 변환과 실제 라우트가 갈라지고, 갈라진 링크는 404로 배포된다.
export const REPO_ROOTS = [
  { dir: "docs", route: (name) => `docs/${name}` },
  { dir: "docs/references", route: (name) => `docs/references/${name}` },
  { dir: "principles", route: (name) => `docs/principles/${name}` },
  { file: "modules/fsd/rationale.md", route: "docs/modules/fsd-rationale" },
];

// 사이트에 라우트가 없지만 링크 대상으로는 정당한 레포 파일. 문서가 기여자에게
// `../CLAUDE.md`를 가리킬 때 그 대상은 사이트의 페이지가 아니라 레포의 파일이다.
// 사이트 라우트로 억지로 만들면 없는 페이지가 생기고, 그대로 두면 404가 배포된다.
// 그래서 GitHub 원본으로 보낸다 — 그리고 여기 없는 대상은 계속 throw다.
export const GITHUB_BLOB = "https://github.com/eeennsu/thinkit/blob/main";
export const REPO_FILE_LINKS = new Set(["CLAUDE.md", "README.md", "AGENTS.md"]);

const toPosix = (p) => p.split("\\").join("/");

/**
 * 레포 루트 기준 상대 경로 -> 사이트 라우트 id. 매핑 밖이면 null.
 *
 * 모양만 보고 라우트를 만들면 안 된다. `docs/principels.md` 같은 오타는 매핑된 디렉터리
 * 안에 있으므로 모양이 맞고, 그대로 `/docs/principels/`라는 존재하지 않는 라우트가 된다 —
 * 링크가 라우트로 바뀌었으니 플러그인은 throw하지 않고, 빌드는 초록으로 끝난다.
 * 라우트는 실재하는 파일에서만 나온다.
 */
export function routeForRepoFile(repoRelPath) {
  const rel = toPosix(repoRelPath).replace(/^\.\//, "");
  if (!existsSync(join(repoRoot, rel))) return null;
  for (const entry of REPO_ROOTS) {
    if (entry.file) {
      if (entry.file === rel) return entry.route;
      continue;
    }
    if (posix.dirname(rel) !== entry.dir) continue;
    if (!rel.endsWith(".md")) continue;
    return entry.route(posix.basename(rel, ".md"));
  }
  return null;
}

/** 레포 루트 기준 상대 경로 -> 라우트가 없는 레포 파일의 GitHub 원본 URL. 아니면 null. */
export function githubUrlForRepoFile(repoRelPath) {
  const rel = toPosix(repoRelPath).replace(/^\.\//, "");
  if (!REPO_FILE_LINKS.has(rel)) return null;
  if (!existsSync(join(repoRoot, rel))) return null;
  return `${GITHUB_BLOB}/${rel}`;
}

/** 표가 가리키는 파일 전부. 순서는 표 순서 + 파일명 순으로 고정한다. */
export function collectRepoFiles(roots = REPO_ROOTS) {
  const found = [];
  for (const entry of roots) {
    if (entry.file) {
      const abs = join(repoRoot, entry.file);
      if (existsSync(abs)) found.push({ abs, rel: entry.file, id: entry.route });
      continue;
    }
    const absDir = join(repoRoot, entry.dir);
    if (!existsSync(absDir)) continue;
    const names = readdirSync(absDir)
      .filter((name) => name.endsWith(".md"))
      .filter((name) => statSync(join(absDir, name)).isFile())
      .sort();
    for (const name of names) {
      const rel = `${entry.dir}/${name}`;
      found.push({ abs: join(absDir, name), rel, id: entry.route(posix.basename(name, ".md")) });
    }
  }
  return found;
}

// 선두 HTML 주석은 본문에 남긴다. references/*.md에서 그것이 출처 표시이고, 지우면
// 아카이브본이 재구성본처럼 읽힌다. 대신 description으로도 꺼내 검색 결과와 카드에 보이게 한다.
//
// 선두 H1은 본문에서 뺀다. Starlight가 title로 H1을 다시 그리므로 그대로 두면 한 페이지에
// H1이 둘이 된다.
export function splitDoc(raw, rel) {
  const text = raw.replace(/^\uFEFF/, "");
  const comment = text.match(/^\s*<!--[\s\S]*?-->/);
  const lead = comment ? comment[0] : "";
  const afterLead = text.slice(lead.length);

  const h1 = afterLead.match(/^\s*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/);
  // 제목이 없으면 조용히 파일명을 쓰지 않는다. 파일명은 라우트에서 이미 나오고,
  // 그것을 제목으로 승격하면 제목이 빠진 문서가 제목이 있는 문서처럼 보인다.
  if (!h1) throw new Error(`repo-docs: ${rel} 이 선두 # H1 으로 시작하지 않는다. 제목을 지어내지 않는다.`);

  const description = lead
    ? lead
        .replace(/^<!--/, "")
        .replace(/-->$/, "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ")
    : undefined;

  const body = `${lead}${afterLead.slice(h1[0].length)}`.replace(/^\s*\n/, "");
  return { title: h1[1], description, body };
}

/**
 * @param {object} options
 * @param {Array} [options.repoRoots]        카운트 대상. 레포 루트 유래 문서.
 * @param {number} options.expectedRepoDocs  repoRoots 유래 엔트리에만 적용되는 기대 개수.
 * @param {string} [options.localDir]        site/ 안에 사는 페이지(랜딩). 카운트에서 제외.
 */
export function repoDocs({ repoRoots = REPO_ROOTS, expectedRepoDocs, localDir } = {}) {
  if (typeof expectedRepoDocs !== "number") {
    throw new Error("repo-docs: expectedRepoDocs 가 필요하다. 빈 컬렉션은 에러 없이 빌드된다.");
  }
  // docsLoader()는 src/content/docs를 본다. 다른 값을 받아놓고 무시하면 설정과 동작이
  // 갈라지므로, 지원하지 않는 값은 받는 자리에서 거절한다.
  if (localDir !== undefined && localDir !== "src/content/docs") {
    throw new Error(`repo-docs: localDir 은 'src/content/docs' 만 지원한다: 받은 값 "${localDir}"`);
  }

  return {
    name: "thinkit-repo-docs",
    async load(context) {
      // 로컬 파일이 먼저다. glob 로더는 자기가 이번 실행에 건드리지 않은 엔트리를 전부
      // 지운다 — 뒤에 돌면 방금 넣은 repo 문서 13개가 그 자리에서 사라진다.
      //
      // starlight를 여기서 늦게 부르는 이유는 이 모듈의 매핑 표를 링크 검사기가 읽기
      // 때문이다. 위에서 정적으로 import하면 의존성 없이 도는 스크립트가 아니게 된다.
      if (localDir) {
        const { docsLoader } = await import("@astrojs/starlight/loaders");
        await docsLoader().load(context);
      }

      const files = collectRepoFiles(repoRoots);
      // 빈 컬렉션은 에러가 아니다. 사이드바만 비고 빌드는 초록으로 끝난다. 파일이 늘거나
      // 줄면 이 숫자를 고쳐야 하고, 고치라고 세우는 것이 요점이다.
      if (files.length !== expectedRepoDocs) {
        throw new Error(
          `repo-docs: 레포 문서 ${expectedRepoDocs}개를 기대했는데 ${files.length}개를 찾았다.\n` +
            files.map((f) => `  - ${f.rel}`).join("\n")
        );
      }

      const rootDir = fileURLToPath(context.config.root);
      for (const file of files) {
        const raw = readFileSync(file.abs, "utf8");
        const { title, description, body } = splitDoc(raw, file.rel);
        const data = await context.parseData({
          id: file.id,
          data: description ? { title, description } : { title },
          filePath: file.abs,
        });
        const rendered = await context.renderMarkdown(body, { fileURL: pathToFileURL(file.abs) });
        context.store.set({
          id: file.id,
          data,
          body,
          // Starlight는 파일 기반 로더만 지원하고 filePath가 있다고 가정한다.
          filePath: toPosix(relative(rootDir, file.abs)),
          digest: context.generateDigest(raw),
          rendered,
          assetImports: rendered.metadata?.imagePaths,
        });
      }
    },
  };
}
