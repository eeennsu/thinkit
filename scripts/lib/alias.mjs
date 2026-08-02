// alias 테이블. 대상 레포가 가지고 있으면 거기서 읽는다.
//
// bootstrap은 테이블이 없는 레포를 위해 하나를 생성한다. 이미 import를 해석하는 레포는
// 진짜 테이블을 디스크에 가지고 있고, 두 번째를 생성하면 기존의 모든 import를 해석
// 실패로 보고하는 설정이 나온다 — `boundaries/no-unknown-dependencies`가 켜져 있어서
// 그 실패는 시끄럽고 전면적이다. 이것은 repo-visible 정보이므로 읽지, 절대 지어내지
// 않는다.
//
// babel.config.js는 패턴 매칭이 아니라 실행한다. 그것은 모듈이고 보통 `api`의 함수이며,
// 정규식으로 훑으면 적용되는 alias 블록이 아니라 먼저 나오는 블록을 읽게 된다.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonc } from "./jsonc.mjs";

// 설정이 평가되기에 충분한 만큼의 babel api 객체. 이보다 더 손을 뻗는 설정은 throw하고,
// 호출자는 다음 소스로 흘러간다.
const stubApi = () => {
  const cache = () => {};
  cache.forever = () => {};
  cache.never = () => {};
  cache.using = (f) => f?.();
  cache.invalidate = (f) => f?.();
  return {
    cache,
    env: () => false,
    caller: () => undefined,
    assertVersion: () => {},
    version: "7",
  };
};

function fromBabel(config) {
  const plugins = Array.isArray(config?.plugins) ? config.plugins : [];
  for (const p of plugins) {
    if (!Array.isArray(p) || p[0] !== "module-resolver") continue;
    const alias = p[1]?.alias;
    if (alias && typeof alias === "object") {
      // profile.alias와 같은 형태로 저장한다. 앞의 "./" 없고, 뒤의 슬래시 없음.
      return Object.fromEntries(
        Object.entries(alias).map(([k, v]) => [k, String(v).replace(/^\.\//, "").replace(/\/+$/, "")])
      );
    }
  }
  return null;
}

// tsconfig paths는 패턴 단위다 ("@/*": ["src/*"]). alias 테이블은 접두어 단위라서
// "/*" 형태만 되돌아 매핑된다. 파일 하나를 가리키는 경로는 벗길 접두어가 없으므로
// 통째로 둔다.
function fromTsconfig(raw) {
  // JSONC이고, 이것을 망가뜨린 주석 형태는 `//`가 아니라 Vite 계열 tsconfig마다 딸려
  // 오는 `/* Bundler mode */` 배너였다. 벗기는 작업이 문자열을 인식해야 하는 이유는
  // lib/jsonc.mjs를 보라.
  const parsed = parseJsonc(raw);
  if (!parsed) return null;
  const paths = parsed?.compilerOptions?.paths;
  if (!paths || typeof paths !== "object") return null;
  const out = {};
  for (const [pattern, targets] of Object.entries(paths)) {
    const to = Array.isArray(targets) ? targets[0] : targets;
    if (typeof to !== "string") continue;
    out[pattern.replace(/\/\*$/, "")] = to.replace(/^\.\//, "").replace(/\/\*$/, "");
  }
  return Object.keys(out).length ? out : null;
}

// { alias, source }를 반환한다. `source`를 보고하는 이유는 "alias 15개"가 레포에서
// 왔을 때와 우리가 썼을 때 서로 다른 뜻이기 때문이다.
//
// `ours`는 이 플러그인이 쓴 그대로 바이트가 같은 설정들을 지목한다. 그것들은 건너뛰고,
// 그것이 이 매개변수의 요점 전부다. 첫 실행 뒤에는 우리가 생성한 tsconfig.json이 대상에
// 앉아 있고, 그것을 되읽으면 "우리가 프로필에서 이 테이블을 생성했다"가 "레포가 이미
// 이 테이블을 가지고 있었다"로 바뀌었다. 보고서가 그렇게 말했고 매니페스트가 그렇게
// 기록했으며, 같은 입력에서 두 번째 실행이 첫 번째와 다른 매니페스트를 만들어냈다.
// 레포가 그 뒤 편집한 설정은 이 집합에서 빠지므로 편집된 테이블은 읽힌다 — 그게 맞다.
// 그때쯤이면 그것은 그쪽 것이기 때문이다.
export async function readAlias(target, profile, ours = new Set()) {
  const babelPath = join(target, "babel.config.js");
  if (existsSync(babelPath) && !ours.has("babel.config.js")) {
    try {
      const mod = await import(pathToFileURL(babelPath).href);
      const exported = mod.default ?? mod;
      const config = typeof exported === "function" ? exported(stubApi()) : exported;
      const alias = fromBabel(config);
      if (alias) return { alias, source: "babel.config.js" };
    } catch {
      /* 읽을 수 없는 설정: 내용을 추측하는 대신 다음으로 흘려보낸다 */
    }
  }

  const tsconfigPath = join(target, "tsconfig.json");
  if (existsSync(tsconfigPath) && !ours.has("tsconfig.json")) {
    const alias = fromTsconfig(readFileSync(tsconfigPath, "utf8"));
    if (alias) return { alias, source: "tsconfig.json" };
  }

  return { alias: profile.alias ?? {}, source: "profile" };
}
