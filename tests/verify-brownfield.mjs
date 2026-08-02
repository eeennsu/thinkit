#!/usr/bin/env node
// The failures a repo that already has configs produces, and that a greenfield
// fixture cannot: a tsconfig with alias globs, a formatter and a linter already
// owning their names, and a CLAUDE.md that is one import line.
//
// Every case here was measured on a real repo before it was written down. Needs
// no sandbox: nothing shells out to eslint, because what is under test is what
// the scripts read and claim, not what the generated rules catch.
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { stripJsonc, parseJsonc } from "../scripts/lib/jsonc.mjs";
import { shadowed } from "../scripts/lib/precedence.mjs";
import { readAlias } from "../scripts/lib/alias.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = join(root, ".tmp-brownfield");
const keep = process.argv.includes("--keep");

let failed = 0;
const ok = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`); }
};

// A tsconfig in the shape every aliased project has: a banner block comment, a
// paths table whose keys contain `/*`, and commented-out entries after the last
// live one. The glob is the part that broke the regex stripper.
const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    /* Bundler mode */
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@app/*": ["src/app/*"],
      "@widgets/*": ["src/widgets/*"],
      "@features/*": ["src/features/*"],
      "@shared/*": ["src/shared/*"],
      "@db/*": ["src/db/*"]
      // "@utils/*": ["src/shared/utils/*"],
    }
  },
  "include": ["src"],
}`;

console.log("jsonc");
{
  const parsed = parseJsonc(TSCONFIG);
  ok("a tsconfig with alias globs parses", parsed !== null, "the paths block was eaten as a block comment");
  ok("all five aliases survive", Object.keys(parsed?.compilerOptions?.paths ?? {}).length === 5,
    JSON.stringify(Object.keys(parsed?.compilerOptions?.paths ?? {})));
  const flags = Object.entries(parsed?.compilerOptions ?? {}).filter(([k, v]) => v === true && /^(strict|no|exact)/.test(k));
  ok("strict-family flags are counted", flags.length === 4, `got ${flags.length}`);
  ok("a commented-out path stays out", !("@utils/*" in (parsed?.compilerOptions?.paths ?? {})));
  ok("a comment marker inside a string is not a comment",
    parseJsonc('{"a": "http://x.dev/*", "b": 1}')?.a === "http://x.dev/*");
  ok("an escaped quote does not end the string",
    parseJsonc('{"a": "he said \\" // not a comment", "b": 2}')?.b === 2);
  ok("trailing commas are still tolerated", parseJsonc('{"a": [1, 2,],}')?.a.length === 2);
  ok("a genuinely broken file still returns null", parseJsonc("{oops") === null);
  ok("stripJsonc leaves string content untouched", stripJsonc('{"k": "a/*b*/c"}').includes("a/*b*/c"));
}

console.log("precedence");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "eslint.config.js"), "export default [];\n");
  writeFileSync(join(tmp, "eslint.config.mjs"), "export default [];\n");
  writeFileSync(join(tmp, ".prettierrc"), "{}\n");
  writeFileSync(join(tmp, "prettier.config.mjs"), "export default {};\n");

  const e = shadowed(tmp, "eslint.config.mjs");
  ok("eslint.config.js shadows our .mjs", e.shadowed && e.winner === "eslint.config.js", JSON.stringify(e));
  const p = shadowed(tmp, "prettier.config.mjs");
  ok(".prettierrc shadows our prettier.config.mjs", p.shadowed && p.winner === ".prettierrc", JSON.stringify(p));

  rmSync(join(tmp, "eslint.config.js"));
  ok("nothing shadows it once the .js is gone", shadowed(tmp, "eslint.config.mjs").shadowed === false);

  rmSync(join(tmp, ".prettierrc"));
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ prettier: { semi: false } }) + "\n");
  ok("package.json#prettier shadows too", shadowed(tmp, "prettier.config.mjs").winner === "package.json#prettier");
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "x" }) + "\n");
  ok("a package.json without the key does not", shadowed(tmp, "prettier.config.mjs").shadowed === false);

  ok("an unknown name claims no precedence", shadowed(tmp, "tsconfig.json").shadowed === false);

  // The repo is told to spread ours into its own entry config. A repo that did
  // it has a winner that also loads us, and calling that shadowed would report a
  // wired harness as dead.
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "eslint.config.mjs"), "export default [];\n");
  writeFileSync(join(tmp, "eslint.config.boundaries.mjs"), "export default [];\n");
  const ours = ["eslint.config.mjs", "eslint.config.boundaries.mjs"];

  writeFileSync(join(tmp, "eslint.config.js"), "export default [ /* nothing of ours */ ];\n");
  const dead = shadowed(tmp, "eslint.config.mjs", ours);
  ok("a winner that ignores ours is shadowed", dead.shadowed && dead.via === null);

  writeFileSync(join(tmp, "eslint.config.js"),
    "import boundaries from './eslint.config.boundaries.mjs';\nexport default [...boundaries];\n");
  const wired = shadowed(tmp, "eslint.config.mjs", ours);
  ok("a winner that spreads ours is not", wired.shadowed === false, JSON.stringify(wired));
  ok("and it reports which file loads us", wired.via === "eslint.config.js");

  // Default ourFiles is the file asked about, so the entry config alone counts.
  writeFileSync(join(tmp, "eslint.config.js"), "import x from './eslint.config.mjs';\nexport default x;\n");
  ok("the single-file form works too", shadowed(tmp, "eslint.config.mjs").shadowed === false);
}

console.log("alias");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "tsconfig.json"), TSCONFIG);
  const profile = { alias: { "@": "src" } };
  const { alias, source } = await readAlias(tmp, profile);
  ok("the repo's own table is read, not the profile's", source === "tsconfig.json", `source=${source}`);
  ok("five aliases, not one", Object.keys(alias).length === 5, JSON.stringify(alias));
  ok("the /* suffix is stripped from the prefix", alias["@widgets"] === "src/widgets", JSON.stringify(alias));
}

console.log("claude.md imports");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // The shape that measured three tokens: a pointer, and the harness elsewhere.
  writeFileSync(join(tmp, "CLAUDE.md"), "@AGENTS.md");
  writeFileSync(join(tmp, "AGENTS.md"), [
    "# Agents",
    "",
    "- src/features/auth/index.ts",
    "- src/features/user/index.ts",
    "- src/widgets/Header/index.tsx",
    "- src/shared/utils/date.ts",
    "- src/entities/post/model.ts",
    "",
    "## Gotchas",
    "",
  ].join("\n"));

  const out = execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
    { encoding: "utf8" });
  const findings = JSON.parse(out).findings;
  const byId = (id) => findings.find((f) => f.id === id);

  ok("the import is followed", !/about [0-9] tokens/.test(out), "still measuring the pointer, not the target");
  ok("prose behind the import is judged",
    Boolean(byId("claude-md.repo-visible.structural")),
    "path-like lines in the imported file went unreported");
  ok("a Gotchas heading in the imported file counts",
    !findings.some((f) => f.id === "claude-md.gotcha-section" && /No Gotchas/.test(f.message)));

  // --fix must append to the pointer file, not inline what it points at.
  execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--fix"],
    { encoding: "utf8" });
  ok("--fix leaves the import a one-liner",
    readFileSync(join(tmp, "CLAUDE.md"), "utf8").trim() === "@AGENTS.md",
    readFileSync(join(tmp, "CLAUDE.md"), "utf8").slice(0, 80));

  // A cycle terminates rather than recursing until the stack gives out.
  writeFileSync(join(tmp, "CLAUDE.md"), "@A.md");
  writeFileSync(join(tmp, "A.md"), "alpha @B.md");
  writeFileSync(join(tmp, "B.md"), "beta @A.md");
  let cycled = true;
  try {
    execFileSync(process.execPath,
      [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
      { encoding: "utf8" });
  } catch {
    cycled = false;
  }
  ok("a cycle between imports terminates", cycled);
}

console.log("directories that are not layers");
{
  rmSync(tmp, { recursive: true, force: true });
  for (const d of ["src/app", "src/features", "src/shared", "src/db", "src/data", "src/.cache"]) {
    mkdirSync(join(tmp, d), { recursive: true });
  }
  const answers = join(tmp, "answers.json");
  writeFileSync(answers, JSON.stringify({ routingRoot: "src/app" }));
  const out = execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "next", "--target", tmp, "--answers", answers, "--json"],
    { encoding: "utf8" });
  const summary = JSON.parse(out);
  const manifest = JSON.parse(readFileSync(join(tmp, ".claude/harness/manifest.json"), "utf8"));
  const config = readFileSync(join(tmp, "eslint.config.boundaries.mjs"), "utf8");

  ok("a non-layer directory is detected", manifest.fsd.extraRoots.includes("db"), JSON.stringify(manifest.fsd.extraRoots));
  ok("layer directories are not", !manifest.fsd.extraRoots.includes("features"));
  ok("a routingRoot inside fsdRoot is not", !manifest.fsd.extraRoots.includes("app"),
    "app would shadow the routing element registered ahead of the layers");
  ok("a dotted directory is not", !manifest.fsd.extraRoots.includes(".cache"));
  ok("an element is registered for it", /"type": "db"[\s\S]{0,60}"pattern": "src\/db"/.test(config));
  ok("the placement is surfaced", summary.notes.some((n) => /not layers/.test(n)), JSON.stringify(summary.notes));

  // Bottom of the graph: reachable from above, reaching only the bottom layer.
  ok("a layer may import it", /"from"[\s\S]{0,120}"features"[\s\S]{0,160}"db"/.test(config) || config.includes('"type": "db"'));
  ok("it may not import a layer above the bottom",
    !/{\s*"from":\s*{\s*"element":\s*{\s*"type":\s*"db"\s*}\s*},\s*"allow":\s*{\s*"to":\s*{\s*"element":\s*{\s*"type":\s*"features"/.test(config));

  // An explicit answer wins, including the empty one.
  writeFileSync(answers, JSON.stringify({ routingRoot: "src/app", extraRoots: [] }));
  execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "next", "--target", tmp, "--answers", answers], { encoding: "utf8" });
  const off = JSON.parse(readFileSync(join(tmp, ".claude/harness/manifest.json"), "utf8"));
  ok("an explicit empty answer turns detection off", off.fsd.extraRoots.length === 0);

  // A name that is already a layer would register a second element for it.
  writeFileSync(answers, JSON.stringify({ extraRoots: ["shared"] }));
  let threw = false;
  try {
    execFileSync(process.execPath,
      [join(root, "scripts/scaffold.mjs"), "next", "--target", tmp, "--answers", answers],
      { encoding: "utf8", stdio: "pipe" });
  } catch { threw = true; }
  ok("naming a layer is rejected", threw);
}

console.log("answers with nowhere to go");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // The brownfield shape: a CLAUDE.md the repo already owns. Q2 is answered, and
  // the section it writes lives in exactly that file.
  writeFileSync(join(tmp, "CLAUDE.md"), "@AGENTS.md\n");
  writeFileSync(join(tmp, "AGENTS.md"), "# Agents\n\n## Gotchas\n");
  const answers = join(tmp, "answers.json");
  writeFileSync(answers, JSON.stringify({ safetyBoundaries: ["production deploys", "the signing key"] }));

  const out = execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--answers", answers, "--json"],
    { encoding: "utf8" });
  const summary = JSON.parse(out);
  const manifest = JSON.parse(readFileSync(join(tmp, ".claude/harness/manifest.json"), "utf8"));

  ok("CLAUDE.md is left alone", summary.written.some((w) => w.path === "CLAUDE.md" && w.state === "exists, left alone"));
  ok("an answer that was not written is not recorded as declared",
    manifest.declared.safetyBoundaries === false,
    "declared:true here makes check.mjs report a section that was never written as gone");
  ok("the dropped answer is surfaced, not swallowed",
    summary.notes.some((n) => /Safety Boundaries/.test(n)), JSON.stringify(summary.notes));

  // And the false error it used to produce does not appear.
  const checkOut = execFileSync(process.execPath,
    [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
    { encoding: "utf8" });
  ok("no phantom \"the section is gone\"",
    !/section is gone/.test(checkOut), "the rule fired on a section that was never written");

  // The case the rule does exist for: we wrote CLAUDE.md, the repo removed the
  // section afterwards. That must still be an error.
  rmSync(join(tmp, "CLAUDE.md"));
  execFileSync(process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--answers", answers],
    { encoding: "utf8" });
  const written = JSON.parse(readFileSync(join(tmp, ".claude/harness/manifest.json"), "utf8"));
  ok("a section we did write is recorded as declared", written.declared.safetyBoundaries === true);
  writeFileSync(join(tmp, "CLAUDE.md"),
    readFileSync(join(tmp, "CLAUDE.md"), "utf8").replace(/^##\s+Safety Boundaries[\s\S]*?(?=^##\s|$)/m, ""));
  let fired = false;
  try {
    execFileSync(process.execPath,
      [join(root, "scripts/check.mjs"), "--mode", "principles", "--target", tmp, "--json"],
      { encoding: "utf8" });
  } catch (e) {
    fired = /section is gone/.test(e.stdout ?? "");
  }
  ok("removing a section we wrote still errors", fired, "the rule stopped catching what it exists for");
}

console.log("warn on a repo that fails on warnings");
{
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, "src"), { recursive: true });
  const answers = join(tmp, "answers.json");
  writeFileSync(answers, JSON.stringify({ severity: "warn" }));
  const run = (scripts) => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "x", scripts }, null, 2) + "\n");
    return JSON.parse(execFileSync(process.execPath,
      [join(root, "scripts/scaffold.mjs"), "react", "--target", tmp, "--answers", answers, "--json"],
      { encoding: "utf8" })).notes.join("\n");
  };

  ok("--max-warnings 0 makes warn behave like error, and it is said so",
    /--max-warnings 0/.test(run({ lint: "eslint . --max-warnings 0" })));
  ok("the build coupling is called out when it exists",
    /build calls lint/.test(run({ lint: "eslint . --max-warnings 0", build: "bun run lint && next build" })));
  ok("and not when it does not",
    !/build calls lint/.test(run({ lint: "eslint . --max-warnings 0", build: "next build" })));
  ok("a lint that tolerates warnings says nothing",
    !/max-warnings/.test(run({ lint: "eslint ." })));

  writeFileSync(answers, JSON.stringify({ severity: "error" }));
  ok("severity=error is not the case this note is about",
    !/max-warnings/.test(run({ lint: "eslint . --max-warnings 0" })));
}

console.log("devDependency pins");
{
  const profile = JSON.parse(readFileSync(join(root, "stacks/next/profile.json"), "utf8"));
  const pinned = profile.devDependencies?.[profile.resolver.devDependency];
  if (pinned) {
    const merged = { [profile.resolver.devDependency]: "*", ...profile.devDependencies };
    ok("a profile's own resolver pin survives the merge",
      merged[profile.resolver.devDependency] === pinned,
      `expected ${pinned}, got ${merged[profile.resolver.devDependency]}`);
  } else {
    console.log("  skip  next does not pin its resolver");
  }
}

if (!keep && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} failing` : "\nall passing");
process.exit(failed ? 1 : 0);
