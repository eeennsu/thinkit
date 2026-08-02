#!/usr/bin/env node
// 생성된 prettier 설정이 실제로 import를 레이어 순서로 재정렬하는지, 그리고 옮기면 안
// 되는 것은 실제로 그대로 두는지 증명한다.
//
// principles/tooling-over-docs.md는 픽스처가 도구가 그렇게 하는 것을 본 뒤에만 "이건
// 도구가 강제한다"는 주장을 허용한다. import 순서는 이제 도구 주장이다 — report.mjs가
// 그것의 개수를 출력한다 — 그러니 경계 정책과 같은 대접이 필요하고, 이유는 더 날카롭다.
// 조용히 정렬에 실패하는 포매터는 손으로 정렬한 것처럼 보이는 파일을 만들어낸다.
// 아무것도 그것을 보고하지 않는다.
//
// 순서는 layers.json에서 파생되고 그것은 스택과 무관하다. 스택마다 달라지는 것은 alias
// 테이블과 라우팅 그룹이 있는지 여부다. `react`가 돌리기 가장 싼 스택이고(설치할 babel
// preset이 없다) `next`가 라우팅 디렉터리를 가진 쪽이라, 기본으로 둘 다 돈다.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const sandboxArg = opt("sandbox", "");
if (!sandboxArg) {
  console.error("--sandbox <dir>가 필요하다. prettier와 @ianvs/prettier-plugin-sort-imports가");
  console.error("설치된 디렉터리를 가리킨다. 픽스처는 그 안에 쓰인다.");
  process.exit(2);
}
const sandbox = resolve(sandboxArg);
const REQUIRED = ["prettier", "@ianvs/prettier-plugin-sort-imports"];
const absent = REQUIRED.filter((p) => !existsSync(join(sandbox, "node_modules", p)));
if (absent.length) {
  console.error(`${sandbox} 아래에 없다: ${absent.join(", ")}.`);
  console.error("  npm install prettier @ianvs/prettier-plugin-sort-imports");
  process.exit(2);
}
const stacks = opt("stacks", "react,next").split(",");
const keep = args.includes("--keep");

// 뒤섞어서 쓰고, layers.json이 선언하는 순서에 비추어 검사한다. 입력은 레이어 줄에
// 대해 일부러 기대 출력의 역순이다. 이미 절반쯤 정렬된 입력은 아무것도 하지 않은
// 플러그인에 대고도 통과할 수 있다.
const SCRAMBLED = `import { c } from '@/shared/c';
import { b } from '@/entities/b';
import { a } from '@/features/a';
import { w } from '@/widgets/w';
import { s } from '@/screens/s';
import { z } from 'zod';
import { rel } from './local';
`;

// 레이어 구간만 순서대로 검증한다. 파일 전체를 검증하면 third-party 배치와 빈 줄
// 개수를 고정하게 되는데, 그것은 플러그인의 일이지 이 레포의 주장이 아니다. 증명하려는
// 것은 레이어가 위에서 아래 순서로 나온다는 것이다.
const EXPECTED_SEQUENCE = ["@/screens/s", "@/widgets/w", "@/features/a", "@/entities/b", "@/shared/c"];

// 장벽 경우. `@/shared/polyfill`은 정렬 가능한 두 import 사이에 앉은 부수효과 전용
// import다. 플러그인이 그것을 정렬 불가로 분류하고 아무것도 그것을 넘어갈 수 없다.
// 어떤 인터뷰 질문도 레포에 부수효과 import를 나열해 달라고 하지 않는 이유가 이것이다 —
// 이 경우가 언젠가 회귀하면 그 추론이 틀린 것이고 질문이 돌아와야 한다.
const BARRIER = `import { b } from '@/entities/b';
import '@/shared/polyfill';
import { s } from '@/screens/s';
`;

const norm = (s) => s.split("\r\n").join("\n");
const lineIndex = (text, needle) => norm(text).split("\n").findIndex((l) => l.includes(needle));

let failed = false;
const kept = [];
for (const stack of stacks) {
  const label = `${stack} / import 순서`;
  const target = join(sandbox, `verify-import-order-${stack}`);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  execFileSync(
    process.execPath,
    [join(root, "scripts/scaffold.mjs"), stack, "--target", target],
    { stdio: "ignore" }
  );

  const problems = [];
  const write = (rel, body) => {
    mkdirSync(dirname(join(target, rel)), { recursive: true });
    writeFileSync(join(target, rel), body, "utf8");
  };
  const format = (rel) => {
    // 플러그인이 설치된 샌드박스에서, 그 아래 픽스처의 파일에 대고 돌린다. prettier는
    // 설정을 파일 자신의 디렉터리에서 해석하므로 생성된 prettier.config.mjs를 그대로
    // 집어 든다.
    execFileSync("npx", ["prettier", "--write", join(target, rel)], { cwd: sandbox, encoding: "utf8", shell: true });
    return readFileSync(join(target, rel), "utf8");
  };

  write("src/shared/scrambled.ts", SCRAMBLED);
  write("src/shared/barrier.ts", BARRIER);

  let sorted = "";
  try {
    sorted = format("src/shared/scrambled.ts");
  } catch (e) {
    problems.push(`prettier 실패: ${String(e.stderr ?? e).split("\n")[0]}`);
  }

  if (sorted) {
    // 움직이지 않은 파일이 이 테스트 전체가 존재하는 이유가 되는 실패다. 설정은
    // 됐지만 로드되지 않은 플러그인은 깔끔하게 포매팅하면서 아무것도 정렬하지 않는다.
    if (norm(sorted) === norm(SCRAMBLED)) {
      problems.push("파일이 바이트가 같은 채로 돌아왔다 - 플러그인이 돌지 않았다");
    }
    const at = EXPECTED_SEQUENCE.map((n) => ({ n, i: lineIndex(sorted, n) }));
    const missing = at.filter((x) => x.i < 0);
    if (missing.length) problems.push(`import 유실: ${missing.map((m) => m.n).join(", ")}`);
    else {
      for (let i = 1; i < at.length; i += 1) {
        if (at[i].i < at[i - 1].i) problems.push(`순서 어긋남: ${at[i - 1].n}이(가) ${at[i].n}보다 앞서야 한다`);
      }
    }
  }

  let barrier = "";
  try {
    barrier = format("src/shared/barrier.ts");
  } catch (e) {
    problems.push(`장벽 픽스처에서 prettier 실패: ${String(e.stderr ?? e).split("\n")[0]}`);
  }
  if (barrier) {
    const side = lineIndex(barrier, "@/shared/polyfill");
    const before = lineIndex(barrier, "@/entities/b");
    const after = lineIndex(barrier, "@/screens/s");
    if (side < 0) problems.push("부수효과 import가 사라졌다");
    else if (!(before < side && side < after)) {
      problems.push("부수효과 import를 넘어갔다 - 장벽으로 작동하지 않는다");
    }
  }

  if (problems.length) {
    failed = true;
    kept.push(target);
    for (const p of problems) console.log(`FAIL ${label}: ${p}`);
  } else {
    console.log(`ok   ${label}: 레이어 그룹 ${EXPECTED_SEQUENCE.length}개 정렬됨, 부수효과 장벽 유지됨`);
    if (keep) kept.push(target);
    else rmSync(target, { recursive: true, force: true });
  }
}
if (kept.length) console.log(`\n픽스처를 남겨 둠:\n${kept.map((k) => `  ${k}`).join("\n")}`);
process.exit(failed ? 1 : 0);
