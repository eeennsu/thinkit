#!/usr/bin/env node
// 입력이 틀렸을 때 세 스크립트가 무엇을 하는가.
//
// verify-boundaries와 verify-rules는 생성된 설정이 옳음을 증명한다. 이 파일은 옳을 수
// 없는 경우에 대해 생성기가 정직한지를 증명한다. 잘못된 답변 파일, 소유하지 않은 설정,
// 심어진 적 없는 체커. 각각에 조용한 경로가 하나씩 있었고, 레포에 대한 진실을 보고하는
// 것이 일 전부인 도구가 조용히 틀린 답을 내놓는 것은 이 코드베이스가 출고할 수 있는
// 최악의 결함이다.
//
// 설치도 네트워크도 없다. 여기서 eslint나 prettier를 돌리지 않고 이 레포의 스크립트만
// 돌린다. 그래서 이것이 항상 도는 테스트일 수 있다.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const keep = args.includes("--keep");

let failed = false;
const ok = (msg) => console.log(`ok   ${msg}`);
const bad = (msg) => {
  console.log(`FAIL ${msg}`);
  failed = true;
};
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));

const workspace = mkdtempSync(join(tmpdir(), "thinkit-verify-"));
const fresh = (name) => {
  const dir = join(workspace, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};
const run = (script, argv, cwd) =>
  spawnSync(process.execPath, [join(root, "scripts", script), ...argv], { cwd, encoding: "utf8" });
const scaffold = (target, argv = []) => run("scaffold.mjs", ["react", "--target", target, ...argv], root);
const write = (dir, rel, body) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body, "utf8");
};
const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");

// --- 풀리지 않는 answers -----------------------------------------------------
// 인터뷰 전체가 버려진다. 읽는 것으로 끝내지 않고 테스트할 값어치가 있었던 이유는
// 그 대체값이 뻔히 틀려 보이지 않았기 때문이다. {}는 유효한 답변 집합이고 엄격한
// 기본값을 만들어내는데, 그것이 파일 이름이 언급된 적도 없다는 기색 없이 레포의 답으로
// 보고된다.
{
  const target = fresh("answers-missing");
  const r = scaffold(target, ["--answers", join(target, "nope.json")]);
  check(r.status === 2, "없는 --answers 파일: exit 2");
  check(/그런 파일이 없다/.test(r.stderr), "없는 --answers 파일: 메시지가 문제를 지목한다");
  check(!existsSync(join(target, "CLAUDE.md")), "없는 --answers 파일: 아무것도 쓰이지 않음");
}
{
  const target = fresh("answers-malformed");
  write(target, "answers.json", "{ not json");
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "깨진 --answers: exit 2");
  check(!existsSync(join(target, "CLAUDE.md")), "깨진 --answers: 아무것도 쓰이지 않음");
}
{
  const target = fresh("answers-array");
  write(target, "answers.json", "[]");
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "JSON 배열을 담은 --answers: exit 2");
}

// --- 값이 답이 아닌 answers --------------------------------------------------
{
  const target = fresh("severity-typo");
  write(target, "answers.json", JSON.stringify({ severity: "errors" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "severity 오타: exit 2");
  check(/error, warn, off/.test(r.stderr), "severity 오타: 메시지가 허용값을 나열한다");
}
{
  const target = fresh("routing-imports-string");
  write(target, "answers.json", JSON.stringify({ routingImports: "app" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "routingImports가 문자열: 0이 아닌 종료");
  check(/배열이어야 한다/.test(r.stderr), "routingImports가 문자열: 메시지가 형태를 지목한다");
}
{
  const target = fresh("public-api-typo");
  write(target, "answers.json", JSON.stringify({ publicApi: "enforce" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "publicApi 오타: 조용한 엄격 기본값이 아니라 0이 아닌 종료");
}

// --- 아키텍처 모듈은 슬롯이지 기본값이 아니다 --------------------------------
// 이 블록이 증명하는 것 하나: 경계 규약이 없는 레포도 나머지 하네스를 받을 수 있다.
// 그것이 되지 않는 동안 아키텍처는 이 플러그인이 유일하게 묻지 않고 심는 답이었다.
{
  const target = fresh("module-unknown");
  write(target, "answers.json", JSON.stringify({ architecture: "fsdd" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "모르는 아키텍처 모듈: 프로필 기본값으로 떨어지는 대신 exit 2");
  check(/있는 모듈/.test(r.stderr), "모르는 아키텍처 모듈: 메시지가 있는 모듈을 나열한다");
  check(!existsSync(join(target, "CLAUDE.md")), "모르는 아키텍처 모듈: 아무것도 쓰이지 않음");
}
{
  // 이름이 곧 경로다. routingRoot가 레포 바깥을 가리킬 수 있었던 것과 같은 부류이고,
  // 여기서는 플러그인 바깥의 아무 디렉터리나 모듈로 읽히는 형태가 된다.
  const target = fresh("module-escape");
  write(target, "answers.json", JSON.stringify({ architecture: "../stacks/react" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "플러그인을 빠져나가는 모듈 이름: 거부");
}
{
  const target = fresh("module-none");
  write(target, "answers.json", JSON.stringify({ architecture: "none" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 0, "architecture=none: exit 0");
  check(!existsSync(join(target, "eslint.config.boundaries.mjs")), "architecture=none: 경계 설정을 쓰지 않는다");
  // 진입 설정이 없는 파일을 import하면 그 레포는 첫 린트에서 죽는다. 경계 설정을
  // 안 쓰는 것과 그것을 안 쓰는 진입 설정을 쓰는 것은 함께 가야 한다.
  const entry = read(target, "eslint.config.mjs");
  check(!/eslint\.config\.boundaries/.test(entry), "architecture=none: 진입 설정이 없는 파일을 import하지 않는다");
  check(/react-hooks\/rules-of-hooks/.test(entry), "architecture=none: 나머지 린트 규칙은 그대로 나간다");
  // 나머지 하네스가 전부 나가는 것이 이 답의 요점이다. 경계가 없다고 산문과 체커까지
  // 빠지면 "경계 규약 없음"은 답이 아니라 플러그인을 못 쓰는 이유가 된다.
  for (const f of ["CLAUDE.md", "AGENTS.md", "tsconfig.json", "prettier.config.mjs", ".claude/harness/check.mjs"])
    check(existsSync(join(target, f)), `architecture=none: ${f}는 그대로 나간다`);
  check(!existsSync(join(target, "src/entities")), "architecture=none: 있지도 않은 레이어 디렉터리를 만들지 않는다");
  const pkg = JSON.parse(read(target, "package.json"));
  check(!("eslint-plugin-boundaries" in pkg.devDependencies), "architecture=none: 아무것도 로드하지 않을 플러그인을 설치하라고 하지 않는다");
  check("eslint" in pkg.devDependencies, "architecture=none: 린터 자체는 그대로 요구한다");

  const rep = run("report.mjs", ["react", "--target", target], root);
  check(rep.status === 0, "architecture=none: 보고서 exit 0");
  check(/아키텍처 모듈\s+none/.test(rep.stdout), "보고서가 어느 모듈로 돌았는지 말한다");
  // 표시 없는 0은 생성되지 못한 규칙으로 읽힌다. 여기서의 0은 답이다.
  check(/레이어 방향\s+0\s+.*architecture=none/.test(rep.stdout), "0이 구멍이 아니라 답이라고 적힌다");
}
{
  // 조일 것이 없는 모듈에 조임 답변이 도착하면, 그 답변은 갈 곳이 없다. 조용히 버리면
  // 레포는 publicApi를 답했는데 아무것도 그것을 강제하지 않는 하네스를 받는다.
  const target = fresh("module-none-variant");
  write(target, "answers.json", JSON.stringify({ architecture: "none", publicApi: "enforced" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "경계 없는 모듈에 publicApi 답변: 조용히 버리는 대신 0이 아닌 종료");
}

// --- 형태가 그 형태가 아닌 answers -------------------------------------------
// 둘 다 파일을 손으로 쓰는 사람이 만들어내는 것이고, 둘 다 쓰인 자리에서 잡히지
// 않았다. 첫 번째는 파일이 이미 디스크에 올라간 뒤 .map에서 죽었고, 두 번째는 출고됐다.
{
  const target = fresh("list-as-string");
  write(target, "answers.json", JSON.stringify({ safetyBoundaries: "프로덕션 배포 없음" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "목록 답변을 문자열로 준 경우: exit 2");
  check(/문자열 배열이어야 한다/.test(r.stderr), "목록 답변을 문자열로 준 경우: 메시지가 형태를 지목한다");
  check(!existsSync(join(target, "CLAUDE.md")), "목록 답변을 문자열로 준 경우: 아무것도 쓰이지 않음");
}
{
  const target = fresh("list-of-objects");
  write(target, "answers.json", JSON.stringify({ exceptions: [{ note: "legacy" }] }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(/문자열만 담아야 한다/.test(r.stderr), "객체 목록: [object Object]로 렌더되기 전에 거부된다");
}
{
  const target = fresh("oneline-object");
  write(target, "answers.json", JSON.stringify({ oneLine: { ko: "…" } }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "oneLine이 객체: 누군가의 CLAUDE.md에 [object Object]가 아니라 exit 2");
}

// --- 순진한 검사는 통과하면서 아무것도 강제하지 않는 routingRoot 값 -----------
{
  const target = fresh("routing-dot-slash");
  write(target, "answers.json", JSON.stringify({ routingRoot: "./app" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 0, "routingRoot를 ./app으로 쓴 경우: 받아들여짐");
  const boundaries = read(target, "eslint.config.boundaries.mjs");
  check(/"pattern": "app"/.test(boundaries), "routingRoot를 ./app으로 쓴 경우: 정규화되어 요소 패턴이 매칭될 수 있다");
  check(existsSync(join(target, "app/.gitkeep")), "routingRoot를 ./app으로 쓴 경우: 디렉터리가 요청된 자리에 생긴다");
}
{
  const target = fresh("routing-root-dot");
  write(target, "answers.json", JSON.stringify({ routingRoot: "." }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "routingRoot가 '.': 레포 루트를 라우팅 요소로 등록하는 대신 거부");
}
{
  const target = fresh("routing-escape");
  write(target, "answers.json", JSON.stringify({ routingRoot: "../outside" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "레포를 빠져나가는 routingRoot: 거부");
  check(!existsSync(join(target, "../outside")), "레포를 빠져나가는 routingRoot: 대상 바깥에 아무것도 쓰이지 않음");
}

// --- 정상 경로, 그리고 그것이 등록하는 것 ------------------------------------
const main = fresh("happy");
{
  const r = scaffold(main);
  check(r.status === 0, "scaffold react: exit 0");
  const pkg = JSON.parse(read(main, "package.json"));
  check(Boolean(pkg.scripts["harness:check"]), "package.json: harness:check 등록됨");
  check(Boolean(pkg.scripts.lint), "package.json: lint 등록됨");
  // 포매터는 레이어 그래프에서 파생한 import 순서와 함께 생성되고, report.mjs는 그것을
  // 도구가 강제하는 규칙으로 센다. 아무것도 그것을 부르지 않아서, 그 개수는 존재하지
  // 않는 명령에 대한 주장이었다.
  check(Boolean(pkg.scripts.format), "package.json: format 등록됨, 그래서 생성된 import 순서가 실행 가능하다");
  check(existsSync(join(main, ".claude/harness/check.mjs")), "심어짐: check.mjs");
  check(existsSync(join(main, ".claude/harness/rules.principles.json")), "심어짐: rules.principles.json");

  const again = spawnSync(
    process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", main, "--json"],
    { cwd: root, encoding: "utf8" }
  );
  const summary = JSON.parse(again.stdout);
  const changed = summary.written.filter((w) => w.state !== "unchanged");
  check(changed.length === 0, `재실행이 멱등하다 (${changed.map((c) => `${c.path}:${c.state}`).join(", ") || "다시 쓴 것 없음"})`);
  // 그렇지 않았던 이유. 두 번째 실행 때는 우리가 생성한 tsconfig.json이 대상에 앉아
  // 있고, 그것을 되읽으면 우리가 쓴 테이블이 레포가 이미 가지고 있던 것으로 보고됐다.
  check(summary.aliasSource === "profile", `재실행도 alias 테이블의 출처를 그대로 보고한다 (받은 값: ${summary.aliasSource})`);
}

// --- 레포가 실제로 소유한 테이블은 덮어쓰지 않고 읽는다 ----------------------
{
  const target = fresh("repo-alias");
  write(target, "tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "~/*": ["app/*"], "@lib/*": ["lib/*"] } } }, null, 2) + "\n");
  const r = spawnSync(
    process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", target, "--json"],
    { cwd: root, encoding: "utf8" }
  );
  const summary = JSON.parse(r.stdout);
  check(summary.aliasSource === "tsconfig.json", "이 하네스가 쓰지 않은 tsconfig는 레포의 alias 테이블로 읽힌다");
  check(summary.aliases === 2, `레포의 alias 두 개가 모두 잡힌다 (받은 값 ${summary.aliases})`);
}

// --- 이미 있는 스크립트는 레포의 것이다 --------------------------------------
{
  const target = fresh("own-scripts");
  write(target, "package.json", JSON.stringify({ name: "x", scripts: { lint: "biome check", format: "biome format" } }, null, 2) + "\n");
  scaffold(target);
  const pkg = JSON.parse(read(target, "package.json"));
  check(pkg.scripts.lint === "biome check", "이미 있는 lint 스크립트는 교체되지 않는다");
  check(pkg.scripts.format === "biome format", "이미 있는 format 스크립트는 교체되지 않는다");
}

// --- 심어진 사본은 자기가 지니지 않은 모드를 돌릴 수 없다 --------------------
{
  const planted = join(main, ".claude/harness/check.mjs");
  const noMode = spawnSync(process.execPath, [planted, "--target", main], { encoding: "utf8" });
  check(noMode.status === 2, "--mode 없는 심어진 check.mjs: exit 2");
  check(!/ERR_MODULE_NOT_FOUND/.test(noMode.stderr), "--mode 없는 심어진 check.mjs: 모듈 해석 크래시가 아니다");
  check(/심어진 사본/.test(noMode.stderr), "--mode 없는 심어진 check.mjs: 메시지가 이유를 말한다");

  const principles = spawnSync(process.execPath, [planted, "--mode", "principles", "--target", main], { encoding: "utf8" });
  check(principles.status === 0, "심어진 check.mjs --mode principles: exit 0");
}
{
  // --mode 오타가 예전엔 그냥 돌았다. 기계 판정 principle 규칙 말고는 전부 그것들을
  // 건너뛰는 분기로 흘러갔고, 결과는 대부분 일어나지 않은 검사의 짧고 깨끗한 보고서였다.
  const r = run("check.mjs", ["--mode", "principle", "--target", main], root);
  check(r.status === 2, "모르는 --mode: 실제로 돈 규칙의 보고서가 아니라 exit 2");
  check(/principles, full/.test(r.stderr), "모르는 --mode: 메시지가 진짜 모드를 나열한다");
}

// --- --fix는 아무것도 가리키지 않는 스크립트를 만들지 않는다 -----------------
{
  const target = fresh("fix-unplanted");
  write(target, "package.json", JSON.stringify({ name: "x" }, null, 2) + "\n");
  write(target, "CLAUDE.md", "# x\n");
  const r = run("check.mjs", ["--mode", "principles", "--target", target, "--fix"], root);
  const pkg = JSON.parse(read(target, "package.json"));
  check(r.status === 0, "심어지지 않은 레포에 --fix: exit 0");
  check(!pkg.scripts?.["harness:check"], "심어지지 않은 레포에 --fix: 없는 체커를 위한 harness:check를 등록하지 않는다");
  check(/## 함정/.test(read(target, "CLAUDE.md")), "심어지지 않은 레포에 --fix: 함정 제목은 그래도 더해진다");
}

// --- --fix는 레포 자신의 포매팅을 지킨다 -------------------------------------
{
  const target = fresh("fix-indent");
  scaffold(target);
  // 네 칸 들여쓰기, 마지막 개행 없음. 우리 것이 아니라 레포에 속한 파일에 대해
  // JSON.stringify(…, 2) + "\n"이 조용히 바꿔버린 두 가지다.
  const pkg = JSON.parse(read(target, "package.json"));
  delete pkg.scripts["harness:check"];
  writeFileSync(join(target, "package.json"), JSON.stringify(pkg, null, 4), "utf8");
  run("check.mjs", ["--mode", "principles", "--target", target, "--fix"], root);
  const after = read(target, "package.json");
  check(JSON.parse(after).scripts["harness:check"] !== undefined, "하네스가 심어져 있으면 --fix가 harness:check를 등록한다");
  check(/\n {4}"/.test(after), "--fix가 네 칸 들여쓰기를 보존한다");
  check(!after.endsWith("\n"), "--fix가 마지막 개행 없음을 보존한다");
}

// --- 보고서는 이 하네스가 소유한 것을 센다 -----------------------------------
{
  const target = fresh("own-prettier");
  write(target, "prettier.config.mjs", "export default { semi: false };\n");
  scaffold(target);
  const r = run("report.mjs", ["react", "--target", target], root);
  check(r.status === 0, "자기 prettier 설정을 가진 레포에 대한 보고서: exit 0");
  const format = r.stdout.split("\n").find((l) => l.includes("포매팅"));
  check(/포매팅\s+0/.test(format ?? ""), `우리가 쓰지 않은 prettier 설정은 0으로 센다 (받은 값: ${format?.trim()})`);
  check(/import 순서\s+0/.test(r.stdout), "그리고 그것이 실어 나르지 않는 import 순서도 함께 0으로 센다");
  check(read(target, "prettier.config.mjs").includes("semi: false"), "레포 자신의 prettier 설정은 그대로 둔다");
}
{
  const r = run("report.mjs", ["--target", main], root);
  check(r.status === 2, "스택 인자 없는 보고서: 사용법과 함께 exit 2");
}
{
  // 진짜 tsconfig.json은 JSONC다. 블록 주석과 뒤따르는 쉼표가 거기서는 합법이고
  // JSON.parse에는 치명적인데, 이것이 숫자가 출력되기 전에 돌아서 누군가의 tsconfig에
  // 있는 주석 하나가 보고서 전체를 죽였다.
  const target = fresh("jsonc-tsconfig");
  scaffold(target);
  write(target, "tsconfig.json", '{\n  /* ours */\n  "compilerOptions": {\n    "strict": true,\n  },\n}\n');
  const r = run("report.mjs", ["react", "--target", target], root);
  check(r.status === 0, "JSONC tsconfig에 대한 보고서: exit 0");
  check(/타입\s+1/.test(r.stdout), "JSONC tsconfig에 대한 보고서: 그 안의 strict 플래그가 그래도 세어진다");
}
{
  const target = fresh("unplanted-report");
  write(target, "package.json", JSON.stringify({ name: "x" }, null, 2) + "\n");
  const r = run("report.mjs", ["react", "--target", target], root);
  check(/harness:check\s+심어지지 않음/.test(r.stdout), "심어진 체커가 없는 대상은 실패한 검사가 아니라 '심어지지 않음'으로 읽힌다");
}

// --- 심어진 것의 낡음은 심어진 내용을 따라간다 -------------------------------
{
  // 매니페스트 버전이 대상에서 `current`와 `outdated`를 가르는 것이다. 규칙 집합
  // 자신의 버전 번호로 키를 잡으면 check.mjs의 수정이 옛 사본을 이미 지닌 모든 레포에
  // `current`로 출고됐다.
  const target = fresh("stale-version");
  scaffold(target);
  const manifestPath = join(target, ".claude/harness/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = "0-0000000000000000";
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const r = run("check.mjs", ["--mode", "principles", "--target", target, "--json"], root);
  const state = JSON.parse(r.stdout).planted;
  check(state.every((p) => p.state === "outdated"), "더 오래된 심기를 기록한 매니페스트는 outdated로 읽힌다");

  const fixedRun = run("check.mjs", ["--mode", "principles", "--target", target, "--fix", "--json"], root);
  check(JSON.parse(fixedRun.stdout).planted.every((p) => p.state === "current"), "--fix가 그것을 current로 되돌린다");
}

// --- 읽을 수 없는 레포 파일은 크래시가 아니라 발견이다 -----------------------
{
  const target = fresh("broken-pkg");
  scaffold(target);
  writeFileSync(join(target, "package.json"), "{ broken", "utf8");
  const r = run("check.mjs", ["--mode", "principles", "--target", target, "--json"], root);
  check(r.status !== null && !/SyntaxError/.test(r.stderr), "깨진 package.json이 체커를 죽이지 않는다");
  const parsed = r.stdout ? JSON.parse(r.stdout) : { findings: [] };
  check(
    parsed.findings.some((f) => f.id === "harness.check-registered" && /올바른 JSON이 아니다/.test(f.message)),
    "깨진 package.json이 발견으로 보고된다"
  );
}
{
  const target = fresh("broken-manifest");
  scaffold(target);
  writeFileSync(join(target, ".claude/harness/manifest.json"), "{ broken", "utf8");
  const r = run("check.mjs", ["--mode", "principles", "--target", target, "--json"], root);
  check(!/SyntaxError/.test(r.stderr), "깨진 매니페스트가 체커를 죽이지 않는다");
  const parsed = r.stdout ? JSON.parse(r.stdout) : { planted: [] };
  check((parsed.planted ?? []).some((p) => p.state === "unreadable"), "깨진 매니페스트가 unreadable로 보고된다");
}

if (keep) console.log(`\n작업 공간을 남겨 둠:\n  ${workspace}`);
else rmSync(workspace, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
