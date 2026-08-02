#!/usr/bin/env node
// 스택 프로필에 대한 정적 검사. 샌드박스도 설치도 없다. 여기 있는 것은 전부 이 레포의
// 파일만으로 답할 수 있고, 그래서 오히려 빠져 있었다. 이것이 잡는 구멍은 남의 레포에서
// 며칠 뒤에야 드러나는 종류다 — 의존성 목록에서 typescript를 빠뜨린 스택이 tsconfig와
// typescript-eslint 설정을 생성하는데 아무것도 그것을 돌릴 수 없다.
//
// 이것들이 공유하는 규칙: 프로필은 scaffold된 레포가 무엇을 담을지에 대한 약속이고,
// 아무것도 검사하지 않는 약속은 스택 하나씩 어긋난다.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile, listStacks, questionsPath } from "../scripts/lib/profile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let failed = false;
const ok = (msg) => console.log(`ok   ${msg}`);
const bad = (msg) => {
  console.log(`FAIL ${msg}`);
  failed = true;
};

const stacks = listStacks(root);
if (!stacks.length) bad("listStacks()가 아무것도 반환하지 않았다");

// 생성된 설정이 이름으로 import하는 모든 패키지. 이것들 없이는 eslint가 시작할 수
// 없고, 실패는 대상 레포의 린트 시점 MODULE_NOT_FOUND다 — 그것을 빠뜨린 프로필에서
// 아주 멀리 떨어진 자리.
//
// typescript는 어떤 설정도 직접 import하지 않지만 목록에 있다. typescript-eslint의
// 파서가 그것을 요구하고, scaffold가 그것을 읽을 컴파일러가 있다고 전제하는
// tsconfig.json을 쓴다.
const REQUIRED_DEPS = [
  "eslint",
  "eslint-plugin-boundaries",
  "typescript-eslint",
  "typescript",
  "eslint-plugin-react-hooks",
  "prettier",
  "@ianvs/prettier-plugin-sort-imports",
];

for (const stack of stacks) {
  const profile = loadProfile(root, stack);

  const missing = REQUIRED_DEPS.filter((d) => !(d in (profile.devDependencies ?? {})));
  if (missing.length) bad(`${stack}: devDependencies에 ${missing.join(", ")}이(가) 없다`);
  else ok(`${stack}: 필요한 devDependencies ${REQUIRED_DEPS.length}개가 모두 선언됨`);

  // scaffold.mjs가 이것은 따로 더하므로, 자기가 나열하지 않은 리졸버 패키지를 지목한
  // 프로필도 설치는 된다. 그래도 하나는 지목해야 한다.
  if (!profile.resolver?.devDependency) bad(`${stack}: resolver.devDependency가 설정되지 않았다`);

  if (!profile.fsdRoot) bad(`${stack}: fsdRoot가 설정되지 않았다`);

  const templates = profile.files ?? [];
  if (!templates.length) bad(`${stack}: files[]가 비어서 실행해도 설정을 쓰지 않는다`);
  for (const f of templates) {
    if (!existsSync(join(root, f.template))) bad(`${stack}: files[]가 없는 템플릿을 지목한다: ${f.template}`);
  }
  ok(`${stack}: 템플릿 ${templates.length}개가 해석됨`);

  // 빈 preset을 지목하는 babel 설정은 babel이 거부하는 설정이다. 그것을 쓰는 스택만
  // 이 규칙에 걸린다.
  const writesBabel = templates.some((f) => f.dest === "babel.config.js");
  if (writesBabel && !profile.babelPreset) bad(`${stack}: babel.config.js를 쓰면서 babelPreset을 선언하지 않았다`);
}

// 오버레이 배선을 양쪽 끝에서 본다. 한 방향은 이름이 바뀐 파일을 가리키는 프로필을
// 잡고, 다른 방향은 존재하면서 절대 읽히지 않는 오버레이를 잡는다. 후자가 이 검사가
// 쓰인 이유다.
const declared = new Map();
for (const stack of stacks) {
  let path;
  try {
    path = questionsPath(root, stack);
  } catch (e) {
    bad(`${stack}: ${e.message}`);
    continue;
  }
  if (path) declared.set(path.split("\\").join("/"), stack);
}

const onDisk = readdirSync(join(root, "stacks"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(root, "stacks", d.name, "questions.json"))
  .filter((p) => existsSync(p))
  .map((p) => p.split("\\").join("/"));

const orphans = onDisk.filter((p) => !declared.has(p));
if (orphans.length) {
  bad(`questions.json이 있는데 어떤 프로필도 선언하지 않았다: ${orphans.map((p) => p.slice(root.length + 1)).join(", ")}`);
} else {
  ok(`인터뷰 오버레이: 선언 ${declared.size}개, 디스크 ${onDisk.length}개, 고아 없음`);
}

// 인터뷰가 실제로 가진 질문 id들. Q8을 지목하는 오버레이는 읽히고, 아무것에도
// 적용되지 않고, 오류도 보고하지 않는다 — `questions` 필드 자체가 그랬던 것과 같은
// 죽은 참조가 한 단계 아래에서 반복되는 것이다.
const interview = readFileSync(join(root, "skills/harness-bootstrap/references/interview.md"), "utf8");
const questionIds = new Set([...interview.matchAll(/^##\s+(Q\d+)\b/gm)].map((m) => m[1]));
if (!questionIds.size) bad("interview.md: Q 번호가 붙은 제목이 없어서 오버레이 대상을 검사할 수 없다");

for (const [path, stack] of declared) {
  let overlay;
  try {
    overlay = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    bad(`${stack}: questions.json이 올바른 JSON이 아니다: ${e.message}`);
    continue;
  }
  if (!Array.isArray(overlay.overlays)) {
    bad(`${stack}: questions.json에 overlays[] 배열이 없다`);
    continue;
  }
  for (const entry of overlay.overlays) {
    if (!questionIds.has(entry.question)) bad(`${stack}: 오버레이가 ${entry.question}를 지목하는데 인터뷰가 그것을 묻지 않는다`);
    if (!Array.isArray(entry.prompts) || !entry.prompts.length) bad(`${stack}: ${entry.question} 오버레이가 prompts를 담지 않았다`);
  }
  ok(`${stack}: 오버레이 ${overlay.overlays.length}개, 전부 존재하는 질문을 지목함`);
}

// abstract 프로필은 확장되기 위해 존재한다. 그것을 선택지로 내놓으면 loadProfile이
// 거부하는 실행이 되므로, 둘은 서로 맞아야 한다.
for (const dir of readdirSync(join(root, "stacks"), { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const p = join(root, "stacks", dir.name, "profile.json");
  if (!existsSync(p)) {
    bad(`stacks/${dir.name}에 profile.json이 없다`);
    continue;
  }
  const raw = JSON.parse(readFileSync(p, "utf8"));
  if (raw.abstract && stacks.includes(dir.name)) bad(`${dir.name}은(는) abstract인데 listStacks()가 그것을 내놓는다`);
  if (!raw.abstract && !stacks.includes(dir.name)) bad(`${dir.name}은(는) 출고 가능한데 listStacks()가 빠뜨린다`);
}
ok(`내놓는 스택: ${stacks.join(", ")}`);

// 스택 목록을 손으로 적어 둔 모든 자리. 새 스택 디렉터리는 스택을 더하는 일의 쉬운
// 절반이고, 잊히는 절반은 이미 존재하는 모든 목록이다. 명령의 힌트에서 빠진 스택은
// 아무에게도 제시되지 않는 스택이다.
const HARDCODED = [
  { file: "commands/harness-bootstrap.md", why: "명령의 argument-hint" },
  { file: "README.md", why: "README의 명령 블록" },
];
for (const { file, why } of HARDCODED) {
  const text = readFileSync(join(root, file), "utf8");
  const listed = [...text.matchAll(/<([a-z0-9-]+(?:\|[a-z0-9-]+)+)>/g)].flatMap((m) => m[1].split("|"));
  const unique = [...new Set(listed)];
  if (!unique.length) {
    bad(`${file}: 스택 목록이 있어야 할 자리에 없다 (${why})`);
    continue;
  }
  const missing = stacks.filter((s) => !unique.includes(s));
  const extra = unique.filter((s) => !stacks.includes(s));
  if (missing.length || extra.length) {
    bad(`${file}: ${why} — [${unique.join("|")}]를 나열하는데, 출고 가능한 스택은 [${stacks.join("|")}]다`);
  } else {
    ok(`${file}: ${why} — listStacks()와 맞는다`);
  }
}

// 기계 판정이라고 선언하면서 아무것도 구현하지 않은 규칙은 예전에 발견을 하나도 내놓지
// 않았고, 그것은 통과한 규칙이 내놓는 것과 같다. 이제 check.mjs가 런타임에 그것을
// 보고하는데, 이 검사는 출고 전에 잡는다. 규칙 집합이 남의 레포에 심어지기 때문에
// 그게 중요하다.
{
  const source = readFileSync(join(root, "scripts/check.mjs"), "utf8");
  const rules = JSON.parse(readFileSync(join(root, "principles/rules.json"), "utf8"));
  const machineRules = rules.items.filter((i) => i.decidable === "machine");
  const unimplemented = machineRules.filter((i) => !source.includes(`"${i.id}":`));
  if (unimplemented.length) bad(`rules.json이 check.mjs가 구현하지 않은 기계 규칙을 선언한다: ${unimplemented.map((i) => i.id).join(", ")}`);
  else ok(`기계 판정 규칙 ${machineRules.length}개 전부에 구현이 있다`);

  // 그리고 반대 방향: 더는 존재하지 않는 규칙 id를 위한 핸들러는 커버리지처럼 읽히는
  // 죽은 코드다.
  const ids = new Set(rules.items.map((i) => i.id));
  const handlers = [...source.matchAll(/^ {2}"([a-z0-9.-]+)":/gm)].map((m) => m[1]);
  const orphanHandlers = handlers.filter((h) => !ids.has(h));
  if (orphanHandlers.length) bad(`check.mjs가 rules.json이 선언하지 않은 규칙을 구현한다: ${orphanHandlers.join(", ")}`);
  else ok(`check.mjs에 고아 규칙 핸들러 없음`);
}

process.exit(failed ? 1 : 0);
