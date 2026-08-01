#!/usr/bin/env node
// What the three scripts do when the input is wrong.
//
// verify-boundaries and verify-rules prove the generated config is right. This
// proves the generator is honest about the cases where it cannot be: a bad
// answer file, a config it does not own, a checker that was never planted. Each
// of those had one silent path through it, and a silent wrong answer from a
// tool whose whole job is to report the truth about a repo is the worst defect
// this codebase can ship.
//
// No install and no network: nothing here runs eslint or prettier, only the
// scripts in this repo. That is why it can be the test that always runs.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const keep = args.includes("--keep");

let failed = false;
const ok = (msg) => console.log(`ok   ${msg}`);
const bad = (msg) => {
  console.log(`FAIL ${msg}`);
  failed = true;
};
const check = (cond, msg) => (cond ? ok(msg) : bad(msg));

const workspace = mkdtempSync(join(tmpdir(), "thinkit-verify-"));
const fresh = (name) => {
  const dir = join(workspace, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};
const run = (script, argv, cwd) =>
  spawnSync(process.execPath, [join(root, "scripts", script), ...argv], { cwd, encoding: "utf8" });
const scaffold = (target, argv = []) => run("scaffold.mjs", ["react", "--target", target, ...argv], root);
const write = (dir, rel, body) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body, "utf8");
};
const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");

// --- answers that do not resolve -------------------------------------------
// The whole interview, discarded. What made this worth a test rather than a
// read is that the fallback was not obviously wrong: {} is a valid answer set,
// and it produces the strict defaults, which are then reported as the repo's
// answers with no sign that a file was ever named.
{
  const target = fresh("answers-missing");
  const r = scaffold(target, ["--answers", join(target, "nope.json")]);
  check(r.status === 2, "missing --answers file: exit 2");
  check(/no such file/.test(r.stderr), "missing --answers file: message names the problem");
  check(!existsSync(join(target, "CLAUDE.md")), "missing --answers file: nothing written");
}
{
  const target = fresh("answers-malformed");
  write(target, "answers.json", "{ not json");
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "malformed --answers: exit 2");
  check(!existsSync(join(target, "CLAUDE.md")), "malformed --answers: nothing written");
}
{
  const target = fresh("answers-array");
  write(target, "answers.json", "[]");
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "--answers holding a JSON array: exit 2");
}

// --- answers whose values are not answers ----------------------------------
{
  const target = fresh("severity-typo");
  write(target, "answers.json", JSON.stringify({ severity: "errors" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "severity typo: exit 2");
  check(/error, warn, off/.test(r.stderr), "severity typo: message lists the allowed values");
}
{
  const target = fresh("routing-imports-string");
  write(target, "answers.json", JSON.stringify({ routingImports: "app" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "routingImports as a string: non-zero exit");
  check(/must be an array/.test(r.stderr), "routingImports as a string: message names the shape");
}
{
  const target = fresh("public-api-typo");
  write(target, "answers.json", JSON.stringify({ publicApi: "enforce" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "publicApi typo: non-zero exit rather than a silent strict default");
}

// --- answers whose shape is not the shape ------------------------------------
// Both of these are what a person writing the file by hand produces, and
// neither was caught where it was written: the first died on .map after files
// were already on disk, the second shipped.
{
  const target = fresh("list-as-string");
  write(target, "answers.json", JSON.stringify({ safetyBoundaries: "no production deploys" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "a list answer given as a string: exit 2");
  check(/must be an array of strings/.test(r.stderr), "a list answer given as a string: message names the shape");
  check(!existsSync(join(target, "CLAUDE.md")), "a list answer given as a string: nothing written");
}
{
  const target = fresh("list-of-objects");
  write(target, "answers.json", JSON.stringify({ exceptions: [{ note: "legacy" }] }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(/only strings/.test(r.stderr), "a list of objects: rejected before it renders as [object Object]");
}
{
  const target = fresh("oneline-object");
  write(target, "answers.json", JSON.stringify({ oneLine: { ko: "…" } }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 2, "oneLine as an object: exit 2 rather than [object Object] in someone's CLAUDE.md");
}

// --- routingRoot values that pass a naive check and enforce nothing ----------
{
  const target = fresh("routing-dot-slash");
  write(target, "answers.json", JSON.stringify({ routingRoot: "./app" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status === 0, "routingRoot written as ./app: accepted");
  const boundaries = read(target, "eslint.config.boundaries.mjs");
  check(/"pattern": "app"/.test(boundaries), "routingRoot written as ./app: normalised, so the element pattern can match");
  check(existsSync(join(target, "app/.gitkeep")), "routingRoot written as ./app: the directory lands where it was asked for");
}
{
  const target = fresh("routing-root-dot");
  write(target, "answers.json", JSON.stringify({ routingRoot: "." }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "routingRoot of '.': refused, rather than registering the repo root as a routing element");
}
{
  const target = fresh("routing-escape");
  write(target, "answers.json", JSON.stringify({ routingRoot: "../outside" }));
  const r = scaffold(target, ["--answers", join(target, "answers.json")]);
  check(r.status !== 0, "routingRoot escaping the repo: refused");
  check(!existsSync(join(target, "../outside")), "routingRoot escaping the repo: nothing written outside the target");
}

// --- the happy path, and what it registers ---------------------------------
const main = fresh("happy");
{
  const r = scaffold(main);
  check(r.status === 0, "scaffold react: exit 0");
  const pkg = JSON.parse(read(main, "package.json"));
  check(Boolean(pkg.scripts["harness:check"]), "package.json: harness:check registered");
  check(Boolean(pkg.scripts.lint), "package.json: lint registered");
  // The formatter is generated with an import order derived from the layer
  // graph, and report.mjs counts that as a rule the tooling enforces. Nothing
  // invoked it, which made the count a claim about a command that did not exist.
  check(Boolean(pkg.scripts.format), "package.json: format registered, so the generated import order is runnable");
  check(existsSync(join(main, ".claude/harness/check.mjs")), "planted: check.mjs");
  check(existsSync(join(main, ".claude/harness/rules.principles.json")), "planted: rules.principles.json");

  const again = spawnSync(
    process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", main, "--json"],
    { cwd: root, encoding: "utf8" }
  );
  const summary = JSON.parse(again.stdout);
  const changed = summary.written.filter((w) => w.state !== "unchanged");
  check(changed.length === 0, `re-run is idempotent (${changed.map((c) => `${c.path}:${c.state}`).join(", ") || "nothing rewritten"})`);
  // The reason it was not. Our own generated tsconfig.json is sitting in the
  // target by the second run, and reading it back reported a table we wrote as
  // one the repo already had.
  check(summary.aliasSource === "profile", `re-run still reports where the alias table came from (got: ${summary.aliasSource})`);
}

// --- a table the repo actually owns is read, not overridden ------------------
{
  const target = fresh("repo-alias");
  write(target, "tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "~/*": ["app/*"], "@lib/*": ["lib/*"] } } }, null, 2) + "\n");
  const r = spawnSync(
    process.execPath,
    [join(root, "scripts/scaffold.mjs"), "react", "--target", target, "--json"],
    { cwd: root, encoding: "utf8" }
  );
  const summary = JSON.parse(r.stdout);
  check(summary.aliasSource === "tsconfig.json", "a tsconfig this harness did not write is read as the repo's alias table");
  check(summary.aliases === 2, `both of the repo's aliases are picked up (got ${summary.aliases})`);
}

// --- an existing script is the repo's ---------------------------------------
{
  const target = fresh("own-scripts");
  write(target, "package.json", JSON.stringify({ name: "x", scripts: { lint: "biome check", format: "biome format" } }, null, 2) + "\n");
  scaffold(target);
  const pkg = JSON.parse(read(target, "package.json"));
  check(pkg.scripts.lint === "biome check", "an existing lint script is not replaced");
  check(pkg.scripts.format === "biome format", "an existing format script is not replaced");
}

// --- the planted copy cannot run a mode it does not carry -------------------
{
  const planted = join(main, ".claude/harness/check.mjs");
  const noMode = spawnSync(process.execPath, [planted, "--target", main], { encoding: "utf8" });
  check(noMode.status === 2, "planted check.mjs with no --mode: exit 2");
  check(!/ERR_MODULE_NOT_FOUND/.test(noMode.stderr), "planted check.mjs with no --mode: not a module-resolution crash");
  check(/planted copy/.test(noMode.stderr), "planted check.mjs with no --mode: message says why");

  const principles = spawnSync(process.execPath, [planted, "--mode", "principles", "--target", main], { encoding: "utf8" });
  check(principles.status === 0, "planted check.mjs --mode principles: exit 0");
}
{
  // A typo in --mode used to run: everything but the machine-decidable
  // principle rules fell through a branch that skipped them, and the result was
  // a short clean report of a check that had mostly not happened.
  const r = run("check.mjs", ["--mode", "principle", "--target", main], root);
  check(r.status === 2, "an unknown --mode: exit 2 rather than a report of the rules it did run");
  check(/principles, full/.test(r.stderr), "an unknown --mode: message lists the real ones");
}

// --- --fix does not create a script that points at nothing -------------------
{
  const target = fresh("fix-unplanted");
  write(target, "package.json", JSON.stringify({ name: "x" }, null, 2) + "\n");
  write(target, "CLAUDE.md", "# x\n");
  const r = run("check.mjs", ["--mode", "principles", "--target", target, "--fix"], root);
  const pkg = JSON.parse(read(target, "package.json"));
  check(r.status === 0, "--fix on an unplanted repo: exit 0");
  check(!pkg.scripts?.["harness:check"], "--fix on an unplanted repo: no harness:check registered for a checker that is not there");
  check(/## Gotchas/.test(read(target, "CLAUDE.md")), "--fix on an unplanted repo: the Gotchas heading is still added");
}

// --- --fix keeps the repo's own formatting ----------------------------------
{
  const target = fresh("fix-indent");
  scaffold(target);
  // Four spaces, no trailing newline: the two things JSON.stringify(…, 2) + "\n"
  // silently changed on a file that belongs to the repo, not to us.
  const pkg = JSON.parse(read(target, "package.json"));
  delete pkg.scripts["harness:check"];
  writeFileSync(join(target, "package.json"), JSON.stringify(pkg, null, 4), "utf8");
  run("check.mjs", ["--mode", "principles", "--target", target, "--fix"], root);
  const after = read(target, "package.json");
  check(JSON.parse(after).scripts["harness:check"] !== undefined, "--fix registers harness:check when the harness is planted");
  check(/\n {4}"/.test(after), "--fix preserves four-space indentation");
  check(!after.endsWith("\n"), "--fix preserves the absence of a trailing newline");
}

// --- report counts what this harness owns -----------------------------------
{
  const target = fresh("own-prettier");
  write(target, "prettier.config.mjs", "export default { semi: false };\n");
  scaffold(target);
  const r = run("report.mjs", ["react", "--target", target], root);
  check(r.status === 0, "report on a repo with its own prettier config: exit 0");
  const format = r.stdout.split("\n").find((l) => l.includes("format "));
  check(/format\s+0/.test(format ?? ""), `a prettier config we did not write counts 0 (got: ${format?.trim()})`);
  check(/import order\s+0/.test(r.stdout), "and the import order it does not carry counts 0 with it");
  check(read(target, "prettier.config.mjs").includes("semi: false"), "the repo's own prettier config is left alone");
}
{
  const r = run("report.mjs", ["--target", main], root);
  check(r.status === 2, "report with no stack argument: exit 2 with usage");
}
{
  // A real tsconfig.json is JSONC. Block comments and trailing commas are legal
  // there and fatal to JSON.parse, and this ran before any of the numbers were
  // printed, so one comment in someone's tsconfig took the whole report out.
  const target = fresh("jsonc-tsconfig");
  scaffold(target);
  write(target, "tsconfig.json", '{\n  /* ours */\n  "compilerOptions": {\n    "strict": true,\n  },\n}\n');
  const r = run("report.mjs", ["react", "--target", target], root);
  check(r.status === 0, "report on a JSONC tsconfig: exit 0");
  check(/types\s+1/.test(r.stdout), "report on a JSONC tsconfig: the strict flag inside it is still counted");
}
{
  const target = fresh("unplanted-report");
  write(target, "package.json", JSON.stringify({ name: "x" }, null, 2) + "\n");
  const r = run("report.mjs", ["react", "--target", target], root);
  check(/harness:check\s+not planted/.test(r.stdout), "a target with no planted checker reads as 'not planted', not as a failing check");
}

// --- planted staleness tracks the planted content ---------------------------
{
  // The manifest version is what tells `current` from `outdated` in a target.
  // Keyed on the rule set's own version number, a fix to check.mjs shipped as
  // `current` to every repo already holding the old copy.
  const target = fresh("stale-version");
  scaffold(target);
  const manifestPath = join(target, ".claude/harness/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = "0-0000000000000000";
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const r = run("check.mjs", ["--mode", "principles", "--target", target, "--json"], root);
  const state = JSON.parse(r.stdout).planted;
  check(state.every((p) => p.state === "outdated"), "a manifest recording an older plant reads as outdated");

  const fixedRun = run("check.mjs", ["--mode", "principles", "--target", target, "--fix", "--json"], root);
  check(JSON.parse(fixedRun.stdout).planted.every((p) => p.state === "current"), "--fix brings it back to current");
}

// --- unreadable repo files are findings, not crashes ------------------------
{
  const target = fresh("broken-pkg");
  scaffold(target);
  writeFileSync(join(target, "package.json"), "{ broken", "utf8");
  const r = run("check.mjs", ["--mode", "principles", "--target", target, "--json"], root);
  check(r.status !== null && !/SyntaxError/.test(r.stderr), "a malformed package.json does not crash the checker");
  const parsed = r.stdout ? JSON.parse(r.stdout) : { findings: [] };
  check(
    parsed.findings.some((f) => f.id === "harness.check-registered" && /not valid JSON/.test(f.message)),
    "a malformed package.json is reported as a finding"
  );
}
{
  const target = fresh("broken-manifest");
  scaffold(target);
  writeFileSync(join(target, ".claude/harness/manifest.json"), "{ broken", "utf8");
  const r = run("check.mjs", ["--mode", "principles", "--target", target, "--json"], root);
  check(!/SyntaxError/.test(r.stderr), "a malformed manifest does not crash the checker");
  const parsed = r.stdout ? JSON.parse(r.stdout) : { planted: [] };
  check((parsed.planted ?? []).some((p) => p.state === "unreadable"), "a malformed manifest is reported as unreadable");
}

if (keep) console.log(`\nworkspace left in place:\n  ${workspace}`);
else rmSync(workspace, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
