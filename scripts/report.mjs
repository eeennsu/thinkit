#!/usr/bin/env node
// Completion report. Every line states its unit, because a headline number
// with no unit is marketing.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadProfile, listStacks } from "./lib/profile.mjs";
import { readAlias } from "./lib/alias.mjs";
import { ownedUnchanged, plantedFiles } from "./lib/planted.mjs";
import { counts, resolveOptions } from "./fsd-boundaries.mjs";
import { groupDirs } from "./import-order.mjs";
import { parseJsonc } from "./lib/jsonc.mjs";
import { shadowed } from "./lib/precedence.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const stack = args[0];
// Same guard scaffold.mjs has. Without it a missing stack reached loadProfile as
// undefined and came back as a path-join TypeError -- a crash in our code for
// what is a usage error.
if (!stack || stack.startsWith("--")) {
  console.error("usage: report.mjs <stack> --target <dir>");
  console.error(`stacks: ${listStacks(root).join(", ")}`);
  process.exit(2);
}
const target = resolve(opt("target", process.cwd()));

const profile = loadProfile(root, stack);
const fsd = JSON.parse(readFileSync(join(root, "modules/fsd/layers.json"), "utf8"));

// The variants came from an answer, so they are read back from what scaffold
// recorded. Recomputing them from the profile would report the strict counts on
// a repo that answered otherwise -- the config would say one thing and the
// report another.
const manifestPath = join(target, ".claude/harness/manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const fsdOpts = resolveOptions(fsd, profile, manifest?.fsd ?? {});
const c = counts(fsd, profile, fsdOpts);
const { alias, source: aliasSource } = await readAlias(target, profile, ownedUnchanged(target, manifest));
const aliases = Object.keys(alias).length;

// A real tsconfig.json is JSONC: comments and trailing commas are legal there
// and fatal to JSON.parse. An unreadable one counts zero strict flags, which is
// what the file tells us; it does not stop the report.
//
// The stripping lives in lib/jsonc.mjs because doing it with a regex here read
// `"@app/*": ["src/app/*"]` as an open block comment and reported zero flags on
// a tsconfig that had five.
function readJsonc(path) {
  if (!existsSync(path)) return null;
  return parseJsonc(readFileSync(path, "utf8"));
}
const tsconfig = readJsonc(join(target, "tsconfig.json"));
const strictFlags = tsconfig
  ? Object.entries(tsconfig.compilerOptions ?? {}).filter(([k, v]) => v === true && /^(strict|no|exact)/.test(k)).length
  : 0;

// Ownership, not presence. A repo that already had a prettier.config.mjs got it
// left alone, and that file is not the one carrying the generated import order
// -- counting it because a file of that name exists reports someone else's
// formatter as ours. The manifest records only what this plugin wrote.
const owns = (rel) => Boolean(manifest?.files?.some((f) => f.path === rel));
const prettier = owns("prettier.config.mjs") ? 1 : 0;
const importGroups = prettier ? groupDirs(fsd, profile, fsdOpts).length : 0;

// Ownership answers "did we write this file". It does not answer "does the tool
// read it". On a repo that already had eslint.config.js, ours is never loaded --
// so the boundary policies in it enforce nothing, and a total that includes them
// is a claim no run can support. Counted only when the file is the one in effect.
const eslintShadow = owns("eslint.config.mjs") ? shadowed(target, "eslint.config.mjs") : { shadowed: false, winner: null };
const prettierShadow = prettier ? shadowed(target, "prettier.config.mjs") : { shadowed: false, winner: null };
const shadowNote = (s) => (s.shadowed ? `   <- generated but shadowed by ${s.winner}; not loaded, not counted` : "");
const live = (s, n) => (s.shadowed ? 0 : n);

// The alias table only enforces anything once it is written somewhere. When it
// came from the profile and the repo kept its own tsconfig, it was generated
// into a file we did not write -- which is to say, into nothing.
const aliasesPlanted = aliasSource !== "profile" || owns("tsconfig.json");
const aliasNote = aliasesPlanted
  ? `alias entries, ${aliasSource === "profile" ? "generated into tsconfig paths and the bundler config" : `read from ${aliasSource}`}`
  : `alias entries; the repo's own tsconfig.json was left in place, so the generated table was written nowhere`;

// The conditional artifacts are listed too. They exist only when an interview
// answer called for them, so their absence is a result, not an omission -- but
// when one was written it has to appear here, or the report understates what
// the run produced.
// The planted paths come from the one list that owns them. Typed out here they
// were a third copy, and a third copy of a list is the drift this repo already
// solved once for scaffold and --fix.
const files = [
  ...profile.files.map((f) => f.dest),
  "CLAUDE.md",
  "package.json",
  ".claude/references/architecture.md",
  ".claude/skills/verification/SKILL.md",
  ...plantedFiles(root).files.map((f) => f.path),
  ".claude/harness/manifest.json",
].filter((p) => existsSync(join(target, p)));

const claudeMd = existsSync(join(target, "CLAUDE.md")) ? readFileSync(join(target, "CLAUDE.md"), "utf8") : "";
const tokens = Math.round(claudeMd.length / 4);

// A target with no planted checker is not a failing check, it is no check. The
// two were reported identically, so a bootstrap that never planted anything
// read as a harness that ran and found errors.
const checkerPath = join(target, ".claude/harness/check.mjs");
let checkOut = "", checkStatus;
if (!existsSync(checkerPath)) {
  checkStatus = "not planted (no .claude/harness/check.mjs in the target)";
} else {
  try {
    checkOut = execFileSync(process.execPath, [checkerPath, "--mode", "principles", "--target", target], { encoding: "utf8" });
    checkStatus = "pass";
  } catch (e) {
    checkOut = e.stdout ?? String(e);
    checkStatus = "fail";
  }
}

// A zero here is an answer, not a gap, so it is labelled as one. An unlabelled 0
// reads as a rule that failed to generate.
const answered = (on, off) => (on ? "" : `   <- ${off}`);

const lines = [
  `stack                ${stack}`,
  `fsd variants         publicApi=${fsdOpts.publicApi}  sliceCoupling=${fsdOpts.sliceCoupling}${manifest?.fsd ? "" : "   (no manifest: defaults assumed)"}`,
  ``,
  `Files created        ${files.length}`,
  ...files.map((f) => `  - ${f}`),
  `  - ${fsd.layers.length} layer directories under ${profile.fsdRoot}${fsdOpts.routingRoot ? ` + ${fsdOpts.routingRoot}` : ""}`,
  ``,
  `Rules enforced by tooling`,
  `  layer direction    ${c.layerDirection}   (forbidden ordered layer pairs derived from layers.json)${shadowNote(eslintShadow)}`,
  `  slice isolation    ${c.sliceIsolation}   (isolation policies, one per sliced layer)${shadowNote(eslintShadow) || answered(c.sliceIsolation > 0, "answered: sliceCoupling=same-layer")}`,
  `  public API         ${c.publicApi}   (element types whose imports must go through index.*)${shadowNote(eslintShadow) || answered(c.publicApi > 0, "answered: publicApi=open")}`,
  `  routing            ${c.routing}   (routing element, present only when the stack has one)${shadowNote(eslintShadow)}`,
  `  types              ${strictFlags}   (strict-family flags enabled in tsconfig.json)`,
  `  format             ${prettier}   (prettier config written by this harness: 0 or 1)${shadowNote(prettierShadow) || answered(prettier > 0, "the repo's own prettier config was left in place")}`,
  `  import order       ${importGroups}   (import groups the formatter orders, one per routing dir and layer)${shadowNote(prettierShadow)}`,
  `  path consistency   ${aliasesPlanted ? aliases : 0}   (${aliasNote})`,
  `  ---`,
  `  total              ${live(eslintShadow, c.layerDirection + c.sliceIsolation + c.publicApi + c.routing) + strictFlags + live(prettierShadow, prettier + importGroups) + (aliasesPlanted ? aliases : 0)}`,
  `  Footnote: the total is the plain sum of the lines above, minus any line marked`,
  `  shadowed -- a config the tool never loads enforces nothing, whoever wrote it.`,
  `  Each line counts a different kind of thing, so the total is a sum, not a score.`,
  `  The first four lines may only be reported after tests/verify-boundaries.mjs`,
  `  passes for this stack and this pair of variants.`,
  ``,
  `CLAUDE.md            ${tokens} tokens (measured, not judged: no primary source states a budget)`,
  `harness:check        ${checkStatus}`,
];
console.log(lines.join("\n"));
if (checkStatus === "fail") console.log("\n" + checkOut);
