#!/usr/bin/env node
// 완료 보고서. 모든 줄이 자기 단위를 밝힌다. 단위 없는 대표 숫자는 마케팅이기 때문이다.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadProfile, listStacks } from "./lib/profile.mjs";
import { readAlias } from "./lib/alias.mjs";
import { ownedUnchanged, plantedFiles } from "./lib/planted.mjs";
import { loadModule } from "./lib/module.mjs";
import { counts, resolveOptions } from "./layer-boundaries.mjs";
import { groupDirs } from "./import-order.mjs";
import { parseJsonc } from "./lib/jsonc.mjs";
import { shadowed } from "./lib/precedence.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const stack = args[0];
// scaffold.mjs가 가진 것과 같은 가드. 이것이 없으면 빠진 스택이 undefined로 loadProfile에
// 닿아 path-join TypeError로 돌아왔다 — 사용법 오류에 우리 코드의 크래시를 준 것이다.
if (!stack || stack.startsWith("--")) {
  console.error("사용법: report.mjs <stack> --target <dir>");
  console.error(`스택: ${listStacks(root).join(", ")}`);
  process.exit(2);
}
const target = resolve(opt("target", process.cwd()));

const profile = loadProfile(root, stack);

// 변형은 답변에서 왔으므로 scaffold가 기록한 것에서 되읽는다. 프로필에서 다시 계산하면
// 다르게 답한 레포에 엄격한 개수를 보고하게 된다 — 설정은 이렇게 말하고 보고서는
// 저렇게 말하는 상태.
//
// 아키텍처 모듈도 답변이라 같은 자리에서 읽는다. 프로필의 제안으로 되돌아가면
// "경계 규약 없음"이라 답한 레포가 FSD 개수를 받는다.
const manifestPath = join(target, ".claude/harness/manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
// 모듈 슬롯 이전의 매니페스트는 `fsd` 키에 변형만 기록했다. 그때는 그것이 유일한
// 답이었으므로 모듈 이름을 유도할 수 있다. 유도할 수 없는 것만 기본값으로 떨어진다.
const recorded = manifest?.architecture ?? (manifest?.fsd ? { module: "fsd", ...manifest.fsd } : null);
const architecture = loadModule(root, recorded?.module ?? profile.architecture);
const graph = architecture.graph;
const boundaryOpts = resolveOptions(graph, profile, recorded ?? {});
const c = counts(graph, profile, boundaryOpts);
const { alias, source: aliasSource } = await readAlias(target, profile, ownedUnchanged(target, manifest));
const aliases = Object.keys(alias).length;

// 진짜 tsconfig.json은 JSONC다. 주석과 뒤따르는 쉼표가 거기서는 합법이고 JSON.parse에는
// 치명적이다. 읽을 수 없는 tsconfig는 strict 플래그 0개로 세는데, 그것이 파일이 우리에게
// 말해주는 것이다. 보고서를 멈추지는 않는다.
//
// 벗기는 작업이 lib/jsonc.mjs에 사는 이유는, 여기서 정규식으로 하다가
// `"@app/*": ["src/app/*"]`를 열린 블록 주석으로 읽고 플래그가 다섯 개인 tsconfig에
// 0개를 보고했기 때문이다.
function readJsonc(path) {
  if (!existsSync(path)) return null;
  return parseJsonc(readFileSync(path, "utf8"));
}
const tsconfig = readJsonc(join(target, "tsconfig.json"));
const strictFlags = tsconfig
  ? Object.entries(tsconfig.compilerOptions ?? {}).filter(([k, v]) => v === true && /^(strict|no|exact)/.test(k)).length
  : 0;

// 존재가 아니라 소유. 이미 prettier.config.mjs를 가지고 있던 레포는 그것을 지킨 것이고,
// 그 파일은 생성된 import 순서를 실어 나르는 파일이 아니다 — 그 이름의 파일이 있다고
// 세는 것은 남의 포매터를 우리 것으로 보고하는 짓이다. 매니페스트는 이 플러그인이 쓴
// 것만 기록한다.
const owns = (rel) => Boolean(manifest?.files?.some((f) => f.path === rel));
const prettier = owns("prettier.config.mjs") ? 1 : 0;
const importGroups = prettier ? groupDirs(graph, profile, boundaryOpts).length : 0;

// 소유는 "우리가 이 파일을 썼는가"에 답한다. "도구가 그것을 읽는가"에는 답하지 않는다.
// 이미 eslint.config.js를 가진 레포에서 우리 것은 절대 로드되지 않는다 — 그러면 거기
// 담긴 경계 정책은 아무것도 강제하지 않고, 그것을 포함한 합계는 어떤 실행도 뒷받침할 수
// 없는 주장이다. 실제로 효력이 있는 파일일 때만 센다.
const eslintShadow = owns("eslint.config.mjs")
  ? shadowed(target, "eslint.config.mjs", ["eslint.config.mjs", "eslint.config.boundaries.mjs"])
  : { shadowed: false, winner: null, via: null };
const prettierShadow = prettier
  ? shadowed(target, "prettier.config.mjs", ["prettier.config.mjs"])
  : { shadowed: false, winner: null, via: null };
// 줄마다 주석을 다는 것은 가려진 경우뿐이다. 그때는 각 숫자의 뜻이 달라지기 때문이다.
// 레포 자신의 진입 설정을 통해 연결되는 것은 이번 실행에 대한 사실 하나이므로, 여백에
// 네 번 적는 대신 아래에 한 번 진술한다 — 그리고 변형 주석("답변: publicApi=open")에
// 자리를 남겨 준다.
const shadowNote = (s) => (s.shadowed ? `   <- 생성됐지만 ${s.winner}에 가려짐. 로드되지 않고, 세지 않음` : "");
const viaLines = [eslintShadow, prettierShadow]
  .filter((s) => s.via)
  .map((s) => `  ${s.via}를 통해 로드됨. 레포가 소유하고 우리 것을 펼쳐 넣는 파일이다.`);
const live = (s, n) => (s.shadowed ? 0 : n);

// alias 테이블은 어딘가 쓰여야 무언가를 강제한다. 프로필에서 왔는데 레포가 자기 tsconfig를
// 지켰다면, 그 테이블은 우리가 쓰지 않은 파일로 생성된 것이다 — 다시 말해 아무 데도
// 쓰이지 않은 것이다.
const aliasesPlanted = aliasSource !== "profile" || owns("tsconfig.json");
const aliasNote = aliasesPlanted
  ? `alias 항목, ${aliasSource === "profile" ? "tsconfig paths와 번들러 설정으로 생성됨" : `${aliasSource}에서 읽음`}`
  : `alias 항목. 레포 자신의 tsconfig.json을 그대로 두었으므로 생성된 테이블은 아무 데도 쓰이지 않았다`;

// 조건부 산출물도 나열한다. 인터뷰 답변이 요구했을 때만 존재하므로 그것들의 부재는
// 누락이 아니라 결과다 — 다만 하나가 쓰였다면 여기 나타나야 하고, 아니면 보고서가
// 실행의 산출을 축소해 말하게 된다.
// 심어진 경로는 그것을 소유한 목록 하나에서 온다. 여기 타이핑하면 세 번째 사본이 되고,
// 목록의 세 번째 사본은 이 레포가 scaffold와 --fix에 대해 이미 한 번 해결한 어긋남이다.
const files = [
  ...profile.files.map((f) => f.dest),
  "AGENTS.md",
  "CLAUDE.md",
  "package.json",
  ".claude/references/architecture.md",
  ".claude/skills/verification/SKILL.md",
  ...plantedFiles(root).files.map((f) => f.path),
  ".claude/harness/manifest.json",
].filter((p) => existsSync(join(target, p)));

const layers = graph?.layers ?? [];
const layerDirs = layers.filter((l) => existsSync(join(target, profile.sourceRoot.replace(/\/+$/, ""), l.name)));
const missingLayers = layers.filter((l) => !layerDirs.includes(l)).map((l) => l.name);

// 산문이 사는 파일을 잰다. CLAUDE.md가 `@AGENTS.md` 한 줄이면 그 파일은 3토큰이고,
// 그 숫자를 하네스 크기로 출력하면 예산 줄이 항상 통과한다 — 재지 않은 것을 잰 것처럼
// 보여주는 셈이다.
const readIf = (p) => (existsSync(join(target, p)) ? readFileSync(join(target, p), "utf8") : "");
const claudeMdRaw = readIf("CLAUDE.md");
const pointsAt = claudeMdRaw.trim().match(/^@([\w.][\w./-]*)$/);
const claudeMd = pointsAt ? readIf(pointsAt[1]) : claudeMdRaw;
const tokens = Math.round(claudeMd.length / 4);

// 심어진 체커가 없는 대상은 실패한 검사가 아니라 검사가 없는 것이다. 둘이 똑같이
// 보고돼서, 아무것도 심지 않은 bootstrap이 돌아서 오류를 찾아낸 하네스처럼 읽혔다.
const checkerPath = join(target, ".claude/harness/check.mjs");
let checkOut = "", checkStatus;
if (!existsSync(checkerPath)) {
  checkStatus = "심어지지 않음 (대상에 .claude/harness/check.mjs 없음)";
} else {
  try {
    checkOut = execFileSync(process.execPath, [checkerPath, "--mode", "principles", "--target", target], { encoding: "utf8" });
    checkStatus = "통과";
  } catch (e) {
    checkOut = e.stdout ?? String(e);
    checkStatus = "실패";
  }
}

// 여기서의 0은 구멍이 아니라 답이므로 그렇게 표시한다. 표시 없는 0은 생성되지 못한
// 규칙으로 읽힌다.
const answered = (on, off) => (on ? "" : `   <- ${off}`);

// 경계를 강제하지 않는 모듈에서 이 네 줄은 전부 0이고, 그 0은 변형 답변이 만든 0과
// 다른 것을 뜻한다. 한쪽은 "이 제약을 끄기로 답했다"이고 다른 쪽은 "이 레포의 경계는
// 도구가 판정하지 않는다"이다. 같은 숫자에 같은 각주를 달면 둘이 구별되지 않는다.
const noBoundaries = !architecture.boundaries;
const moduleNote = noBoundaries ? `   <- ${architecture.summary}` : "";
const byModule = (text) => (noBoundaries ? `   <- 답변: architecture=${architecture.name}` : text);

const lines = [
  `스택                 ${stack}`,
  `아키텍처 모듈        ${architecture.name}${moduleNote}`,
  ...(graph
    ? [
        `  변형               publicApi=${boundaryOpts.publicApi}  sliceCoupling=${boundaryOpts.sliceCoupling}${recorded ? "" : "   (매니페스트 없음: 기본값 가정)"}`,
      ]
    : []),
  ``,
  `만들어진 파일        ${files.length}`,
  ...files.map((f) => `  - ${f}`),
  // 그래프가 가진 것이 아니라 디스크에 있는 것. bootstrap은 빈 레포에만 레이어
  // 디렉터리를 만들므로, 그 밖의 모든 레포에서 이 줄은 만들어진 적 없는 디렉터리를
  // 보고하고 있었다.
  ...(graph
    ? [
        `  - ${profile.sourceRoot} 아래 레이어 디렉터리 ${layers.length}개 중 ${layerDirs.length}개 존재${
          layerDirs.length < layers.length ? ` (없음: ${missingLayers.join(", ")})` : ""
        }${boundaryOpts.routingRoot ? ` + ${boundaryOpts.routingRoot}` : ""}`,
      ]
    : []),
  ``,
  `도구가 강제하는 규칙`,
  `  레이어 방향        ${c.layerDirection}   (레이어 그래프에서 파생한, 금지된 순서쌍 개수)${shadowNote(eslintShadow) || byModule("")}`,
  `  슬라이스 격리      ${c.sliceIsolation}   (격리 정책, 슬라이스가 있는 레이어당 하나)${shadowNote(eslintShadow) || byModule(answered(c.sliceIsolation > 0, "답변: sliceCoupling=same-layer"))}`,
  `  public API         ${c.publicApi}   (import가 index.*를 거쳐야 하는 요소 타입 개수)${shadowNote(eslintShadow) || byModule(answered(c.publicApi > 0, "답변: publicApi=open"))}`,
  `  라우팅             ${c.routing}   (라우팅 요소, 스택에 있을 때만)${shadowNote(eslintShadow) || byModule("")}`,
  `  타입               ${strictFlags}   (tsconfig.json에서 켜진 strict 계열 플래그)`,
  `  포매팅             ${prettier}   (이 하네스가 쓴 prettier 설정: 0 또는 1)${shadowNote(prettierShadow) || answered(prettier > 0, "레포 자신의 prettier 설정을 그대로 두었다")}`,
  `  import 순서        ${importGroups}   (포매터가 정렬하는 import 그룹, 라우팅 디렉터리와 레이어당 하나)${
    shadowNote(prettierShadow) ||
    (noBoundaries && !importGroups ? `   <- 답변: architecture=${architecture.name}. 소스 루트를 위한 포괄 그룹은 여전히 쓰이지만 레이어 그룹이 아니라 세지 않는다` : "")
  }`,
  `  경로 일관성        ${aliasesPlanted ? aliases : 0}   (${aliasNote})`,
  `  ---`,
  `  합계               ${live(eslintShadow, c.layerDirection + c.sliceIsolation + c.publicApi + c.routing) + strictFlags + live(prettierShadow, prettier + importGroups) + (aliasesPlanted ? aliases : 0)}`,
  ...viaLines,
  `  각주: 합계는 위 줄들의 단순 합에서 가려짐으로 표시된 줄을 뺀 것이다. 도구가 절대`,
  `  로드하지 않는 설정은 누가 썼든 아무것도 강제하지 않는다.`,
  `  각 줄은 서로 다른 종류를 세므로 합계는 합이지 점수가 아니다.`,
  `  앞의 네 줄은 tests/verify-boundaries.mjs가 이 스택, 이 모듈, 이 변형 쌍에 대해`,
  `  통과한 뒤에만 보고할 수 있다.`,
  ``,
  `${(pointsAt ? pointsAt[1] : "CLAUDE.md").padEnd(20)} ${tokens}토큰 (측정했을 뿐 판정하지 않음: 예산을 제시하는 1차 소스가 없다)`,
  `harness:check        ${checkStatus}`,
];
console.log(lines.join("\n"));
if (checkStatus === "실패") console.log("\n" + checkOut);
