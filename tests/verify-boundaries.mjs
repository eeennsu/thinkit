#!/usr/bin/env node
// 생성된 설정이 실제로 위반을 보고하는지 증명한다. 이것이 없으면 report.mjs의
// "도구가 강제하는 규칙" 숫자는 측정이 아니라 주장이다.
//
// 모든 스택을 모든 변형 쌍에 대고 돌린다. 변형이 다르면 다른 설정이기 때문이다.
// 레이어 방향 강제까지 멈춰버린 "publicApi=open"은 엄격한 픽스처 집합만 있으면
// 손대지 않고 통과해 조용히 출고된다.
//
// eslint + eslint-plugin-boundaries + 그 스택의 리졸버가 설치된 디렉터리가 필요하다.
// --sandbox로 넘긴다. 픽스처는 그 안에 쓰인다.
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { listStacks } from "../scripts/lib/profile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
// --sandbox가 없는 것은 기본값이 아니라 운영자 오류다. resolve("")는 현재
// 디렉터리이므로, 빠뜨리면 명령을 돌린 레포 여기저기에 픽스처를 흩뿌린 뒤 모든 경우를
// 실패로 보고했다 — 설치가 안 된 것을 망가진 제품으로 보고한 것이다.
const sandboxArg = opt("sandbox", "");
if (!sandboxArg) {
  console.error("--sandbox <dir>가 필요하다. eslint, eslint-plugin-boundaries, 그리고 모든");
  console.error("스택의 리졸버가 설치된 디렉터리를 가리킨다. 픽스처는 그 안에 쓰인다.");
  process.exit(2);
}
const sandbox = resolve(sandboxArg);
// 플러그인이 해석되는 것이 진짜 결과와 잡음을 가른다. 그것이 없으면 픽스처마다
// eslint가 죽고 모든 경우가 엉뚱한 이유로 실패로 읽힌다. 생성된 진입 설정이 셋 다
// import하므로, 하나만 없어도 픽스처를 한 개도 읽기 전에 eslint가 죽는다.
const REQUIRED = ["eslint-plugin-boundaries", "typescript-eslint", "eslint-plugin-react-hooks"];
const absent = REQUIRED.filter((p) => !existsSync(join(sandbox, "node_modules", p)));
if (absent.length) {
  console.error(`${sandbox} 아래에 없다: ${absent.join(", ")}. 거기에 먼저 의존성을 설치한다:`);
  console.error("  npm install eslint eslint-plugin-boundaries eslint-import-resolver-typescript \\");
  console.error("    eslint-import-resolver-babel-module babel-plugin-module-resolver \\");
  console.error("    @babel/core @react-native/babel-preset babel-preset-expo \\");
  console.error("    typescript-eslint typescript eslint-plugin-react-hooks");
  process.exit(2);
}
// 통과한 픽스처는 지우고 실패한 것은 남긴다. --keep은 둘 다 남긴다.
const keep = args.includes("--keep");
const kept = [];
// 표본이 아니라 출고 가능한 모든 스택. report.mjs는 이 파일이 확인한 스택에 대해서만
// 경계 개수를 출력할 수 있으므로, 기본 집합은 타이핑하지 않고 유도한다. 하드코딩된
// 목록은 새 스택이 더해질 때 빠지는 목록이고, 그러면 그 스택은 개수가 확인되지 않은 채
// 아무 말 없이 출고된다.
const stacks = opt("stacks", "") ? opt("stacks").split(",") : listStacks(root);

// 두 축을 따로도 함께도 돌린다. 쌍만 시험하면 둘을 구별할 수 없다. 한 답변이 다른
// 답변의 제약을 잘못 느슨하게 하는 것이 쌍이 제대로 도는 것과 똑같아 보인다.
const VARIANTS = [
  { name: "strict", answers: {} },
  { name: "open-api", answers: { publicApi: "open" } },
  { name: "same-layer", answers: { sliceCoupling: "same-layer" } },
  { name: "open+same-layer", answers: { publicApi: "open", sliceCoupling: "same-layer" } },
];
const variants = VARIANTS.filter((v) => (opt("variants", "") ? opt("variants").split(",").includes(v.name) : true));

// 픽스처 집합 하나, 기대 표 하나. `violates`는 변형으로 키를 잡으므로, 어떤 경우를
// 위반에서 대조군으로 옮기는 것이 여기서 보이는 편집이 된다. 이 파일과 어긋나는 두
// 번째 픽스처 파일이 생기지 않는다.
//
// "역방향 레이어"는 일부러 모든 변형에서 위반한다. 어떤 답변도 끌 수 없는 제약이고,
// 동시에 제대로 도는 설정과 아무것도 매칭하지 못한 설정을 가르는 양성 대조군이다.
const CASES = [
  {
    name: "역방향 레이어",
    file: "src/entities/x/index.js",
    body: 'import "@/features/a";\n',
    violates: { strict: true, "open-api": true, "same-layer": true, "open+same-layer": true },
  },
  {
    name: "슬라이스 간 import",
    file: "src/features/b/index.js",
    body: 'import "@/features/a";\n',
    violates: { strict: true, "open-api": true, "same-layer": false, "open+same-layer": false },
  },
  {
    name: "깊은 import",
    file: "src/features/a/index.js",
    body: 'import "@/entities/x/model";\n',
    violates: { strict: true, "open-api": false, "same-layer": true, "open+same-layer": false },
  },
  // 양성 대조군. 음성 픽스처만으로는 제대로 도는 설정과 전부를 막는 설정을 구별할 수
  // 없다. 리졸버가 없는 설정은 모든 경우를 위반으로 보고하면서 합법인 import도 막는다.
  // 각각이 그렇게 될 수 있는 서로 다른 경로를 덮는다.
  //   features/c  public API를 거치는 합법적인 아래 방향 import가 여전히 해석된다
  //   features/d  checkInternals가 false로 남아서 같은 슬라이스 안의 import는 검사되지 않는다
  {
    name: "public API를 거치는 아래 방향",
    file: "src/features/c/index.js",
    body: 'import "@/entities/x";\n',
    violates: { strict: false, "open-api": false, "same-layer": false, "open+same-layer": false },
  },
  {
    name: "같은 슬라이스 내부",
    file: "src/features/d/index.js",
    body: 'import "./helper";\n',
    violates: { strict: false, "open-api": false, "same-layer": false, "open+same-layer": false },
  },
  // boundaries 블록은 `**/*.{ts,tsx,js,jsx}`를 주장하는데 여기 다른 픽스처는 전부
  // .js라서, TypeScript를 아예 파싱하지 못하는 설정을 위쪽 어느 것도 알아채지 못한다.
  // 파서가 없으면 파싱 오류 메시지로 드러나고, 그것이 진짜 위반과 같은 방식으로 이
  // 대조군을 실패시킨다.
  {
    name: "typescript가 파싱된다",
    file: "src/features/e/index.ts",
    body: "export const n: number = 1;\n",
    violates: { strict: false, "open-api": false, "same-layer": false, "open+same-layer": false },
  },
];
const SUPPORT = {
  "src/entities/x/model.js": "export const model = 1;\n",
  "src/features/d/helper.js": "export const helper = 1;\n",
};

const norm = (p) => p.split("\\").join("/");

let failed = false;
for (const stack of stacks) {
  for (const variant of variants) {
    const label = `${stack} / ${variant.name}`;
    const target = join(sandbox, `verify-${stack}-${variant.name}`);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });

    const answersPath = join(target, "answers.json");
    writeFileSync(answersPath, JSON.stringify(variant.answers), "utf8");
    execFileSync(
      process.execPath,
      [join(root, "scripts/scaffold.mjs"), stack, "--target", target, "--answers", answersPath],
      { stdio: "ignore" }
    );

    for (const [rel, body] of Object.entries(SUPPORT)) {
      mkdirSync(dirname(join(target, rel)), { recursive: true });
      writeFileSync(join(target, rel), body);
    }
    for (const c of CASES) {
      mkdirSync(dirname(join(target, c.file)), { recursive: true });
      writeFileSync(join(target, c.file), c.body);
    }

    let out = "";
    try {
      execFileSync("npx", ["eslint", "src", "-f", "json"], { cwd: target, encoding: "utf8", shell: true });
    } catch (e) {
      out = e.stdout ?? "";
    }
    let results = [];
    try { results = JSON.parse(out || "[]"); } catch { /* JSON이 아닌 크래시 */ }

    const expected = CASES.filter((c) => c.violates[variant.name]);
    const controls = CASES.filter((c) => !c.violates[variant.name]);
    const reported = results.filter((r) => r.messages.some((m) => m.ruleId === "boundaries/dependencies"));

    const missed = expected.filter((e) => !reported.some((v) => norm(v.filePath).includes(e.file)));
    // 대조군은 두 방향으로 실패한다. 위반을 보고했거나, 아예 린트되지 않았거나.
    // 린트되지 않은 파일은 메시지가 없고, 그것은 깨끗한 것으로 읽힌다.
    const dirty = controls.filter((c) => {
      const r = results.find((x) => norm(x.filePath).includes(c.file));
      return !r || r.messages.length > 0;
    });

    let passed = false;
    if (reported.length === 0) {
      console.log(`FAIL ${label}: 위반 0건 보고. 설정이 아무것도 매칭하지 못했다 - 이것은 통과가 아니라 실패다.`);
    } else if (missed.length || dirty.length) {
      if (missed.length) console.log(`FAIL ${label}: 보고되지 않음 - ${missed.map((m) => m.name).join(", ")}`);
      if (dirty.length) console.log(`FAIL ${label}: 대조군이 깨끗하지 않음 - ${dirty.map((c) => c.name).join(", ")}`);
    } else {
      console.log(`ok   ${label}: 위반 ${expected.length}/${expected.length}건 보고, 대조군 ${controls.length}/${controls.length}건 깨끗`);
      passed = true;
    }

    // 통과한 픽스처는 더 할 말이 없다. 실패한 픽스처는 설정이 실제로 무엇을 했는지에
    // 대한 유일한 기록이므로 디스크에 읽을 수 있게 남는다.
    if (!passed) {
      failed = true;
      kept.push(target);
    } else if (keep) {
      kept.push(target);
    } else {
      rmSync(target, { recursive: true, force: true });
    }
  }
}
if (kept.length) console.log(`\n픽스처를 남겨 둠:\n${kept.map((k) => `  ${k}`).join("\n")}`);
process.exit(failed ? 1 : 0);
