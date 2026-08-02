#!/usr/bin/env node
// 생성된 진입 설정의 규칙이 실제로 걸리는지, 그리고 탈출구가 실제로 놓아주는지 증명한다.
//
// principles/tooling-over-docs.md는 픽스처가 도구의 보고를 본 뒤에만 "이건 도구가
// 강제한다"는 주장을 허용한다. 그것은 진입 설정이 켜는 모든 규칙에 적용되지, 경계
// 정책에만 적용되지 않는다 — 경계 정책은 verify-boundaries.mjs가 덮는다.
//
// 규칙은 스택과 무관하므로 스택 하나면 충분하다. `react`가 가장 싸다. babel preset을
// 설치할 필요가 없기 때문이다. --stack으로 바꿀 수 있다.
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const sandboxArg = opt("sandbox", "");
if (!sandboxArg) {
  console.error("--sandbox <dir>가 필요하다. eslint, typescript-eslint, typescript,");
  console.error("eslint-plugin-react-hooks, 그리고 그 스택의 리졸버가 설치된 디렉터리를");
  console.error("가리킨다. 픽스처는 그 안에 쓰인다.");
  process.exit(2);
}
const sandbox = resolve(sandboxArg);
const REQUIRED = ["typescript-eslint", "typescript", "eslint-plugin-react-hooks", "eslint-plugin-boundaries"];
const absent = REQUIRED.filter((p) => !existsSync(join(sandbox, "node_modules", p)));
if (absent.length) {
  console.error(`${sandbox} 아래에 없다: ${absent.join(", ")}.`);
  process.exit(2);
}
const stack = opt("stack", "react");
const keep = args.includes("--keep");

// 픽스처는 `shared`에 둔다. 맨 아래 레이어이고 거쳐야 할 public API가 없으므로, 여기서
// 나온 것이 boundaries 메시지를 주워 규칙이 걸린 것으로 오인될 일이 없다.
//
// `expect`는 그 파일이 만들어내야 하는 규칙 id의 정확한 집합이다. "최소한"이 아니라
// 정확히. 옆 파일에도 걸리는 규칙은 꺼지게 될 규칙이고, 지나치게 관대한 탈출구는 깨끗한
// 경우를 0으로 붙들지 않으면 보이지 않는다.
const CASES = [
  {
    name: "남겨진 console",
    file: "src/shared/console-left-behind.ts",
    body: "export function report(value: string) {\n  console.log(value);\n}\n",
    expect: ["no-console"],
  },
  {
    name: "리팩터링 후 안 쓰이게 된 인자",
    file: "src/shared/unused-arg.ts",
    body: "export function pick(a: string, b: string) {\n  return a;\n}\n",
    expect: ["@typescript-eslint/no-unused-vars"],
  },
  {
    name: "조건부로 호출된 훅",
    file: "src/shared/conditional-hook.ts",
    body: "export function useThing(flag: boolean) {\n  if (flag) {\n    useState();\n  }\n}\n",
    expect: ["react-hooks/rules-of-hooks"],
  },
  {
    name: "낡은 의존성 배열",
    file: "src/shared/stale-deps.ts",
    body: "export function useThing(id: string) {\n  useEffect(() => {\n    send(id);\n  }, []);\n}\n",
    expect: ["react-hooks/exhaustive-deps"],
  },
  // 대조군. 이것들이 없으면 설정된 규칙과 전부에 걸리는 설정을 구별할 수 없고, `^_`
  // 옵션은 시험되지 않은 채 남는다 — 그 규칙이 쓸 만한지가 통째로 달린 옵션이 그것이다.
  {
    name: "밑줄 인자는 면제된다",
    file: "src/shared/underscore-arg.ts",
    body: "export function pick(a: string, _b: string) {\n  return a;\n}\n",
    expect: [],
  },
  {
    name: "평범한 코드는 깨끗하다",
    file: "src/shared/clean.ts",
    body: "export const add = (a: number, b: number) => a + b;\n",
    expect: [],
  },
];

const norm = (p) => p.split("\\").join("/");
const target = join(sandbox, `verify-rules-${stack}`);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
execFileSync(process.execPath, [join(root, "scripts/scaffold.mjs"), stack, "--target", target], { stdio: "ignore" });

for (const c of CASES) {
  mkdirSync(dirname(join(target, c.file)), { recursive: true });
  writeFileSync(join(target, c.file), c.body);
}

let out = "";
try {
  // 이 규칙 대부분이 경고라서 eslint가 0으로 종료하고 보고서는 stdout으로 돌아온다.
  // 오류 경로만 읽으면 깨끗한 스위트로 보고하게 된다.
  out = execFileSync("npx", ["eslint", "src", "-f", "json"], { cwd: target, encoding: "utf8", shell: true });
} catch (e) {
  out = e.stdout ?? "";
}
let results = [];
try { results = JSON.parse(out || "[]"); } catch { /* JSON이 아닌 크래시 */ }

let failed = false;
for (const c of CASES) {
  const r = results.find((x) => norm(x.filePath).includes(c.file));
  // 린트되지 않은 파일은 메시지가 없고, 그것은 깨끗한 대조군과 똑같이 읽힌다.
  if (!r) {
    console.log(`FAIL ${c.name}: 아예 린트되지 않았다`);
    failed = true;
    continue;
  }
  const got = [...new Set(r.messages.map((m) => m.ruleId ?? `parse: ${m.message}`))].sort();
  const want = [...c.expect].sort();
  if (got.join(",") === want.join(",")) {
    console.log(`ok   ${c.name}${want.length ? `: ${want.join(", ")}` : ": 깨끗함"}`);
    continue;
  }
  console.log(`FAIL ${c.name}: 기대 [${want.join(", ")}], 받은 값 [${got.join(", ")}]`);
  failed = true;
}

if (failed || keep) console.log(`\n픽스처를 남겨 둠:\n  ${target}`);
else rmSync(target, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
