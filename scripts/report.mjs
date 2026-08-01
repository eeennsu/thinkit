#!/usr/bin/env node
// Completion report. Every line states its unit, because a headline number
// with no unit is marketing.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadProfile } from "./lib/profile.mjs";
import { readAlias } from "./lib/alias.mjs";
import { counts, resolveOptions } from "./fsd-boundaries.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const stack = args[0];
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
const { alias, source: aliasSource } = await readAlias(target, profile);
const aliases = Object.keys(alias).length;

const tsconfig = existsSync(join(target, "tsconfig.json"))
  ? JSON.parse(readFileSync(join(target, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""))
  : null;
const strictFlags = tsconfig
  ? Object.entries(tsconfig.compilerOptions ?? {}).filter(([k, v]) => v === true && /^(strict|no|exact)/.test(k)).length
  : 0;
const prettier = existsSync(join(target, "prettier.config.mjs")) ? 1 : 0;

// The conditional artifacts are listed too. They exist only when an interview
// answer called for them, so their absence is a result, not an omission -- but
// when one was written it has to appear here, or the report understates what
// the run produced.
const files = [
  ...profile.files.map((f) => f.dest),
  "CLAUDE.md",
  "package.json",
  ".claude/references/architecture.md",
  ".claude/skills/verification/SKILL.md",
  ".claude/harness/check.mjs",
  ".claude/harness/rules.principles.json",
  ".claude/harness/manifest.json",
].filter((p) => existsSync(join(target, p)));

const claudeMd = existsSync(join(target, "CLAUDE.md")) ? readFileSync(join(target, "CLAUDE.md"), "utf8") : "";
const tokens = Math.round(claudeMd.length / 4);

let checkOut = "", checkPass = false;
try {
  checkOut = execFileSync(process.execPath, [join(target, ".claude/harness/check.mjs"), "--mode", "principles", "--target", target], { encoding: "utf8" });
  checkPass = true;
} catch (e) {
  checkOut = e.stdout ?? String(e);
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
  `  layer direction    ${c.layerDirection}   (forbidden ordered layer pairs derived from layers.json)`,
  `  slice isolation    ${c.sliceIsolation}   (isolation policies, one per sliced layer)${answered(c.sliceIsolation > 0, "answered: sliceCoupling=same-layer")}`,
  `  public API         ${c.publicApi}   (element types whose imports must go through index.*)${answered(c.publicApi > 0, "answered: publicApi=open")}`,
  `  routing            ${c.routing}   (routing element, present only when the stack has one)`,
  `  types              ${strictFlags}   (strict-family flags enabled in tsconfig.json)`,
  `  format             ${prettier}   (prettier applied: 0 or 1)`,
  `  path consistency   ${aliases}   (alias entries, ${aliasSource === "profile" ? "generated into tsconfig paths and the bundler config" : `read from ${aliasSource}`})`,
  `  ---`,
  `  total              ${c.layerDirection + c.sliceIsolation + c.publicApi + c.routing + strictFlags + prettier + aliases}`,
  `  Footnote: the total is the plain sum of the lines above. Each line counts a`,
  `  different kind of thing, so the total is a sum, not a score. The first four`,
  `  lines may only be reported after tests/verify-boundaries.mjs passes for this`,
  `  stack and this pair of variants.`,
  ``,
  `CLAUDE.md            ${tokens} tokens (measured, not judged: no primary source states a budget)`,
  `harness:check        ${checkPass ? "pass" : "fail"}`,
];
console.log(lines.join("\n"));
if (!checkPass) console.log("\n" + checkOut);
