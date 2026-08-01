#!/usr/bin/env node
// Proves the generated prettier config actually reorders imports into the layer
// order, and actually leaves alone the things it must not move.
//
// principles/tooling-over-docs.md only allows the claim "the tool enforces this"
// once a fixture has seen the tool do it. Import order is now a tooling claim -
// report.mjs prints a count for it - so it needs the same treatment the boundary
// policies get, and for a sharper reason: a formatter that silently fails to
// sort produces files that look hand-ordered. Nothing reports it.
//
// The order is derived from layers.json, which is stack-independent; what varies
// per stack is the alias table and whether there is a routing group. `react` is
// the cheapest stack to run (no babel preset to install) and `next` is the one
// with a routing directory, so both run by default.
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
  console.error("--sandbox <dir> is required. Point it at a directory that has prettier and");
  console.error("@ianvs/prettier-plugin-sort-imports installed. Fixtures are written inside it.");
  process.exit(2);
}
const sandbox = resolve(sandboxArg);
const REQUIRED = ["prettier", "@ianvs/prettier-plugin-sort-imports"];
const absent = REQUIRED.filter((p) => !existsSync(join(sandbox, "node_modules", p)));
if (absent.length) {
  console.error(`Missing under ${sandbox}: ${absent.join(", ")}.`);
  console.error("  npm install prettier @ianvs/prettier-plugin-sort-imports");
  process.exit(2);
}
const stacks = opt("stacks", "react,next").split(",");
const keep = args.includes("--keep");

// Written scrambled, checked against the order layers.json declares. The input
// is deliberately the reverse of the expected output for the layer lines: an
// input that was already half-sorted could pass against a plugin that did
// nothing to it.
const SCRAMBLED = `import { c } from '@/shared/c';
import { b } from '@/entities/b';
import { a } from '@/features/a';
import { w } from '@/widgets/w';
import { s } from '@/screens/s';
import { z } from 'zod';
import { rel } from './local';
`;

// Only the layer segment is asserted, in sequence. Asserting the whole file
// would pin third-party placement and blank-line counts, which are the plugin's
// business, not this repo's claim. What is being proven is that the layers come
// out top-down.
const EXPECTED_SEQUENCE = ["@/screens/s", "@/widgets/w", "@/features/a", "@/entities/b", "@/shared/c"];

// The barrier case. `@/shared/polyfill` is a side-effect-only import sitting
// between two sortable ones; the plugin classifies it unsortable and nothing may
// cross it. This is why no interview question asks the repo to list its
// side-effect imports - if this case ever regresses, that reasoning is wrong and
// the question has to come back.
const BARRIER = `import { b } from '@/entities/b';
import '@/shared/polyfill';
import { s } from '@/screens/s';
`;

const norm = (s) => s.split("\r\n").join("\n");
const lineIndex = (text, needle) => norm(text).split("\n").findIndex((l) => l.includes(needle));

let failed = false;
const kept = [];
for (const stack of stacks) {
  const label = `${stack} / import order`;
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
    // Run from the sandbox, where the plugin is installed, against a file in the
    // fixture below it. prettier resolves the config from the file's own
    // directory, so it still picks up the generated prettier.config.mjs.
    execFileSync("npx", ["prettier", "--write", join(target, rel)], { cwd: sandbox, encoding: "utf8", shell: true });
    return readFileSync(join(target, rel), "utf8");
  };

  write("src/shared/scrambled.ts", SCRAMBLED);
  write("src/shared/barrier.ts", BARRIER);

  let sorted = "";
  try {
    sorted = format("src/shared/scrambled.ts");
  } catch (e) {
    problems.push(`prettier failed: ${String(e.stderr ?? e).split("\n")[0]}`);
  }

  if (sorted) {
    // An unmoved file is the failure this whole test exists for: a plugin that
    // is configured but not loaded formats cleanly and sorts nothing.
    if (norm(sorted) === norm(SCRAMBLED)) {
      problems.push("file came back byte-identical - the plugin did not run");
    }
    const at = EXPECTED_SEQUENCE.map((n) => ({ n, i: lineIndex(sorted, n) }));
    const missing = at.filter((x) => x.i < 0);
    if (missing.length) problems.push(`import lost: ${missing.map((m) => m.n).join(", ")}`);
    else {
      for (let i = 1; i < at.length; i += 1) {
        if (at[i].i < at[i - 1].i) problems.push(`out of order: ${at[i - 1].n} should precede ${at[i].n}`);
      }
    }
  }

  let barrier = "";
  try {
    barrier = format("src/shared/barrier.ts");
  } catch (e) {
    problems.push(`prettier failed on the barrier fixture: ${String(e.stderr ?? e).split("\n")[0]}`);
  }
  if (barrier) {
    const side = lineIndex(barrier, "@/shared/polyfill");
    const before = lineIndex(barrier, "@/entities/b");
    const after = lineIndex(barrier, "@/screens/s");
    if (side < 0) problems.push("side-effect import disappeared");
    else if (!(before < side && side < after)) {
      problems.push("side-effect import was crossed - it is not acting as a barrier");
    }
  }

  if (problems.length) {
    failed = true;
    kept.push(target);
    for (const p of problems) console.log(`FAIL ${label}: ${p}`);
  } else {
    console.log(`ok   ${label}: ${EXPECTED_SEQUENCE.length} layer groups ordered, side-effect barrier held`);
    if (keep) kept.push(target);
    else rmSync(target, { recursive: true, force: true });
  }
}
if (kept.length) console.log(`\nfixtures left in place:\n${kept.map((k) => `  ${k}`).join("\n")}`);
process.exit(failed ? 1 : 0);
