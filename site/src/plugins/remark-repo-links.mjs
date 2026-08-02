// 문서 안의 상대 `.md` 링크를 사이트 라우트로 다시 쓴다. 원본은 GitHub에서 읽히도록
// 쓰였고 그 경로들은 사이트에 존재하지 않는다. 조용히 두면 404가 배포된다.
//
// 매핑은 로더의 표 하나에서 온다. 여기 다시 적으면 사본이 둘이 되고, 둘은 갈라진다.
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { githubUrlForRepoFile, repoRoot, routeForRepoFile } from "../loaders/repo-docs.mjs";

const toPosix = (p) => p.split("\\").join("/");

/** vfile의 path는 문자열일 수도 file:// URL일 수도 있다. 둘 다 절대 경로로 만든다. */
function sourcePath(file) {
  const raw = file?.path ?? file?.history?.[0];
  if (!raw) return null;
  const value = String(raw);
  if (value.startsWith("file://")) return fileURLToPath(value);
  return isAbsolute(value) ? value : resolve(String(file.cwd ?? process.cwd()), value);
}

function walk(node, onLink) {
  if (!node || typeof node !== "object") return;
  if (node.type === "link" || node.type === "definition") onLink(node);
  for (const child of node.children ?? []) walk(child, onLink);
}

export function remarkRepoLinks({ base = "" } = {}) {
  const prefix = base.replace(/\/+$/, "");

  return function transformer(tree, file) {
    const from = sourcePath(file);

    walk(tree, (node) => {
      const url = String(node.url ?? "");
      // 앵커 단독과 프로토콜이 붙은 것은 손대지 않는다. `http://claude.md`처럼 .md로
      // 끝나는 외부 URL이 실재하므로, 확장자보다 프로토콜을 먼저 본다.
      if (!url || url.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return;
      const [target, hash = ""] = url.split("#");
      if (!target.endsWith(".md")) return;

      if (!from) {
        throw new Error(`remark-repo-links: 소스 경로를 모르는 파일에서 상대 링크 "${url}"를 만났다.`);
      }

      const abs = resolve(dirname(from), target);
      const rel = toPosix(relative(repoRoot, abs));

      const route = routeForRepoFile(rel);
      if (route) {
        // Starlight는 디렉터리 형식으로 빌드한다. 끝 슬래시를 붙여 리다이렉트를 한 번 줄인다.
        const routeUrl = `${prefix}/${route}/`;
        node.url = hash ? `${routeUrl}#${hash}` : routeUrl;
        return;
      }

      // 사이트 라우트는 없지만 레포에는 실재하는 파일. 규칙은 로더가 소유한다.
      const github = githubUrlForRepoFile(rel);
      if (github) {
        node.url = hash ? `${github}#${hash}` : github;
        return;
      }

      // 매핑 밖이면 빌드를 세운다. 원문을 그대로 두면 사이트에 없는 경로가 링크로 나간다.
      throw new Error(
        `remark-repo-links: ${toPosix(relative(repoRoot, from))} 의 링크 "${url}" 를 라우트로 바꿀 수 없다. ` +
          `대상 ${rel} 이 로더의 매핑 표에도 REPO_FILE_LINKS에도 없다.`
      );
    });
  };
}

export default remarkRepoLinks;
