#!/usr/bin/env node
// Proves the rules in the generated entry config actually fire, and that the
// escape hatches actually let go.
//
// principles/tooling-over-docs.md only allows the claim "the tool enforces this"
// once a fixture has seen the tool report it. That applies to every rule the
// entry config turns on, not just the boundary policies - which is what
// verify-boundaries.mjs covers.
//
// The rules are stack-independent, so one stack is enough; `react` is the
// cheapest because it needs no babel preset installed. Override with --stack.
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
  console.error("--sandbox <dir> is required. Point it at a directory that has eslint,");
  console.error("typescript-eslint, typescript, eslint-plugin-react-hooks and the stack's");
  console.error("resolver installed. Fixtures are written inside it.");
  process.exit(2);
}
const sandbox = resolve(sandboxArg);
const REQUIRED = ["typescript-eslint", "typescript", "eslint-plugin-react-hooks", "eslint-plugin-boundaries"];
const absent = REQUIRED.filter((p) => !existsSync(join(sandbox, "node_modules", p)));
if (absent.length) {
  console.error(`Missing under ${sandbox}: ${absent.join(", ")}.`);
  process.exit(2);
}
const stack = opt("stack", "react");
const keep = args.includes("--keep");

// Fixtures sit in `shared`: it is the bottom layer and has no public API to go
// through, so nothing here can pick up a boundaries message and be mistaken for
// a rule firing.
//
// `expect` is the exact set of rule ids the file must produce. Exact, not "at
// least": a rule that also fires on the file next door is a rule that will be
// switched off, and an over-eager escape hatch is invisible unless the clean
// cases are held to zero.
const CASES = [
  {
    name: "console left behind",
    file: "src/shared/console-left-behind.ts",
    body: "export function report(value: string) {\n  console.log(value);\n}\n",
    expect: ["no-console"],
  },
  {
    name: "argument unused after a refactor",
    file: "src/shared/unused-arg.ts",
    body: "export function pick(a: string, b: string) {\n  return a;\n}\n",
    expect: ["@typescript-eslint/no-unused-vars"],
  },
  {
    name: "hook called conditionally",
    file: "src/shared/conditional-hook.ts",
    body: "export function useThing(flag: boolean) {\n  if (flag) {\n    useState();\n  }\n}\n",
    expect: ["react-hooks/rules-of-hooks"],
  },
  {
    name: "stale dependency array",
    file: "src/shared/stale-deps.ts",
    body: "export function useThing(id: string) {\n  useEffect(() => {\n    send(id);\n  }, []);\n}\n",
    expect: ["react-hooks/exhaustive-deps"],
  },
  // Controls. Without these the suite cannot tell the configured rules from a
  // config that flags everything, and the `^_` option would be untested - which
  // is the option the whole rule depends on being usable.
  {
    name: "underscore argument is exempt",
    file: "src/shared/underscore-arg.ts",
    body: "export function pick(a: string, _b: string) {\n  return a;\n}\n",
    expect: [],
  },
  {
    name: "ordinary code is clean",
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
  // Most of these rules are warnings, so eslint exits 0 and the report comes
  // back on stdout. Reading only the error path would report a clean suite.
  out = execFileSync("npx", ["eslint", "src", "-f", "json"], { cwd: target, encoding: "utf8", shell: true });
} catch (e) {
  out = e.stdout ?? "";
}
let results = [];
try { results = JSON.parse(out || "[]"); } catch { /* non-json crash */ }

let failed = false;
for (const c of CASES) {
  const r = results.find((x) => norm(x.filePath).includes(c.file));
  // An unlinted file has no messages, which reads exactly like a clean control.
  if (!r) {
    console.log(`FAIL ${c.name}: not linted at all`);
    failed = true;
    continue;
  }
  const got = [...new Set(r.messages.map((m) => m.ruleId ?? `parse: ${m.message}`))].sort();
  const want = [...c.expect].sort();
  if (got.join(",") === want.join(",")) {
    console.log(`ok   ${c.name}${want.length ? `: ${want.join(", ")}` : ": clean"}`);
    continue;
  }
  console.log(`FAIL ${c.name}: expected [${want.join(", ")}], got [${got.join(", ")}]`);
  failed = true;
}

if (failed || keep) console.log(`\nfixture left in place:\n  ${target}`);
else rmSync(target, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
