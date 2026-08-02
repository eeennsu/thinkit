#!/usr/bin/env node
// 답변 + 스택 프로필 -> 파일. 멱등하고, 자기가 쓰지 않은 파일은 절대 덮어쓰지 않는다.
// 이미 있던 설정은 레포의 것이고 병합은 우리가 아니라 저자의 결정이다. 그 결과 상태는
// check.mjs가 보고한다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";
import { loadProfile, listStacks } from "./lib/profile.mjs";
import { plantedFiles, sha, ownedUnchanged } from "./lib/planted.mjs";
import { readAlias } from "./lib/alias.mjs";
import { buildElements, buildPolicies, counts, resolveOptions } from "./fsd-boundaries.mjs";
import { buildImportOrder, renderImportOrder } from "./import-order.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const stack = args[0];
if (!stack || stack.startsWith("--")) {
  console.error("사용법: scaffold.mjs <stack> --target <dir> [--answers <file.json>]");
  console.error(`스택: ${listStacks(root).join(", ")}`);
  process.exit(2);
}
const target = resolve(opt("target", process.cwd()));

// 풀리지 않는 --answers 경로는 인터뷰 전체를 버리는 것이다. {}로 대체하면 엄격한
// 기본값이 만들어지고 그것이 레포의 답으로 보고됐다 — resolveOptions()가 키 하나에
// 대해서도 거부하는 바로 그 실패를, 전부에 대해 한 번에 저지르는 것.
const answersPath = opt("answers", "");
let answers = {};
if (answersPath) {
  if (!existsSync(answersPath)) {
    console.error(`--answers ${answersPath}: 그런 파일이 없다. 아무것도 쓰지 않았다.`);
    process.exit(2);
  }
  try {
    answers = JSON.parse(readFileSync(answersPath, "utf8"));
  } catch (e) {
    console.error(`--answers ${answersPath}: 올바른 JSON이 아니다 (${e.message}). 아무것도 쓰지 않았다.`);
    process.exit(2);
  }
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
    console.error(`--answers ${answersPath}: 답변 키를 담은 JSON 객체여야 한다. 아무것도 쓰지 않았다.`);
    process.exit(2);
  }
}

// 생성된 규칙에 eslint severity로 그대로 들어간다. 모르는 값은 eslint가 오타로 잡아주지
// 않는다 — 린트 실행 전체를 멈추는 설정 오류이고, 그것도 레포 소유자가 쓰지 않은
// 파일에서 그렇다.
const SEVERITIES = ["error", "warn", "off"];
if (answers.severity !== undefined && !SEVERITIES.includes(answers.severity)) {
  console.error(`severity는 ${SEVERITIES.join(", ")} 중 하나여야 한다: 받은 값 "${answers.severity}". 아무것도 쓰지 않았다.`);
  process.exit(2);
}

// 나머지 답변의 형태를 쓰이는 자리가 아니라 여기서 검사한다. 두 실수 다 파일을 손으로
// 쓰는 사람이 저지르는 것이다.
//
//   "safetyBoundaries": "no production deploys"   항목 하나를 대괄호 대신 따옴표로.
//                                                 문자열에도 length가 있어서 비어 있지
//                                                 않은 답 세 개로 읽혔고, 실행이 이미
//                                                 파일을 쓴 뒤에 .map에서 죽었다.
//   "oneLine": { "ko": "…" }                      누군가의 CLAUDE.md 첫 줄에
//                                                 [object Object]로 렌더된다.
//
// 어느 쪽도 하류에서 잡히지 않고, 두 번째는 아예 잡히지 않는다. 그대로 출고된다.
const shapeErrors = [];
for (const key of ["safetyBoundaries", "verification", "exceptions", "routingImports"]) {
  const v = answers[key];
  if (v === undefined || v === null) continue;
  if (!Array.isArray(v)) shapeErrors.push(`${key}는 문자열 배열이어야 한다, 받은 타입 ${typeof v}`);
  else if (v.some((item) => typeof item !== "string")) shapeErrors.push(`${key}는 문자열만 담아야 한다`);
}
for (const key of ["projectName", "oneLine", "routingRoot"]) {
  const v = answers[key];
  if (v === undefined || v === null) continue;
  if (typeof v !== "string") shapeErrors.push(`${key}는 문자열이어야 한다, 받은 타입 ${Array.isArray(v) ? "array" : typeof v}`);
}
if (shapeErrors.length) {
  for (const e of shapeErrors) console.error(e);
  console.error("아무것도 쓰지 않았다.");
  process.exit(2);
}

const profile = loadProfile(root, stack);
const fsd = JSON.parse(readFileSync(join(root, "modules/fsd/layers.json"), "utf8"));

// fsdRoot 아래 어떤 디렉터리가 있는지는 repo-visible이므로 묻지 않고 읽는다 —
// routingRoot와 같은 대접이다. 이것이 없으면 그중 하나로 들어가는 모든 import가 알 수
// 없는 의존성이 되고, --max-warnings 0으로 린트를 도는 레포는 켤 수 없는 설정을 받는다.
// 명시적인 답변이 이긴다. 그것들이 보고되기를 원하는 레포의 `[]`도 포함해서.
if (answers.extraRoots === undefined) {
  const fsdRootName = profile.fsdRoot.replace(/\/+$/, "");
  const fsdAbs = join(target, fsdRootName);
  const known = new Set(fsd.layers.map((l) => l.name));
  // fsdRoot 안의 routingRoot(src/app, src/navigators)는 이미 자기 요소가 레이어보다
  // 먼저 등록되어 있다. 다시 나열하면 그것을 가린다.
  const routingParts = String(answers.routingRoot ?? profile.routingRoot ?? "").replace(/\/+$/, "").split("/").filter(Boolean);
  if (routingParts[0] === fsdRootName && routingParts[1]) known.add(routingParts[1]);
  answers.extraRoots = existsSync(fsdAbs)
    ? readdirSync(fsdAbs, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !known.has(d.name) && !d.name.startsWith("."))
        .map((d) => d.name)
        .sort()
    : [];
}

// 레이어 그래프가 허용하지 않는 답변에 대해 throw한다. 시끄러운 쪽이 엄격한 기본값으로
// 조용히 떨어지는 것보다 낫다. 후자는 레포의 답으로 보고된다.
const fsdOpts = resolveOptions(fsd, profile, answers);
const written = [];

// 무엇을 쓰기 전에 읽는다. 이 실행이 무엇을 덮어써도 되는지는 매니페스트가 정한다.
const manifestPath = join(target, ".claude/harness/manifest.json");
const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const manifestFiles = [];

function put(relPath, content) {
  const abs = join(target, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  const existed = existsSync(abs);
  if (existed && readFileSync(abs, "utf8") === content) {
    written.push({ path: relPath, state: "unchanged" });
    return;
  }
  writeFileSync(abs, content, "utf8");
  written.push({ path: relPath, state: existed ? "written" : "created" });
}

// 생성되는 파일은 전부 여기를 거치고, 매니페스트가 이 플러그인이 소유한 것의 기록이다.
// 세 상태가 있고 쓰는 것은 첫 번째뿐이다.
//   디스크에 없거나, 우리가 마지막에 쓴 그대로 있다 -> 우리 것, 갱신한다
//   디스크에 있는데 기록된 적이 없다                -> 레포의 것, 둔다
//   기록됐는데 그 뒤로 바뀌었다                     -> 로컬에서 편집됨, 둔다
function putOwned(relPath, content) {
  const abs = join(target, relPath);
  const recorded = prev?.files.find((f) => f.path === relPath);
  if (existsSync(abs)) {
    if (!recorded) {
      written.push({ path: relPath, state: "exists, left alone" });
      return;
    }
    if (sha(readFileSync(abs)) !== recorded.sha256) {
      written.push({ path: relPath, state: "edited-locally, left alone" });
      manifestFiles.push(recorded);
      return;
    }
  }
  put(relPath, content);
  manifestFiles.push({ path: relPath, sha256: sha(Buffer.from(content, "utf8")) });
}

// alias 테이블은 하나다. tsconfig paths와 babel alias 둘 다 여기서 파생된다. 손으로 쓴
// 테이블 둘은 어긋나고 아무도 알아채지 못한다. 이미 import를 해석하는 레포에서는
// 테이블을 지어내지 않고 거기서 읽는다 — lib/alias.mjs 참고.
const { alias, source: aliasSource } = await readAlias(target, profile, ownedUnchanged(target, prev));
const paths = Object.fromEntries(Object.entries(alias).map(([k, v]) => [`${k}/*`, [`${v}/*`]]));
const babelAlias = Object.fromEntries(Object.entries(alias).map(([k, v]) => [k, `./${v}`]));
const fsdRootDir = profile.fsdRoot.replace(/\/+$/, "");
const include = [fsdRootDir];
if (fsdOpts.routingRoot) {
  const routingDir = fsdOpts.routingRoot.replace(/\/+$/, "");
  // fsdRoot 안의 routingRoot는 이미 덮여 있다. 두 번 나열하면 tsconfig include에
  // 중복 항목이 생긴다.
  if (!routingDir.startsWith(`${fsdRootDir}/`) && routingDir !== fsdRootDir) include.push(routingDir);
}

const vars = {
  stack,
  severity: answers.severity ?? (answers.greenfield === false ? "warn" : "error"),
  elementsJson: JSON.stringify(buildElements(fsd, profile, fsdOpts), null, 8).replace(/\n {8}\]/, "\n      ]"),
  policiesJson: JSON.stringify(buildPolicies(fsd, profile, fsdOpts), null, 10).replace(/\n {10}\]/, "\n          ]"),
  resolverJson: JSON.stringify(profile.resolver.settings, null, 6).replace(/\n {6}\}/, "\n    }"),
  pathsJson: JSON.stringify(paths, null, 6).replace(/\n {6}\}/, "\n    }"),
  includeJson: JSON.stringify(include),
  babelPreset: profile.babelPreset ?? "",
  aliasJson: JSON.stringify(babelAlias, null, 10).replace(/\n {10}\}/, "\n        }"),
  // 경계 정책과 같은 레이어 그래프, 같은 alias 테이블에서 만든다. 그래서 포매터가
  // 린터가 허용하는 순서대로 import를 묶는다. 해석된 fsdOpts를 넘기는 것이 중요하다.
  // routingRoot가 라우팅 그룹이 아예 있는지를 정한다.
  importOrderJs: renderImportOrder(buildImportOrder(fsd, profile, alias, fsdOpts)),
  // 영어 그대로 둔다. package.json이 없는 레포에서 이 값이 소문자로 npm 패키지 이름이
  // 되는데, npm 이름은 ASCII 소문자여야 한다. 한국어 자리표시자는 설치할 수 없는
  // package.json을 만든다.
  projectName: answers.projectName ?? "Project",
  oneLine: answers.oneLine ?? "<한 줄: 이 레포는 무엇을 위한 것인가>",
  safetySection: answers.safetyBoundaries?.length
    ? `\n## 안전 경계\n\n${answers.safetyBoundaries.map((s) => `- ${s}`).join("\n")}\n`
    : "",
  referencesSection: answers.exceptions?.length
    ? "\n## 참조\n\n- `@.claude/references/architecture.md`\n"
    : "",
  exceptions: (answers.exceptions ?? []).map((s) => `- ${s}`).join("\n"),
  verificationFacts: (answers.verification ?? []).map((s) => `- ${s}`).join("\n"),
};

for (const f of profile.files) putOwned(f.dest, render(readFileSync(join(root, f.template), "utf8"), vars));

// 산문은 AGENTS.md에 살고 CLAUDE.md는 그것을 가리키는 한 줄이다. 하네스를 읽는 도구가
// Claude Code 하나가 아니고, 같은 규칙을 파일 둘에 두 벌 두면 그 둘은 반드시 갈라진다.
// 포인터는 갈라질 자리를 없앤다 — check.mjs가 `@`를 펼쳐서 읽으므로 감사도 토큰 예산도
// 포인터가 아니라 산문을 판정한다.
//
// 자기 산문을 CLAUDE.md에 가진 레포에는 둘 다 쓰지 않는다. 거기에 AGENTS.md를 새로
// 만들면 규칙이 두 곳에 살고 어느 쪽도 다른 쪽을 가리키지 않는데, 그것이 이 배치가
// 막으려는 상태 자체다. CLAUDE.md가 없거나, 우리가 쓴 것이거나, 이미 `@AGENTS.md`
// 한 줄일 때만 쓴다. 다른 곳을 가리키는 포인터도 남의 산문이다 — 덮어쓰면 그 레포의
// 하네스가 우리 것을 가리키게 되고 원본은 아무도 읽지 않는다.
const claudeMdOnDisk = existsSync(join(target, "CLAUDE.md")) ? readFileSync(join(target, "CLAUDE.md"), "utf8") : null;
const claudeMdIsOurs = Boolean(prev?.files.some((f) => f.path === "CLAUDE.md"));
const proseIsOursToWrite = claudeMdOnDisk === null || claudeMdIsOurs || claudeMdOnDisk.trim() === "@AGENTS.md";
if (proseIsOursToWrite) {
  putOwned("AGENTS.md", render(readFileSync(join(root, "templates/AGENTS.md.hbs"), "utf8"), vars));
  // 이미 손으로 쓴 포인터가 있으면 putOwned가 "exists, left alone"으로 두고 지나간다.
  // 내용이 이미 우리가 쓸 것과 같으므로 소유권을 주장할 이유가 없다.
  putOwned("CLAUDE.md", "@AGENTS.md\n");
}
if (answers.exceptions?.length)
  putOwned(".claude/references/architecture.md", render(readFileSync(join(root, "templates/architecture.md.hbs"), "utf8"), vars));

// Q3. 답변에서만 쓴다. 레포 고유로 할 말이 없으면 그 파일은 모델이 이미 따르는 절차만
// 담게 되고, 그것은 파일이 없는 것보다 나쁘다. 새 레포에서는 비는 것이 기대되는 결과다.
if (answers.verification?.length)
  putOwned(".claude/skills/verification/SKILL.md", render(readFileSync(join(root, "templates/verification.SKILL.md.hbs"), "utf8"), vars));

// 레이어 디렉터리는 디스크에 존재한다. CLAUDE.md에서 서술하는 일은 없다.
//
// 빈 레포에서는 그것이 요점이다. 레이어 그래프는 형태이고, 무엇을 놓을 자리도 없는
// 형태는 문서다. 이미 코드가 있는 레포에서는 반대다 — 그 레포가 가진 적 없는 레이어의
// `src/entities/.gitkeep`은 아무도 요청하지 않은 디렉터리이고, 아무도 원하지 않은
// diff이며, 어느 쪽이든 아무것도 매칭하지 않는 정책을 위한 것이다. 정책은 그 디렉터리가
// 존재해야 돌아가지 않는다.
//
// 묻지 않고 읽는다. fsdRoot 아래 디렉터리에 우리 자신의 .gitkeep 말고 무언가 있으면
// 그 레포는 거기 코드를 가지고 있다.
const hasCode = (dir) => {
  if (!existsSync(dir)) return false;
  return readdirSync(dir, { withFileTypes: true }).some((e) =>
    e.isDirectory() ? hasCode(join(dir, e.name)) : e.name !== ".gitkeep"
  );
};
const greenfield = !hasCode(join(target, fsdRootDir));
const absentLayers = [];
for (const layer of fsd.layers) {
  const rel = `${fsdRootDir}/${layer.name}`;
  if (greenfield) put(`${rel}/.gitkeep`, "");
  else if (!existsSync(join(target, rel))) absentLayers.push(layer.name);
}
if (fsdOpts.routingRoot && greenfield) put(`${fsdOpts.routingRoot.replace(/\/+$/, "")}/.gitkeep`, "");

// 체커 자체와 principle 전용 규칙 집합을 심는다. 목록과 그 내용은 lib/planted.mjs에
// 살아서, check.mjs --fix가 bootstrap이 쓴 것과 정확히 같은 것을 갱신한다.
const plant = plantedFiles(root);
for (const { path: rel, content } of plant.files) putOwned(rel, content);

// 변형을 기록하는 이유는 report.mjs가 그것을 다시 유도할 수 없기 때문이다. 스택이
// 아니라 답변에서 왔다. 프로필에서 다시 계산하는 보고서는 다르게 답한 레포에 엄격한
// 개수를 출력하게 된다.
// 답변됐고 *그리고* 쓰였을 때만. 이것이 기록하는 섹션은 산문 파일에 살고, 이미 자기
// 산문을 가지고 있던 레포는 그것을 지킨다 — 그래서 브라운필드 레포에서는 답이
// 수집됐는데 갈 곳이 없었다. 그런데도 declared로 기록하면 check.mjs가 "설정 때
// 선언됐는데 섹션이 사라졌다"고 보고했고, 그것은 절대 해소되지 않는 `error`이면서 거짓
// 문장이다. 사라진 것도 없고 쓰인 적도 없다. 우리가 소유하지만 레포가 그 뒤 편집한
// 파일은 declared로 남고, 그 경우가 이 규칙이 만들어진 이유다.
const ownsProse = manifestFiles.some((f) => f.path === "AGENTS.md");
const boundariesDropped = Boolean(answers.safetyBoundaries?.length) && !ownsProse;

put(".claude/harness/manifest.json", JSON.stringify({
  version: plant.version,
  stack,
  declared: { safetyBoundaries: Boolean(answers.safetyBoundaries?.length) && ownsProse },
  fsd: {
    publicApi: fsdOpts.publicApi,
    sliceCoupling: fsdOpts.sliceCoupling,
    routingRoot: fsdOpts.routingRoot,
    routingImports: fsdOpts.routingImports,
    extraRoots: fsdOpts.extraRoots,
  },
  alias: { source: aliasSource, count: Object.keys(alias).length },
  files: manifestFiles,
}, null, 2) + "\n");

// package.json: 검사를 등록하고 개발 의존성을 기록한다. 설치는 레포 소유자에게 맡긴다.
const pkgPath = join(target, "package.json");
const pkgRaw = existsSync(pkgPath) ? readFileSync(pkgPath, "utf8") : null;
const pkg = pkgRaw ? JSON.parse(pkgRaw) : { name: vars.projectName.toLowerCase(), private: true, version: "0.0.0" };
// `format`이 여기 있는 이유는 `lint`가 있는 이유와 같다. report.mjs는 import 순서 개수를
// 도구가 강제하는 규칙으로 출력하는데, 아무 명령도 부르지 않는 포매터는 아무것도
// 강제하지 않는다 — 무언가 그것을 돌리기 전까지 설정은 취향이다. 둘 다 `??`다. 자기
// 것을 이미 가진 레포는 그것을 지닌 채로 남는다.
pkg.scripts = {
  ...pkg.scripts,
  "harness:check": "node .claude/harness/check.mjs --mode principles",
  lint: pkg.scripts?.lint ?? "eslint .",
  format: pkg.scripts?.format ?? "prettier --write .",
};
// 이미 있는 버전 고정이 이긴다. eslint나 typescript 버전을 고정한 레포는 이유가 있어서
// 그랬고 — 보통은 자기 것을 함께 배포하는 프레임워크다 — 하네스가 누군가의 범위를
// 조용히 넓히는 것은 아무도 요청하지 않은 변경이다. 없는 이름만 더한다.
pkg.devDependencies = { ...pkg.devDependencies };
// 리졸버를 여기 나열하는 것은 어떤 프로필이 이름만 대고 고정하지 않았을 경우를 위해서다.
// 고정한 프로필이 이긴다. 리졸버 키를 마지막에 펼치면 프로필 자신의 `^4`를 `*`로
// 덮어써서, 생성된 설정이 해석되는지 여부를 메이저 버전이 정하는 바로 그 의존성이
// 고정되지 않은 채 출고됐다.
const devDeps = { [profile.resolver.devDependency]: "*", ...profile.devDependencies };
for (const [name, range] of Object.entries(devDeps))
  if (!(name in pkg.devDependencies)) pkg.devDependencies[name] = range;
// 여기서 레포에 속하고 소유되는 대신 편집되는 파일은 이것 하나뿐이라, 레포 자신의
// 포매팅을 지킨다. 우리 스타일로 다시 포매팅하면 키 두 개 더하자고 남의 package.json
// 모든 줄이 diff에 올라간다. 키 순서는 JSON.parse를 지나서 살아남고, 들여쓰기는 파일에서
// 다시 읽어야 한다. 매칭은 첫 들여쓴 줄이고, JSON 객체에서 그것은 깊이 1이며,
// stringify에 그대로 넘기므로 탭은 탭으로 남는다.
const indent = pkgRaw?.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
const trailingNewline = pkgRaw && !pkgRaw.endsWith("\n") ? "" : "\n";
put("package.json", JSON.stringify(pkg, null, indent) + trailingNewline);

// 수집됐는데 갈 곳이 없었던 답변은 파일 목록의 세부사항이 아니다. 이번 실행에서 레포
// 소유자가 손대야 하는 유일한 것이고, `written`에서는 보이지 않는다 — 거기 줄은
// "AGENTS.md: exists, left alone"이라고 말하고, 그것은 보통 그렇듯 무해한 결과처럼
// 읽힌다.
const notes = [];
// 코드가 이미 있는 레포의 기본값은 `warn`이고, 그 이유는 `error`가 누군가 규칙을 끌
// 때까지 첫 실행을 익사시키기 때문이다. 그 이유는 경고가 견딜 만하다고 가정한다.
// --max-warnings 0으로 도는 lint 스크립트는 모든 경고를 실패한 명령으로 바꾸므로,
// 두 답변은 같은 답변이 된다 — 그리고 이 레포에서는 빌드가 lint를 부르므로 같은
// 빌드가 된다.
{
  const lint = String(pkg.scripts?.lint ?? "");
  const zeroWarnings = /--max-warnings[= ]0\b/.test(lint);
  if (zeroWarnings && vars.severity === "warn")
    notes.push(
      `severity=warn인데 레포의 lint 스크립트가 --max-warnings 0으로 돈다. 경고가 error와 ` +
        `똑같이 명령을 실패시킨다${/\blint\b/.test(String(pkg.scripts?.build ?? "")) ? ", 그리고 build가 lint를 부른다" : ""}. ` +
        `아직 아무것도 막지 않으면서 정책만 내려놓으려면 severity=off로 답한다.`
    );
}
if (absentLayers.length)
  notes.push(
    `${fsdRootDir}/에 이미 코드가 있어서 레이어 디렉터리를 만들지 않았다. ` +
      `${absentLayers.join(", ")}은(는) 여기 없다. 그것들을 위한 정책은 생성됐고, ` +
      `당신이 만들기 전까지 아무것도 매칭하지 않는다.`
  );
if (fsdOpts.extraRoots.length)
  notes.push(
    `${profile.fsdRoot} 아래 디렉터리 ${fsdOpts.extraRoots.length}개는 레이어가 아니다 (${fsdOpts.extraRoots.join(", ")}). ` +
      `각각 그래프 맨 아래에 등록된다. 무엇이든 그것을 import할 수 있고, 그것은 ` +
      `${fsd.layers[fsd.layers.length - 1].name}과 나머지를 import할 수 있다. 다르게 배치하려면 extraRoots로 답한다.`
  );
if (!proseIsOursToWrite)
  notes.push(
    `CLAUDE.md이 자기 산문을 가지고 있어서 AGENTS.md를 쓰지 않았다. 이 배치는 산문을 ` +
      `AGENTS.md에 두고 CLAUDE.md을 그것을 가리키는 한 줄로 두는데, 옆에 새 AGENTS.md를 ` +
      `만들면 규칙이 두 곳에 살고 어느 쪽도 다른 쪽을 가리키지 않는다. 이 배치를 원하면 ` +
      `CLAUDE.md 내용을 AGENTS.md로 옮기고 CLAUDE.md을 "@AGENTS.md" 한 줄로 바꾼 뒤 다시 돌린다.`
  );
if (boundariesDropped)
  notes.push(
    `Q2에 답이 있었지만 산문 파일이 이미 있어서 "## 안전 경계" 섹션을 쓰지 않았다. ` +
      `경계 ${answers.safetyBoundaries.length}개는 당신의 답변 파일에만 있고 다른 어디에도 없다 — 손으로 더한다.`
  );

const summary = {
  stack,
  target,
  notes,
  written,
  counts: counts(fsd, profile, fsdOpts),
  fsd: { publicApi: fsdOpts.publicApi, sliceCoupling: fsdOpts.sliceCoupling },
  aliases: Object.keys(alias).length,
  aliasSource,
};
if (args.includes("--json")) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`${stack}을(를) ${target}에 scaffold: 파일 ${written.length}개`);
  for (const n of notes) console.log(`  note: ${n}`);
}
