#!/usr/bin/env node
// 이미 설정을 가진 레포가 만들어내고 그린필드 픽스처는 만들 수 없는 실패들. alias
// glob이 든 tsconfig, 자기 이름을 이미 소유한 포매터와 린터, 그리고 import 한 줄인
// CLAUDE.md.
//
// 여기 있는 모든 경우는 적히기 전에 실제 레포에서 측정됐다. 샌드박스가 필요 없다.
// eslint를 부르지 않는데, 시험 대상이 생성된 규칙이 무엇을 잡는지가 아니라 스크립트가
// 무엇을 읽고 무엇을 주장하는지이기 때문이다.
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { stripJsonc, parseJsonc } from "../scripts/lib/jsonc.mjs";
import { shadowed } from "../scripts/lib/precedence.mjs";
import { readAlias } from "../scripts/lib/alias.mjs";
import { readEnforcement } from "../scripts/lib/enforced.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = join(root, ".tmp-brownfield");
const keep = process.argv.includes("--keep");

let failed = 0;
const ok = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`); }
};

// alias를 쓰는 프로젝트라면 다 가지는 형태의 tsconfig. 배너 블록 주석, 키에 `/*`가 든
// paths 테이블, 그리고 마지막 살아 있는 항목 뒤의 주석 처리된 항목. glob이 정규식
// 스트리퍼를 망가뜨린 부분이다.
const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    /* Bundler mode */
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@app/*": ["src/app/*"],
      "@widgets/*": ["src/widgets/*"],
      "@features/*": ["src/features/*"],
      "@shared/*": ["src/shared/*"],
      "@db/*": ["src/db/*"]
      // "@utils/*": ["src/shared/utils/*"],
    }
  },
  "include": ["src"],
}`;

console.log("jsonc");
{
  const parsed = parseJsonc(TSCONFIG);
  ok("alias glob이 든 tsconfig가 파싱된다", parsed !== null, "paths 블록이 블록 주석으로 먹혔다");
  ok("alias 다섯 개가 모두 살아남는다", Object.keys(parsed?.compilerOptions?.paths ?? {}).length === 5,
    JSON.stringify(Object.keys(parsed?.compilerOptions?.paths ?? {})));
  const flags = Object.entries(parsed?.compilerOptions ?? {}).filter(([k, v]) => v === true && /^(strict|no|exact)/.test(k));
  ok("strict 계열 플래그가 세어진다", flags.length === 4, `받은 값 ${flags.length}`);
  ok("주석 처리된 경로는 밖에 남는다", !("@utils/*" in (parsed?.compilerOptions?.paths ?? {})));
  ok("문자열 안의 주석 표시는 주석이 아니다",
    parseJsonc('{"a": "http://x.dev/*", "b": 1}')?.a === "http://x.dev/*");
  ok("이스케이프된 따옴표는 문자열을 끝내지 않는다",
    parseJsonc('{"a": "he said \\" // not a comment", "b": 2}')?.b === 2);
  ok("뒤따르는 쉼표는 여전히 허용된다", parseJsonc('{"a": [1, 2,],}')?.a.length === 2);
  ok("정말 깨진 파일은 그대로 null을 반환한다", parseJsonc("{oops") === null);
  ok("stripJsonc는 문자열 내용을 건드리지 않는다", stripJsonc('{"k": "a/*b*/c"}').includes("a/*b*/c"));
}

console.log("precedence");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "eslint.config.js"), "export default [];\n");
  writeFileSync(join(tmp, "eslint.config.mjs"), "export default [];\n");
  writeFileSync(join(tmp, ".prettierrc"), "{}\n");
  writeFileSync(join(tmp, "prettier.config.mjs"), "export default {};\n");

  const e = shadowed(tmp, "eslint.config.mjs");
  ok("eslint.config.js가 우리 .mjs를 가린다", e.shadowed && e.winner === "eslint.config.js", JSON.stringify(e));
  const p = shadowed(tmp, "prettier.config.mjs");
  ok(".prettierrc가 우리 prettier.config.mjs를 가린다", p.shadowed && p.winner === ".prettierrc", JSON.stringify(p));

  rmSync(join(tmp, "eslint.config.js"));
  ok(".js가 사라지면 아무것도 가리지 않는다", shadowed(tmp, "eslint.config.mjs").shadowed === false);

  rmSync(join(tmp, ".prettierrc"));
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ prettier: { semi: false } }) + "\n");
  ok("package.json#prettier도 가린다", shadowed(tmp, "prettier.config.mjs").winner === "package.json#prettier");
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "x" }) + "\n");
  ok("그 키가 없는 package.json은 가리지 않는다", shadowed(tmp, "prettier.config.mjs").shadowed === false);

  ok("모르는 이름은 우선순위를 주장하지 않는다", shadowed(tmp, "tsconfig.json").shadowed === false);

  // 레포는 자기 진입 설정에 우리 것을 펼쳐 넣으라는 말을 듣는다. 그렇게 한 레포는 우리를
  // 함께 로드하는 승자를 가지고, 그것을 가려졌다고 부르면 연결된 하네스를 죽었다고
  // 보고하게 된다.
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "eslint.config.mjs"), "export default [];\n");
  writeFileSync(join(tmp, "eslint.config.boundaries.mjs"), "export default [];\n");
  const ours = ["eslint.config.mjs", "eslint.config.boundaries.mjs"];

  writeFileSync(join(tmp, "eslint.config.js"), "export default [ /* nothing of ours */ ];\n");
  const dead = shadowed(tmp, "eslint.config.mjs", ours);
  ok("우리 것을 무시하는 승자는 가린 것이다", dead.shadowed && dead.via === null);

  writeFileSync(join(tmp, "eslint.config.js"),
    "import boundaries from './eslint.config.boundaries.mjs';\nexport default [...boundaries];\n");
  const wired = shadowed(tmp, "eslint.config.mjs", ours);
  ok("우리 것을 펼쳐 넣는 승자는 아니다", wired.shadowed === false, JSON.stringify(wired));
  ok("그리고 어느 파일이 우리를 로드하는지 보고한다", wired.via === "eslint.config.js");

  // ourFiles 기본값은 묻고 있는 파일이므로 진입 설정 하나만 세어진다.
  writeFileSync(join(tmp, "eslint.config.js"), "import x from './eslint.config.mjs';\nexport default x;\n");
  ok("파일 하나짜리 형태도 작동한다", shadowed(tmp, "eslint.config.mjs").shadowed === false);
}

console.log("alias");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "tsconfig.json"), TSCONFIG);
  const profile = { alias: { "@": "src" } };
  const { alias, source } = await readAlias(tmp, profile);
  ok("프로필이 아니라 레포 자신의 테이블을 읽는다", source === "tsconfig.json", `source=${source}`);
  ok("하나가 아니라 alias 다섯 개", Object.keys(alias).length === 5, JSON.stringify(alias));
  ok("접두어에서 /* 접미사가 벗겨진다", alias["@widgets"] === "src/widgets", JSON.stringify(alias));
}

console.log("CLAUDE.md import");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // 3토큰으로 측정됐던 형태: 포인터 하나, 그리고 하네스는 다른 곳에.
  writeFileSync(join(tmp, "CLAUDE.md"), "@AGENTS.md");
  writeFileSync(join(tmp, "AGENTS.md"), [
    "# Agents",
    "",
    "- src/features/auth/index.ts",
    "- src/features/user/index.ts",
    "- src/widgets/Header/index.tsx",
    "- src/shared/utils/date.ts",
    "- src/entities/post/model.ts",
    "",
    "## 함정",
    "",
  ].join("\n"));

  const out = execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
    { encoding: "utf8" });
  const findings = JSON.parse(out).findings;
  const byId = (id) => findings.find((f) => f.id === id);

  ok("import를 따라간다", !/약 [0-9]토큰/.test(out), "대상이 아니라 포인터를 재고 있다");
  ok("import 뒤의 산문이 판정된다",
    Boolean(byId("claude-md.repo-visible.structural")),
    "import된 파일의 경로형 줄이 보고되지 않았다");
  ok("import된 파일의 함정 제목이 인정된다",
    !findings.some((f) => f.id === "claude-md.gotcha-section" && /함정 섹션이 없다/.test(f.message)));

  // --fix는 포인터 파일에 덧붙여야지, 그것이 가리키는 것을 인라인하면 안 된다.
  execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--fix"],
    { encoding: "utf8" });
  ok("--fix가 import를 한 줄로 남겨 둔다",
    readFileSync(join(tmp, "CLAUDE.md"), "utf8").trim() === "@AGENTS.md",
    readFileSync(join(tmp, "CLAUDE.md"), "utf8").slice(0, 80));

  // 함정 제목이 어디에도 없을 때. 포인터에 붙이면 그 제목은 규칙이 사는 파일이 아니라
  // 규칙을 가리키는 파일에 앉는다 — 실제 레포에서 CLAUDE.md가 `@AGENTS.md`와 빈 함정
  // 제목 한 쌍이 되어 나왔다.
  writeFileSync(join(tmp, "CLAUDE.md"), "@AGENTS.md\n");
  writeFileSync(join(tmp, "AGENTS.md"), "# Agents\n\n규칙 하나.\n");
  execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--fix"],
    { encoding: "utf8" });
  ok("빠진 함정 제목이 포인터가 아니라 import된 파일로 간다",
    /^##\s+함정\s*$/m.test(readFileSync(join(tmp, "AGENTS.md"), "utf8")),
    readFileSync(join(tmp, "AGENTS.md"), "utf8"));
  ok("포인터는 여전히 import 한 줄이다",
    readFileSync(join(tmp, "CLAUDE.md"), "utf8").trim() === "@AGENTS.md",
    readFileSync(join(tmp, "CLAUDE.md"), "utf8").slice(0, 80));

  // 포인터가 자기 산문도 지니면 어느 쪽이 하네스인지 우리가 모른다. 그때는 CLAUDE.md에
  // 남긴다 — 모르면서 남의 파일을 고르지 않는다.
  writeFileSync(join(tmp, "CLAUDE.md"), "# 규칙\n\n@AGENTS.md\n\n여기에도 규칙이 있다.\n");
  writeFileSync(join(tmp, "AGENTS.md"), "# Agents\n\n규칙 하나.\n");
  execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--fix"],
    { encoding: "utf8" });
  ok("import한 쪽에 산문이 있으면 제목은 CLAUDE.md에 남는다",
    /^##\s+함정\s*$/m.test(readFileSync(join(tmp, "CLAUDE.md"), "utf8")) &&
      !/함정/.test(readFileSync(join(tmp, "AGENTS.md"), "utf8")),
    readFileSync(join(tmp, "CLAUDE.md"), "utf8"));

  // 순환은 스택이 무너질 때까지 재귀하지 않고 종료한다.
  writeFileSync(join(tmp, "CLAUDE.md"), "@A.md");
  writeFileSync(join(tmp, "A.md"), "alpha @B.md");
  writeFileSync(join(tmp, "B.md"), "beta @A.md");
  let cycled = true;
  try {
    execFileSync(process.execPath,
      [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
      { encoding: "utf8" });
  } catch {
    cycled = false;
  }
  ok("import 사이의 순환이 종료한다", cycled);

  // 펜스를 마스킹하는 자리표시자는 산문에 나타날 수 없는 것이어야 한다. 구분자가
  // 공백이면 (`" 0 "`) 산문 안의 "공백-숫자-공백"이 전부 fences 인덱스로 매칭되고,
  // 되돌리기가 펜스 블록을 산문 한가운데에 복제해 넣는다. 오염된 본문은 --json에
  // 실리지 않으므로 출력에서 "undefined"를 찾는 것으로는 잡히지 않는다. 발견 개수로
  // 잡는다: 트리가 든 블록 하나에 구조 발견 하나다.
  //
  // 산문의 숫자는 0이어야 한다. 첫 자리표시자가 0번이고, 그것이 실제로 무언가로
  // 치환되는 유일한 인덱스다.
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "CLAUDE.md"), [
    "# t", "", "재시도는 0 회다.", "",
    "```", "src/", "├── a", "└── b", "```", "", "## 함정", "",
  ].join("\n"));
  const maskFindings = JSON.parse(execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
    { encoding: "utf8" })).findings.filter((f) => f.id === "claude-md.repo-visible.structural");
  ok("펜스는 마스킹된 뒤 되돌아온다", maskFindings.length >= 1,
    "펜스가 복원되지 않아 그 안의 트리가 탐지되지 않았다");
  ok("되돌리기가 산문의 숫자에 매칭되지 않는다", maskFindings.length === 1,
    `블록이 하나인데 구조 발견 ${maskFindings.length}건 - 자리표시자가 산문에도 매칭돼 펜스가 복제됐다`);
}

console.log("레이어 디렉터리");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const empty = execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--json"], { encoding: "utf8" });
  ok("빈 레포는 모든 레이어 디렉터리를 받는다",
    ["app", "screens", "widgets", "features", "entities", "shared"].every((l) => existsSync(join(tmp, "src", l))));
  ok("그리고 없는 것에 대한 말은 듣지 않는다", !JSON.parse(empty).notes.some((n) => /여기 없다/.test(n)));

  // 코드가 있는 레포: 이미 가진 레이어만, 디스크에 새로 생기는 것 없이.
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, "src/features/auth"), { recursive: true });
  mkdirSync(join(tmp, "src/shared"), { recursive: true });
  writeFileSync(join(tmp, "src/features/auth/index.ts"), "export {};\n");
  const brown = JSON.parse(execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--json"], { encoding: "utf8" }));
  ok("코드가 있는 레포는 새 레이어 디렉터리를 받지 않는다",
    !existsSync(join(tmp, "src/entities")) && !existsSync(join(tmp, "src/screens")));
  ok("그리고 가진 것들 안에 .gitkeep도 생기지 않는다",
    !existsSync(join(tmp, "src/features/.gitkeep")) && !existsSync(join(tmp, "src/shared/.gitkeep")));
  ok("없는 레이어는 이름이 불린다", brown.notes.some((n) => /entities/.test(n) && /여기 없다/.test(n)),
    JSON.stringify(brown.notes));
  ok("어떤 레이어 디렉터리도 쓰인 것으로 나타나지 않는다",
    !brown.written.some((w) => /^src\/(entities|screens)\//.test(w.path)));

  // 우리 자신의 .gitkeep만 든 디렉터리는 코드가 아니다 — 비어 있을 때 bootstrap한
  // 레포를 다시 돌리면 여전히 그린필드로 세어야 한다.
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, "src/features"), { recursive: true });
  writeFileSync(join(tmp, "src/features/.gitkeep"), "");
  execFileSync(process.execPath, [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp], { encoding: "utf8" });
  ok(".gitkeep만 있는 트리는 여전히 그린필드다", existsSync(join(tmp, "src/entities")));
}

console.log("레이어가 아닌 디렉터리");
{
  rmSync(tmp, { recursive: true, force: true });
  for (const d of ["src/app", "src/features", "src/shared", "src/db", "src/data", "src/.cache"]) {
    mkdirSync(join(tmp, d), { recursive: true });
  }
  const answers = join(tmp, "answers.json");
  writeFileSync(answers, JSON.stringify({ routingRoot: "src/app" }));
  const out = execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "next", "--target", tmp, "--answers", answers, "--json"],
    { encoding: "utf8" });
  const summary = JSON.parse(out);
  const manifest = JSON.parse(readFileSync(join(tmp, ".claude/harness/manifest.json"), "utf8"));
  const config = readFileSync(join(tmp, "eslint.config.boundaries.mjs"), "utf8");

  ok("레이어가 아닌 디렉터리가 탐지된다", manifest.architecture.extraRoots.includes("db"), JSON.stringify(manifest.architecture.extraRoots));
  ok("레이어 디렉터리는 아니다", !manifest.architecture.extraRoots.includes("features"));
  ok("sourceRoot 안의 routingRoot도 아니다", !manifest.architecture.extraRoots.includes("app"),
    "app이 레이어보다 먼저 등록된 라우팅 요소를 가리게 된다");
  ok("점으로 시작하는 디렉터리도 아니다", !manifest.architecture.extraRoots.includes(".cache"));
  ok("그것을 위한 요소가 등록된다", /"type": "db"[\s\S]{0,60}"pattern": "src\/db"/.test(config));
  ok("배치가 드러난다", summary.notes.some((n) => /레이어가 아니다/.test(n)), JSON.stringify(summary.notes));

  // 그래프 맨 아래: 위에서 닿을 수 있고, 맨 아래 레이어에만 닿는다.
  ok("레이어가 그것을 import할 수 있다", /"from"[\s\S]{0,120}"features"[\s\S]{0,160}"db"/.test(config) || config.includes('"type": "db"'));
  ok("맨 아래 위의 레이어는 import할 수 없다",
    !/{\s*"from":\s*{\s*"element":\s*{\s*"type":\s*"db"\s*}\s*},\s*"allow":\s*{\s*"to":\s*{\s*"element":\s*{\s*"type":\s*"features"/.test(config));

  // 명시적인 답변이 이긴다. 빈 답변도 포함해서.
  writeFileSync(answers, JSON.stringify({ routingRoot: "src/app", extraRoots: [] }));
  execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "next", "--target", tmp, "--answers", answers], { encoding: "utf8" });
  const off = JSON.parse(readFileSync(join(tmp, ".claude/harness/manifest.json"), "utf8"));
  ok("명시적인 빈 답변이 탐지를 끈다", off.architecture.extraRoots.length === 0);

  // 이미 레이어인 이름은 그것을 위한 두 번째 요소를 등록하게 된다.
  writeFileSync(answers, JSON.stringify({ extraRoots: ["shared"] }));
  let threw = false;
  try {
    execFileSync(process.execPath,
      [join(root, "scripts/scaffold.mjs"), "next", "--target", tmp, "--answers", answers],
      { encoding: "utf8", stdio: "pipe" });
  } catch { threw = true; }
  ok("레이어 이름을 대면 거부된다", threw);
}

console.log("산문은 AGENTS.md, CLAUDE.md는 포인터");
{
  // 네 가지 시작 상태. 쓰는 것은 CLAUDE.md이 없거나, 우리 것이거나, 이미 포인터일
  // 때뿐이다. 자기 산문을 가진 레포 옆에 AGENTS.md를 새로 만들면 규칙이 두 곳에 살고
  // 어느 쪽도 다른 쪽을 가리키지 않는데, 이 배치가 막으려는 것이 정확히 그 상태다.
  const scaffold = (setup) => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    setup();
    const answers = join(tmp, "answers.json");
    writeFileSync(answers, JSON.stringify({ projectName: "T", oneLine: "한 줄", safetyBoundaries: ["프로덕션 배포"] }));
    return JSON.parse(execFileSync(process.execPath,
      [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--answers", answers, "--json"],
      { encoding: "utf8" }));
  };
  const read = (p) => (existsSync(join(tmp, p)) ? readFileSync(join(tmp, p), "utf8") : null);

  let s = scaffold(() => {});
  ok("빈 레포: 산문은 AGENTS.md로 가고 CLAUDE.md은 포인터 한 줄이다",
    /^##\s+안전 경계\s*$/m.test(read("AGENTS.md") ?? "") && read("CLAUDE.md").trim() === "@AGENTS.md",
    JSON.stringify({ claude: read("CLAUDE.md"), agents: (read("AGENTS.md") ?? "").slice(0, 40) }));

  s = scaffold(() => writeFileSync(join(tmp, "CLAUDE.md"), "# 내 레포\n\n내가 쓴 규칙\n"));
  ok("CLAUDE.md이 자기 산문을 지니면 둘 다 쓰지 않는다",
    read("AGENTS.md") === null && read("CLAUDE.md").includes("내가 쓴 규칙"), read("CLAUDE.md"));
  ok("쓰지 않았다는 것이 노트로 드러난다",
    s.notes.some((n) => /AGENTS\.md를 쓰지 않았다/.test(n)), JSON.stringify(s.notes));

  // 다른 곳을 가리키는 포인터도 남의 산문이다. 덮어쓰면 그 레포의 하네스가 우리 것을
  // 가리키게 되고 원본은 아무도 읽지 않는다.
  s = scaffold(() => {
    writeFileSync(join(tmp, "CLAUDE.md"), "@docs/rules.md\n");
    mkdirSync(join(tmp, "docs"), { recursive: true });
    writeFileSync(join(tmp, "docs/rules.md"), "# 규칙\n");
  });
  ok("다른 파일을 가리키는 포인터는 덮어쓰지 않는다",
    read("AGENTS.md") === null && read("CLAUDE.md").trim() === "@docs/rules.md", read("CLAUDE.md"));

  // 레포가 AGENTS.md만 가진 경우. 산문은 그쪽 것이므로 두고, 없는 CLAUDE.md만 그것을
  // 가리키게 만든다 — 하네스를 옮기는 게 아니라 닿게 하는 것이다.
  s = scaffold(() => writeFileSync(join(tmp, "AGENTS.md"), "# 내 레포\n\n내가 쓴 규칙\n"));
  ok("AGENTS.md만 있으면 그것을 두고 CLAUDE.md만 만든다",
    read("AGENTS.md").includes("내가 쓴 규칙") && read("CLAUDE.md").trim() === "@AGENTS.md",
    JSON.stringify(s.written.filter((w) => /AGENTS|CLAUDE/.test(w.path))));

  s = scaffold(() => writeFileSync(join(tmp, "CLAUDE.md"), "@AGENTS.md\n"));
  ok("손으로 쓴 포인터는 소유권을 주장하지 않고 지나간다",
    s.written.some((w) => w.path === "CLAUDE.md" && w.state === "exists, left alone") &&
      /^##\s+안전 경계\s*$/m.test(read("AGENTS.md")),
    JSON.stringify(s.written.filter((w) => /AGENTS|CLAUDE/.test(w.path))));
}

console.log("갈 곳 없는 답변");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // 브라운필드의 형태: 레포가 이미 소유한 CLAUDE.md. Q2에 답이 있고, 그 답이 쓰는
  // 섹션이 사는 파일이 정확히 그 파일이다.
  writeFileSync(join(tmp, "CLAUDE.md"), "@AGENTS.md\n");
  writeFileSync(join(tmp, "AGENTS.md"), "# Agents\n\n## 함정\n");
  const answers = join(tmp, "answers.json");
  writeFileSync(answers, JSON.stringify({ safetyBoundaries: ["프로덕션 배포", "서명키"] }));

  const out = execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--answers", answers, "--json"],
    { encoding: "utf8" });
  const summary = JSON.parse(out);
  const manifest = JSON.parse(readFileSync(join(tmp, ".claude/harness/manifest.json"), "utf8"));

  ok("CLAUDE.md은 그대로 둔다", summary.written.some((w) => w.path === "CLAUDE.md" && w.state === "exists, left alone"));
  ok("쓰이지 않은 답변은 declared로 기록되지 않는다",
    manifest.declared.safetyBoundaries === false,
    "여기서 declared:true면 check.mjs가 쓰인 적 없는 섹션을 사라졌다고 보고한다");
  ok("떨어진 답변이 삼켜지지 않고 드러난다",
    summary.notes.some((n) => /안전 경계/.test(n)), JSON.stringify(summary.notes));

  // 그리고 예전에 만들어내던 거짓 오류가 나타나지 않는다.
  const checkOut = execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
    { encoding: "utf8" });
  ok("유령 \"섹션이 사라졌다\"가 없다",
    !/섹션이 사라졌다/.test(checkOut), "쓰인 적 없는 섹션에 규칙이 걸렸다");

  // 이 규칙이 실제로 존재하는 이유가 되는 경우: 우리가 산문을 썼고 레포가 그 뒤 섹션을
  // 지웠다. 그것은 여전히 오류여야 한다.
  //
  // 둘 다 지운다. 산문은 AGENTS.md에 살고 CLAUDE.md는 그것을 가리키는 한 줄인데, 레포의
  // AGENTS.md를 남겨두면 그것이 남의 산문이라 우리가 쓰지 않고 — 그러면 지울 섹션도 없다.
  rmSync(join(tmp, "CLAUDE.md"));
  rmSync(join(tmp, "AGENTS.md"));
  execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--answers", answers],
    { encoding: "utf8" });
  const written = JSON.parse(readFileSync(join(tmp, ".claude/harness/manifest.json"), "utf8"));
  ok("우리가 실제로 쓴 섹션은 declared로 기록된다", written.declared.safetyBoundaries === true);
  writeFileSync(join(tmp, "AGENTS.md"),
    readFileSync(join(tmp, "AGENTS.md"), "utf8").replace(/^##\s+안전 경계[\s\S]*?(?=^##\s|$)/m, ""));
  let fired = false;
  try {
    execFileSync(process.execPath,
      [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
      { encoding: "utf8" });
  } catch (e) {
    fired = /섹션이 사라졌다/.test(e.stdout ?? "");
  }
  ok("우리가 쓴 섹션을 지우면 여전히 오류가 난다", fired, "규칙이 자기가 존재하는 이유를 잡지 못하게 됐다");

  // --fix는 제목만 되살린다. 발견이 error인 채로 측정되므로 종료 코드는 여전히 1이다.
  const runFix = () => {
    try {
      return execFileSync(process.execPath,
        [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--fix"],
        { encoding: "utf8" });
    } catch (e) {
      return e.stdout ?? "";
    }
  };
  runFix();
  const repaired = readFileSync(join(tmp, "AGENTS.md"), "utf8");
  ok("--fix가 빠진 안전 경계 제목을 되살린다",
    /^##\s+안전 경계\s*$/m.test(repaired), repaired);
  // 매니페스트는 경계가 선언됐다는 것만 알지 무엇이었는지는 모른다. 알더라도 도로
  // 펼치면 소유자가 일부러 지운 것을 되살리는 것이고, 그건 수리가 아니다.
  ok("되살린 제목 아래는 비어 있다",
    repaired.split(/^##\s+안전 경계\s*$/m)[1].split(/^##\s/m)[0].trim() === "",
    repaired);
  ok("제목이 돌아오면 규칙도 잠잠해진다",
    !/섹션이 사라졌다/.test(runFix()));

  // 두 제목이 함께 빠진 경우. 처치가 메모리에 든 옛 내용에 덧붙이면 나중 것이 먼저
  // 쓴 제목을 지운다 — 둘 다 살아 있는지가 그 확인이다.
  writeFileSync(join(tmp, "AGENTS.md"),
    repaired.replace(/^##\s+안전 경계\s*$/m, "").replace(/^##\s+함정\s*$/m, ""));
  runFix();
  const both = readFileSync(join(tmp, "AGENTS.md"), "utf8");
  ok("제목이 둘 다 빠져 있으면 둘 다 돌아온다",
    /^##\s+함정\s*$/m.test(both) && /^##\s+안전 경계\s*$/m.test(both), both);
}

console.log("경고에 실패하는 레포에서의 warn");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, "src"), { recursive: true });
  const answers = join(tmp, "answers.json");
  writeFileSync(answers, JSON.stringify({ severity: "warn" }));
  const run = (scripts) => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "x", scripts }, null, 2) + "\n");
    return JSON.parse(execFileSync(process.execPath,
      [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--answers", answers, "--json"],
      { encoding: "utf8" })).notes.join("\n");
  };

  ok("--max-warnings 0이면 warn이 error처럼 굴고, 그렇다고 말한다",
    /--max-warnings 0/.test(run({ lint: "eslint . --max-warnings 0" })));
  ok("빌드 결합이 있으면 그것을 짚어 준다",
    /build가 lint를 부른다/.test(run({ lint: "eslint . --max-warnings 0", build: "bun run lint && next build" })));
  ok("없으면 짚지 않는다",
    !/build가 lint를 부른다/.test(run({ lint: "eslint . --max-warnings 0", build: "next build" })));
  ok("경고를 견디는 lint에는 아무 말도 하지 않는다",
    !/max-warnings/.test(run({ lint: "eslint ." })));

  writeFileSync(answers, JSON.stringify({ severity: "error" }));
  ok("severity=error는 이 주석이 다루는 경우가 아니다",
    !/max-warnings/.test(run({ lint: "eslint . --max-warnings 0" })));
}

console.log("devDependency 고정");
{
  const profile = JSON.parse(readFileSync(join(root, "stacks/next/profile.json"), "utf8"));
  const pinned = profile.devDependencies?.[profile.resolver.devDependency];
  if (pinned) {
    const merged = { [profile.resolver.devDependency]: "*", ...profile.devDependencies };
    ok("프로필 자신의 리졸버 고정이 병합을 살아남는다",
      merged[profile.resolver.devDependency] === pinned,
      `기대 ${pinned}, 받은 값 ${merged[profile.resolver.devDependency]}`);
  } else {
    console.log("  skip  next는 자기 리졸버를 고정하지 않는다");
  }
}

// 경계 판정자 셋. `layer-direction`은 인터뷰 Q0이 읽으라고 이름을 대는 셋을 찾는데,
// 셋 다 실제로 인식되는 것을 본 적이 없으면 그 주장은 주장일 뿐이다. 그래서 각 판정자가
// `full`을 내놓는 것을 한 번씩 보고, **아무 판정자도 없는 레포가 조용하지 않은 것**도 본다.
//
// 마지막 두 경우가 이 블록의 요점이다. eslint 설정을 읽고 셋 다 없으면 `none`이고, 읽을
// 설정 자체가 없으면 `unknown`이다. 둘을 합치면 "우리가 고른 플러그인을 안 쓴다"가
// "경계가 없다"로 보고되고, 그것을 근거로 산문을 지우면 규칙은 옮겨간 것이 아니라
// 사라진 것이다.
console.log("경계 판정자");
{
  const fixture = (files) => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    for (const [p, content] of Object.entries(files)) {
      mkdirSync(dirname(join(tmp, p)), { recursive: true });
      writeFileSync(join(tmp, p), typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n");
    }
    return readEnforcement(tmp).checks["layer-direction"];
  };
  const pkg = (deps, scripts = {}) => ({ name: "x", devDependencies: deps, scripts });

  let c = fixture({
    "package.json": pkg({ "eslint-plugin-boundaries": "^7" }),
    "eslint.config.mjs": "import boundaries from 'eslint-plugin-boundaries';\nexport default [{ rules: { 'boundaries/element-types': 'error' } }];\n",
  });
  ok("eslint-plugin-boundaries: 설치되고 참조되면 full", c.state === "full", JSON.stringify(c));

  c = fixture({
    "package.json": pkg({ "eslint-plugin-boundaries": "^7" }),
    "eslint.config.mjs": "export default [{ rules: {} }];\n",
  });
  ok("eslint-plugin-boundaries: 설치만 되면 full이 아니고, 왜인지 말한다",
    c.state !== "full" && /설치만/.test(c.why ?? ""), JSON.stringify(c));

  c = fixture({
    "package.json": pkg({ "eslint-plugin-import": "^2" }),
    "eslint.config.mjs": "export default [{ rules: { 'import/no-restricted-paths': ['error', { zones: [] }] } }];\n",
  });
  ok("import/no-restricted-paths: 스코프 없으면 full", c.state === "full", JSON.stringify(c));

  c = fixture({
    "package.json": pkg({ "eslint-plugin-import": "^2" }),
    "eslint.config.mjs": "export default [{ files: ['src/widgets/**'], rules: { 'import/no-restricted-paths': ['error', { zones: [] }] } }];\n",
  });
  ok("import/no-restricted-paths: 스코프가 붙으면 partial", c.state === "partial", JSON.stringify(c));

  c = fixture({
    "package.json": pkg({}),
    "eslint.config.mjs": "export default [{ rules: { 'import/no-restricted-paths': ['error', { zones: [] }] } }];\n",
  });
  ok("import/no-restricted-paths: 플러그인이 없으면 판정자로 세지 않는다",
    c.state !== "full" && c.state !== "partial" && /설치되어 있지 않다/.test(c.why ?? ""), JSON.stringify(c));

  c = fixture({
    "package.json": pkg({ "dependency-cruiser": "^16" }, { boundaries: "depcruise src" }),
    ".dependency-cruiser.js": "module.exports = { forbidden: [] };\n",
  });
  ok("dependency-cruiser: 설정이 있고 명령이 부르면 full", c.state === "full", JSON.stringify(c));

  c = fixture({
    "package.json": pkg({ "dependency-cruiser": "^16" }),
    ".dependency-cruiser.js": "module.exports = { forbidden: [] };\n",
  });
  ok("dependency-cruiser: 부르는 명령이 없으면 full이 아니고, 왜인지 말한다",
    c.state !== "full" && /부르지 않는다/.test(c.why ?? ""), JSON.stringify(c));

  c = fixture({ "package.json": pkg({}), "eslint.config.mjs": "export default [{ rules: {} }];\n" });
  ok("설정을 읽었는데 셋 다 없으면 none이고, 셋을 다 열거한다",
    c.state === "none" &&
      ["eslint-plugin-boundaries", "import/no-restricted-paths", "dependency-cruiser"].every((n) => c.why.includes(n)),
    JSON.stringify(c));

  c = fixture({ "package.json": pkg({}) });
  ok("읽을 설정이 아예 없으면 none이 아니라 unknown", c.state === "unknown", JSON.stringify(c));
}

if (!keep && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed}건 실패` : "\n전부 통과");
process.exit(failed ? 1 : 0);
