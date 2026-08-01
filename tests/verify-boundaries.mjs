#!/usr/bin/env node
// Proves the generated config actually reports violations. Without this, the
// "rules enforced" numbers in report.mjs are a claim, not a measurement.
//
// Runs every stack against every variant pair, because a variant is a different
// config: "publicApi=open" that also stopped enforcing layer direction would
// pass a strict-only fixture set untouched and ship silently.
//
// Needs a directory with eslint + eslint-plugin-boundaries + the stack's
// resolver installed; pass it with --sandbox. Fixtures are written inside it.
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
// An absent --sandbox is an operator error, not a default. resolve("") is the
// current directory, so the omission used to scatter fixtures across whatever
// repo the command was run from and then report every case as failing - a
// missing install reported as a broken product.
const sandboxArg = opt("sandbox", "");
if (!sandboxArg) {
  console.error("--sandbox <dir> is required. Point it at a directory that has eslint,");
  console.error("eslint-plugin-boundaries, and every stack's resolver installed. Fixtures");
  console.error("are written inside it.");
  process.exit(2);
}
const sandbox = resolve(sandboxArg);
// The plugin resolving is what separates a real result from noise: without it
// eslint dies per fixture and every case reads as a failure for the wrong reason.
if (!existsSync(join(sandbox, "node_modules", "eslint-plugin-boundaries"))) {
  console.error(`No eslint-plugin-boundaries under ${sandbox}. Install the deps there first:`);
  console.error("  npm install eslint eslint-plugin-boundaries eslint-import-resolver-typescript \\");
  console.error("    eslint-import-resolver-babel-module babel-plugin-module-resolver \\");
  console.error("    @babel/core @react-native/babel-preset babel-preset-expo");
  process.exit(2);
}
// Passing fixtures are deleted; failing ones stay. --keep retains both.
const keep = args.includes("--keep");
const kept = [];
// Every shippable stack, not a sample. report.mjs may only print a boundary
// count for a stack this file has confirmed.
const stacks = (opt("stacks", "react,rn-cli,next,rn-expo")).split(",");

// Both axes are exercised alone and together. Testing only the pair would leave
// them indistinguishable: one answer wrongly relaxing the other's constraint
// would look identical to the pair working.
const VARIANTS = [
  { name: "strict", answers: {} },
  { name: "open-api", answers: { publicApi: "open" } },
  { name: "same-layer", answers: { sliceCoupling: "same-layer" } },
  { name: "open+same-layer", answers: { publicApi: "open", sliceCoupling: "same-layer" } },
];
const variants = VARIANTS.filter((v) => (opt("variants", "") ? opt("variants").split(",").includes(v.name) : true));

// One fixture set, one expectation table. `violates` is keyed by variant, so
// moving a case from violation to control is a visible edit here rather than a
// second fixture file that drifts from this one.
//
// "reverse layer" violates under every variant on purpose. It is the constraint
// no answer may switch off, and it is also the positive control that tells a
// working config from one that matched nothing at all.
const CASES = [
  {
    name: "reverse layer",
    file: "src/entities/x/index.js",
    body: 'import "@/features/a";\n',
    violates: { strict: true, "open-api": true, "same-layer": true, "open+same-layer": true },
  },
  {
    name: "cross-slice",
    file: "src/features/b/index.js",
    body: 'import "@/features/a";\n',
    violates: { strict: true, "open-api": true, "same-layer": false, "open+same-layer": false },
  },
  {
    name: "deep import",
    file: "src/features/a/index.js",
    body: 'import "@/entities/x/model";\n',
    violates: { strict: true, "open-api": false, "same-layer": true, "open+same-layer": false },
  },
  // Positive controls. Negative fixtures alone cannot tell a working config from
  // one that denies everything: a config with no resolver reports every case as
  // a violation and blocks legal imports too. Each covers a different way that
  // can happen.
  //   features/c  a legal downward import through a public API still resolves
  //   features/d  checkInternals stays false, so same-slice imports are not checked
  {
    name: "downward through public API",
    file: "src/features/c/index.js",
    body: 'import "@/entities/x";\n',
    violates: { strict: false, "open-api": false, "same-layer": false, "open+same-layer": false },
  },
  {
    name: "same-slice internal",
    file: "src/features/d/index.js",
    body: 'import "./helper";\n',
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
    try { results = JSON.parse(out || "[]"); } catch { /* non-json crash */ }

    const expected = CASES.filter((c) => c.violates[variant.name]);
    const controls = CASES.filter((c) => !c.violates[variant.name]);
    const reported = results.filter((r) => r.messages.some((m) => m.ruleId === "boundaries/dependencies"));

    const missed = expected.filter((e) => !reported.some((v) => norm(v.filePath).includes(e.file)));
    // A control fails two ways: it reported a violation, or it was never linted
    // at all. An unlinted file has no messages, which would otherwise read as
    // clean.
    const dirty = controls.filter((c) => {
      const r = results.find((x) => norm(x.filePath).includes(c.file));
      return !r || r.messages.length > 0;
    });

    let passed = false;
    if (reported.length === 0) {
      console.log(`FAIL ${label}: 0 violations reported. The config matched nothing - this is a failure, not a pass.`);
    } else if (missed.length || dirty.length) {
      if (missed.length) console.log(`FAIL ${label}: not reported - ${missed.map((m) => m.name).join(", ")}`);
      if (dirty.length) console.log(`FAIL ${label}: control not clean - ${dirty.map((c) => c.name).join(", ")}`);
    } else {
      console.log(`ok   ${label}: ${expected.length}/${expected.length} violations reported, ${controls.length}/${controls.length} controls clean`);
      passed = true;
    }

    // A fixture that passed has nothing left to say. A fixture that failed is the
    // only record of what the config actually did, so it stays readable on disk.
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
if (kept.length) console.log(`\nfixtures left in place:\n${kept.map((k) => `  ${k}`).join("\n")}`);
process.exit(failed ? 1 : 0);
