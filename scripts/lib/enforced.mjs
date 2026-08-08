// 문서에서 규칙을 지워도 되는지 판정한다.
//
// `tooling-over-docs.md`는 도구가 강제할 수 있는 규칙을 문서에서 빼라고 말한다. 그
// 문장에서 "할 수 있다"와 "하고 있다"는 다른 것이고, 자동 삭제가 걸려 넘어지는 자리가
// 정확히 그 차이다. 린터가 원리상 막을 수 있는 규칙을 문서에서 지웠는데 그 레포에
// 플러그인이 깔려 있지 않으면, 규칙은 옮겨간 것이 아니라 사라진 것이다.
//
// 그래서 여기서 답하는 질문은 "가능한가"가 아니라 "지금 이 레포에서 돌고 있는가"다.
// 답은 넷이고, 지워도 되는 것은 첫 번째뿐이다.
//
//   full     규칙이 있고 스코프 제한이 없다
//   partial  있는데 일부 경로에만 걸린다 — judgement-calls.md의 절반 강제
//   none     설정에 없다
//   unknown  설정을 읽지 못했다
//
// `unknown`을 `none`과 분리하는 이유는 이 레포가 다른 곳에서 감사하는 실패 양식과
// 같다. 돌지 않은 검사는 통과한 검사처럼 보이면 안 되고, 읽지 못한 설정은 규칙이 없는
// 설정처럼 보이면 안 된다. 둘 다 삭제를 막지만 소유자에게 하는 말이 다르다.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseJsonc } from "./jsonc.mjs";

// flat config를 실행하지 않고 텍스트로 읽는다. import()는 그 설정이 선언한 플러그인이
// 대상 레포에 설치되어 있을 때만 성공하고, 감사는 `node_modules`가 없는 레포에서도
// 답을 내놓아야 한다. 실행 실패를 "규칙 없음"으로 읽으면 지우면 안 되는 것을 지운다.
const ESLINT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc.json",
  ".eslintrc.js",
  ".eslintrc.cjs",
];

const PRETTIER_CONFIGS = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  ".prettierrc.mjs",
  "prettier.config.js",
  "prettier.config.mjs",
  "prettier.config.cjs",
];

// 경계 판정자 셋 중 eslint 밖에 있는 것. 인터뷰 Q0이 읽으라고 이름을 대는 셋 중 하나다.
const DEPENDENCY_CRUISER_CONFIGS = [
  ".dependency-cruiser.js",
  ".dependency-cruiser.cjs",
  ".dependency-cruiser.mjs",
  ".dependency-cruiser.json",
  ".dependency-cruiser.jsonc",
  "dependency-cruiser.config.js",
  "dependency-cruiser.config.cjs",
  "dependency-cruiser.config.mjs",
];

// 설정 안의 객체 블록을 균형 잡힌 중괄호로 잘라낸다. 정규식으로 `files:`와 규칙 이름을
// 따로 찾으면 둘이 같은 블록에 있었는지 알 수 없고, 그 정보가 없으면 `full`과 `partial`이
// 구분되지 않는다. 문자열과 주석 안의 중괄호는 세지 않는다 — 메시지에 `{`가 든 규칙이
// 흔하다.
function blocks(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "{") {
      i++;
      continue;
    }
    const start = i;
    let depth = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        i++;
        while (i < text.length) {
          if (text[i] === "\\") {
            i += 2;
            continue;
          }
          if (text[i] === quote) break;
          i++;
        }
        i++;
        continue;
      }
      if (c === "/" && text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        i = end === -1 ? text.length : end + 2;
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      i++;
    }
    out.push(text.slice(start, i));
  }
  return out;
}

// 규칙 이름이 실제로 켜져 있는 블록을 찾는다. `'off'`나 `0`으로 꺼둔 것은 있는 것이
// 아니다 — 꺼진 규칙을 근거로 문서에서 문장을 빼면 아무것도 강제하지 않는 상태가 된다.
function findRule(configs, name) {
  const hits = [];
  for (const { path, text } of configs) {
    for (const block of blocks(text)) {
      const at = block.indexOf(name);
      if (at === -1) continue;
      const after = block.slice(at + name.length, at + name.length + 40);
      if (/^\s*['"`]?\]?\s*:?\s*\[?\s*['"]?(off|0)\b/.test(after)) continue;
      // `files: [...]`가 같은 블록에 있으면 그 규칙은 거기 적힌 경로에만 걸린다.
      const scope = block.match(/files\s*:\s*\[([^\]]*)\]/);
      hits.push({ path, scope: scope ? scope[1].replace(/\s+/g, " ").trim() : null });
    }
  }
  return hits;
}

const verdict = (hits, { configsRead }) => {
  if (!hits.length) return configsRead ? { state: "none" } : { state: "unknown", why: "읽을 수 있는 eslint 설정이 없다" };
  const scoped = hits.filter((h) => h.scope);
  if (scoped.length === hits.length)
    return {
      state: "partial",
      where: hits.map((h) => `${h.path} (${h.scope})`),
      why: "이 경로들에만 걸린다. 다른 경로는 아무도 막지 않는다",
    };
  return { state: "full", where: hits.map((h) => h.path) };
};

// 대상 레포에서 지금 강제되고 있는 것들. 각 항목이 자기 근거를 지니고 다니는 이유는,
// "강제된다"는 주장이 확인 없이 오갈 때가 이 판정이 쓸모없어지는 순간이기 때문이다.
export function readEnforcement(target) {
  const readIf = (p) => (existsSync(join(target, p)) ? readFileSync(join(target, p), "utf8") : null);

  const eslintConfigs = ESLINT_CONFIGS.map((p) => ({ path: p, text: readIf(p) })).filter((c) => c.text !== null);
  const configsRead = eslintConfigs.length > 0;
  const ctx = { configsRead };

  const pkgRaw = readIf("package.json");
  let pkg = null;
  try {
    pkg = pkgRaw ? JSON.parse(pkgRaw) : null;
  } catch {
    /* 깨진 package.json은 레포에 대한 발견이지 여기서 던질 이유가 아니다 */
  }
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const scripts = pkg?.scripts ?? {};
  const scriptText = Object.values(scripts).join(" ");

  const tsconfig = readIf("tsconfig.json");
  const compilerOptions = tsconfig ? (parseJsonc(tsconfig)?.compilerOptions ?? null) : null;

  const checks = {};

  // 포매팅. 설정만으로는 강제가 아니다. 이 레포의 tooling-over-docs.md가 자기 자신에게
  // 요구하는 것과 같은 조건이다 — 아무 명령도 부르지 않는 포매터는 아무것도 강제하지
  // 않는다.
  const prettierConfig = PRETTIER_CONFIGS.find((p) => readIf(p) !== null) ?? (pkg?.prettier ? "package.json#prettier" : null);
  const prettierRuns = /\bprettier\b/.test(scriptText);
  checks.formatting = prettierConfig
    ? prettierRuns
      ? { state: "full", where: [prettierConfig, "package.json scripts"] }
      : { state: "none", why: `${prettierConfig}는 있는데 어떤 스크립트도 prettier를 부르지 않는다` }
    : { state: "none", why: "포매터 설정이 없다" };

  // import 순서. 플러그인이 있어도 포매터가 돌지 않으면 정렬은 일어나지 않는다.
  const sortPlugin = Object.keys(deps).find((d) => /prettier-plugin-sort-imports|eslint-plugin-import\b/.test(d));
  checks["import-order"] = !sortPlugin
    ? { state: "none", why: "import 정렬 플러그인이 없다" }
    : checks.formatting.state === "full"
      ? { state: "full", where: [sortPlugin, "package.json scripts"] }
      : { state: "none", why: `${sortPlugin}는 있는데 그것을 돌리는 명령이 없다` };

  // 타입 엄격도. tsconfig와 eslint 중 하나만 있어도 강제되지만, 근거는 어느 쪽인지
  // 밝힌다. `any` 금지는 두 도구가 서로 다른 범위로 막는다.
  const anyRule = verdict(findRule(eslintConfigs, "@typescript-eslint/no-explicit-any"), ctx);
  const strict = compilerOptions?.strict === true || compilerOptions?.noImplicitAny === true;
  checks["no-explicit-any"] =
    anyRule.state === "full"
      ? anyRule
      : strict
        ? { state: "full", where: ["tsconfig.json (strict/noImplicitAny)"] }
        : anyRule;

  // 레이어 방향. 판정자는 셋이고, 셋 다 인터뷰 Q0이 읽으라고 이름을 대는 것들이다.
  // 하나만 찾으면 그 하나를 쓰지 않는 레포가 전부 `none`으로 나오고, 그 `none`은
  // "아무것도 강제하지 않는다"로 읽힌다. 이 플러그인이 고른 플러그인을 안 쓴다는 사실을
  // 경계가 없다는 사실로 보고하는 것이고, 그것은 틀린 주장이다.
  //
  // 그래도 셋이 전부라고 주장하지는 않는다. 못 찾았을 때의 `why`가 무엇을 찾았는지
  // 열거하는 이유가 그것이다 — 주장의 범위를 찾은 것에 맞춰 좁혀 둔다.
  const layerJudges = [];
  const layerMisses = [];

  const boundariesReferenced = eslintConfigs.some((c) => /boundaries/.test(c.text));
  if (deps["eslint-plugin-boundaries"] && boundariesReferenced) layerJudges.push("eslint-plugin-boundaries");
  else if (deps["eslint-plugin-boundaries"]) layerMisses.push("eslint-plugin-boundaries는 설치만 되고 설정에서 쓰이지 않는다");
  else layerMisses.push("eslint-plugin-boundaries가 없다");

  // `import/no-restricted-paths`는 규칙 하나이므로 스코프가 붙을 수 있고, 그러면
  // 절반 강제다. 그 판정은 `verdict`이 소유한다. 플러그인이 없으면 판정자로 세지
  // 않는다 — 설치되지 않은 플러그인을 참조하는 설정은 절반 강제가 아니라 크래시다.
  let restrictedPaths = verdict(findRule(eslintConfigs, "import/no-restricted-paths"), ctx);
  if (restrictedPaths.state === "unknown") layerMisses.push("eslint 설정을 읽지 못해 import/no-restricted-paths를 확인할 수 없다");
  else if (restrictedPaths.state === "none") layerMisses.push("import/no-restricted-paths가 설정에 없다");
  else if (!deps["eslint-plugin-import"]) {
    layerMisses.push("import/no-restricted-paths가 설정에 있는데 eslint-plugin-import가 설치되어 있지 않다");
    restrictedPaths = { state: "none" };
  } else if (restrictedPaths.state === "full") layerJudges.push("import/no-restricted-paths");
  else layerMisses.push(`import/no-restricted-paths가 ${restrictedPaths.why}`);

  // dependency-cruiser는 eslint 밖이라 포매터와 같은 조건이 붙는다. 설정만으로는
  // 강제가 아니고, 그것을 부르는 명령이 있어야 한다.
  const cruiserConfig = DEPENDENCY_CRUISER_CONFIGS.find((p) => readIf(p) !== null);
  const cruiserRuns = /\b(depcruise|dependency-cruiser)\b/.test(scriptText);
  if (cruiserConfig && cruiserRuns) layerJudges.push(`dependency-cruiser (${cruiserConfig})`);
  else if (cruiserConfig) layerMisses.push(`${cruiserConfig}는 있는데 어떤 스크립트도 dependency-cruiser를 부르지 않는다`);
  else layerMisses.push("dependency-cruiser 설정이 없다");

  checks["layer-direction"] = layerJudges.length
    ? { state: "full", where: layerJudges }
    : restrictedPaths.state === "partial"
      ? { state: "partial", where: restrictedPaths.where, why: restrictedPaths.why }
      : configsRead || cruiserConfig
        ? { state: "none", why: `찾은 판정자가 없다 — ${layerMisses.join("; ")}` }
        : { state: "unknown", why: "읽을 수 있는 eslint 설정도 dependency-cruiser 설정도 없다" };

  // 슬라이스 격리와 상대경로 금지는 같은 규칙 하나로 막는 레포가 많다. 스코프가 붙어
  // 있으면 절반 강제이고, 그 판정이 여기 있는 이유의 절반이다.
  const restricted = findRule(eslintConfigs, "no-restricted-imports");
  checks["slice-isolation"] = checks["layer-direction"].state === "full" ? checks["layer-direction"] : verdict(restricted, ctx);

  const relativeHits = [
    ...findRule(eslintConfigs, "import/no-relative-parent-imports"),
    ...restricted.filter((h) =>
      eslintConfigs.some((c) => c.path === h.path && /\.\.\/|\.\.\*|no-relative/.test(c.text)),
    ),
  ];
  checks["relative-imports"] = verdict(relativeHits, ctx);

  checks["no-console"] = verdict(findRule(eslintConfigs, "no-console"), ctx);
  checks["unused-vars"] = verdict(
    [...findRule(eslintConfigs, "@typescript-eslint/no-unused-vars"), ...findRule(eslintConfigs, "no-unused-vars")],
    ctx,
  );

  // 패키지 매니저. 문서에 "npm 쓰지 마라"라고 적는 대신 도구가 거절하게 만드는 것이
  // 가능하고, 그 도구가 있는지는 읽어서 안다.
  const onlyAllow = /only-allow/.test(scriptText);
  checks["package-manager"] = pkg?.packageManager
    ? { state: onlyAllow ? "full" : "partial", where: ["package.json#packageManager"], why: onlyAllow ? undefined : "corepack을 쓰지 않는 환경은 이것을 무시한다. only-allow가 붙으면 거절이 된다" }
    : onlyAllow
      ? { state: "full", where: ["only-allow"] }
      : { state: "none", why: "packageManager 필드도 only-allow도 없다" };

  return {
    checks,
    read: {
      eslint: eslintConfigs.map((c) => c.path),
      tsconfig: tsconfig ? "tsconfig.json" : null,
      prettier: prettierConfig,
      packageJson: Boolean(pkg),
    },
  };
}

// 삭제 처치가 물어야 하는 유일한 질문. `full`이 아니면 지우지 않는다.
export function mayDelete(enforcement, key) {
  const c = enforcement?.checks?.[key];
  if (!c) return { ok: false, reason: `"${key}"는 이 판정기가 답할 수 있는 항목이 아니다` };
  if (c.state === "full") return { ok: true, evidence: c.where };
  if (c.state === "partial") return { ok: false, reason: `절반만 강제된다: ${c.why}`, where: c.where };
  if (c.state === "unknown") return { ok: false, reason: c.why };
  return { ok: false, reason: c.why ?? "이 레포에서 강제되지 않는다" };
}
