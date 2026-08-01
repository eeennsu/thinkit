#!/usr/bin/env node
// Harness check. Two modes:
//   --mode principles  generation-independent items only (this is what gets
//                      planted into a target repo)
//   --mode full        adds calibrated items, resolved against calibration/
//
// Reports everything it finds, sorted by severity. It never filters: filtering
// is the reader's pass. Exit code is 1 only when an `error` item fails.
//
// --fix applies mechanical remedies only, and every one of them is additive:
// an absent heading, an unregistered script, a planted file still byte-identical
// to what was planted. It never edits prose. Deleting a sentence from someone's
// CLAUDE.md is their call, and the report gives them what they need to make it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const SEV = { error: 0, warn: 1, info: 2 };
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const mode = opt("mode", "full");
const target = resolve(opt("target", process.cwd()));
const json = args.includes("--json");
const fix = args.includes("--fix");
const here = dirname(fileURLToPath(import.meta.url));

// A planted copy sits next to its own rule set and has no plugin above it.
// That is the difference that decides which repairs are available: refreshing a
// stale planted file needs the canonical content, which only the plugin has.
const isPlantedCopy = existsSync(join(here, "rules.principles.json"));
const pluginRoot = isPlantedCopy ? null : join(here, "..");

// An unrecognised mode used to run: `principles` was checked by name and
// anything else fell through to the calibrated branch, where a null calibration
// skipped every rule that was not machine-decidable and principle-axis. A typo
// in --mode produced a short, clean report of a check that had mostly not run.
const MODES = ["principles", "full"];
if (!MODES.includes(mode)) {
  console.error(`--mode ${mode}: unknown. Use one of ${MODES.join(", ")}.`);
  process.exit(2);
}

// The default mode is `full`, and a planted copy carries neither the calibrated
// rules nor lib/calibration.mjs to resolve them against. Running it that way
// died with ERR_MODULE_NOT_FOUND -- a stack trace for what is a usage error, on
// the copy most likely to be invoked by hand.
if (isPlantedCopy && mode !== "principles") {
  console.error(`--mode ${mode}: this is the planted copy, which carries only the generation-independent rules.`);
  console.error("Run it as --mode principles, or run the plugin's own scripts/check.mjs for --mode full.");
  process.exit(2);
}

// Repo files that are not ours. A malformed one is a finding about the repo,
// not a crash in the checker: exiting on a stack trace tells the owner nothing
// about the other twelve rules, which were all still checkable.
function parseJson(raw, label) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: `${label} is not valid JSON: ${e.message}` };
  }
}

function rulesPath() {
  const planted = join(here, "rules.principles.json");
  return existsSync(planted) ? planted : join(here, "..", "principles", "rules.json");
}
const rules = JSON.parse(readFileSync(rulesPath(), "utf8"));
const findings = [];
const add = (rule, severity, message, extra = {}) =>
  findings.push({ id: rule.id, severity, decidable: rule.decidable, message, ...extra });

const readIf = (p) => (existsSync(join(target, p)) ? readFileSync(join(target, p), "utf8") : null);
const claudeMd = readIf("CLAUDE.md");

const machine = {
  "claude-md.exists": (rule) => {
    if (claudeMd === null) add(rule, rule.severity, "CLAUDE.md is missing.");
  },
  "claude-md.gotcha-section": (rule) => {
    if (claudeMd === null) return;
    if (!/^##\s+Gotchas\s*$/m.test(claudeMd)) {
      add(rule, "warn", "No Gotchas section.");
      return;
    }
    const body = claudeMd.split(/^##\s+Gotchas\s*$/m)[1] ?? "";
    const text = body.replace(/<!--[\s\S]*?-->/g, "").split(/^##\s/m)[0].trim();
    if (!text) add(rule, "info", rule.audit.empty.message);
  },
  "claude-md.repo-visible.structural": (rule) => {
    if (claudeMd === null) return;
    const hits = [];
    for (const block of claudeMd.match(/```[\s\S]*?```/g) ?? []) {
      if (/[├└│]──/.test(block)) hits.push("directory tree in a fenced block");
    }
    const pathish = (claudeMd.match(/^\s*[-*]?\s*[\w.@/-]+\/[\w.@/-]+\s*$/gm) ?? []).length;
    if (pathish >= 5) hits.push(`${pathish} path-like lines`);
    if (/\.(ts|tsx|js|jsx)\b.*\.(ts|tsx|js|jsx)\b.*\.(ts|tsx|js|jsx)\b/.test(claudeMd))
      hits.push("extension enumeration");
    for (const h of hits) add(rule, rule.severity, `Reads as repo-visible: ${h}.`);
  },
  "safety.declared-boundaries-present": (rule) => {
    const manifest = readIf(".claude/harness/manifest.json");
    if (!manifest) return;
    const parsed = parseJson(manifest, ".claude/harness/manifest.json");
    if (!parsed.ok) {
      add(rule, rule.severity, `${parsed.error} What was declared at setup cannot be read, so this rule could not run.`);
      return;
    }
    const declared = parsed.value.declared?.safetyBoundaries;
    if (!declared) return;
    if (claudeMd && !/^##\s+Safety Boundaries\s*$/m.test(claudeMd))
      add(rule, rule.severity, "Safety boundaries were declared at setup but the section is gone.");
  },
  "harness.check-registered": (rule) => {
    // Scoped to repos the harness was actually planted into. Anywhere else there
    // is no checker to register and the finding would be noise.
    if (!readIf(".claude/harness/manifest.json")) return;
    const pkg = readIf("package.json");
    // A planted checker with nowhere to be registered never runs, which is the
    // same outcome as not having it. Returning early on a missing package.json
    // reported that repo as clean.
    if (!pkg) {
      add(rule, rule.severity, "The harness is planted but there is no package.json, so the checker is registered nowhere and never runs.");
      return;
    }
    const parsed = parseJson(pkg, "package.json");
    if (!parsed.ok) {
      add(rule, rule.severity, `${parsed.error} A package.json npm cannot read registers nothing.`);
      return;
    }
    if (!parsed.value.scripts?.["harness:check"])
      add(rule, rule.severity, 'package.json has no "harness:check" script.');
  },
  "claude-md.budget": (rule, cal) => {
    if (claudeMd === null) return;
    const tokens = Math.round(claudeMd.length / 4);
    if (!cal.set) {
      add(rule, "info", `CLAUDE.md is about ${tokens} tokens. Not judged: ${cal.reason}`, {
        dropped: true,
        measured: tokens,
      });
      return;
    }
    if (tokens > cal.value) add(rule, rule.severity, `CLAUDE.md is about ${tokens} tokens, over ${cal.value}.`);
  },
};

let calibration = null;
if (mode === "full") {
  const { loadCalibration, get } = await import("./lib/calibration.mjs");
  const cal = loadCalibration(join(here, ".."));
  calibration = { cal, get };
}

for (const rule of rules.items) {
  if (mode === "principles" && rule.axis !== "principle") continue;
  let calValue = { set: false, reason: "calibrated items are not evaluated in principles mode" };
  if (rule.axis === "calibrated") {
    if (!calibration) continue;
    calValue = calibration.get(calibration.cal, rule.calibrated_by);
    if (!calValue.set && rule.on_unset === "drop" && rule.decidable === "judgement") {
      add(rule, "info", `Dropped: ${calValue.reason}`, { dropped: true });
      continue;
    }
  }
  if (rule.decidable === "machine") {
    // A machine rule with no implementation produced nothing, and nothing is
    // exactly what a passing rule produces. Silence here is the failure mode
    // this whole plugin audits other repos for: a check that did not run must
    // not look like a check that passed.
    if (!machine[rule.id]) {
      add(rule, "error", `Declared machine-decidable but no check is implemented for "${rule.id}". It did not run.`, { unimplemented: true });
      continue;
    }
    machine[rule.id](rule, calValue);
  } else {
    add(rule, rule.severity, `Judgement item. Rubric: ${rule.rubric}`, {
      pending: true,
      asks: rule.audit?.asks,
      phrases: calValue.set ? calValue.phrases : undefined,
    });
  }
}

// What the plugin would plant today. Only the plugin copy can answer that, so
// `outdated` is a verdict only it can reach: a planted copy has no way to know
// the plugin has moved on, and guessing `current` there would be the reassuring
// answer rather than the true one.
const plantLib = pluginRoot ? await import("./lib/planted.mjs") : null;
const canonicalVersion = plantLib ? plantLib.plantedFiles(pluginRoot).version : null;

// Planted copies: same three-state comparison the skill reports on.
function plantedState() {
  const manifestPath = join(target, ".claude/harness/manifest.json");
  if (!existsSync(manifestPath)) return null;
  const parsed = parseJson(readFileSync(manifestPath, "utf8"), ".claude/harness/manifest.json");
  if (!parsed.ok) return [{ path: ".claude/harness/manifest.json", state: "unreadable", advice: parsed.error }];
  const manifest = parsed.value;
  if (!Array.isArray(manifest.files))
    return [{ path: ".claude/harness/manifest.json", state: "unreadable", advice: "no files[] array: nothing records what was planted" }];
  const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);
  return manifest.files.map((f) => {
    const p = join(target, f.path);
    if (!existsSync(p)) return { path: f.path, state: "missing" };
    const now = sha(p);
    if (now !== f.sha256) return { path: f.path, state: "edited-locally", advice: "merge by hand; do not overwrite" };
    if (canonicalVersion === null)
      return { path: f.path, state: "current", advice: "unchanged since planting; whether the plugin has moved on is not checkable from here" };
    if (manifest.version !== canonicalVersion) return { path: f.path, state: "outdated", advice: "regenerate" };
    return { path: f.path, state: "current" };
  });
}

let planted = plantedState();

// Mechanical remedies. Each one restores something whose absence is a fact, not
// an opinion; anything requiring a judgement stays in the report for a person.
const fixed = [];
const notes = [];
if (fix) {
  const write = (rel, content) => writeFileSync(join(target, rel), content, "utf8");

  if (claudeMd !== null && !/^##\s+Gotchas\s*$/m.test(claudeMd)) {
    write("CLAUDE.md", `${claudeMd.replace(/\s*$/, "")}\n\n## Gotchas\n`);
    fixed.push("CLAUDE.md: added the missing Gotchas heading (left empty on purpose)");
  }

  const pkgRaw = readIf("package.json");
  // Scoped the same way the rule is. Registering the script on a repo with no
  // planted checker writes a command that fails on the first run - a repair
  // that leaves the repo worse than it was found.
  const havePlanted = Boolean(readIf(".claude/harness/manifest.json"));
  if (pkgRaw && havePlanted) {
    const parsed = parseJson(pkgRaw, "package.json");
    if (!parsed.ok) {
      notes.push(`${parsed.error} Left untouched: rewriting a file we could not read would destroy it.`);
    } else if (!parsed.value.scripts?.["harness:check"]) {
      const pkg = parsed.value;
      pkg.scripts = { ...pkg.scripts, "harness:check": "node .claude/harness/check.mjs --mode principles" };
      // The repo's own formatting survives, for the reason scaffold.mjs gives
      // where it does the same thing: reformatting someone's package.json puts
      // every line of it in the diff for the sake of one added key.
      const indent = pkgRaw.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
      write("package.json", JSON.stringify(pkg, null, indent) + (pkgRaw.endsWith("\n") ? "\n" : ""));
      fixed.push('package.json: registered the "harness:check" script');
    }
  }

  // Only files still byte-identical to what was planted. `edited-locally` is
  // never touched: the report surfaces it and the owner merges.
  const stale = (planted ?? []).filter((p) => p.state === "outdated" || p.state === "missing");
  if (stale.length && plantLib) {
    const { plantedFiles, sha } = plantLib;
    const plant = plantedFiles(pluginRoot);
    const manifestPath = join(target, ".claude/harness/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const p of stale) {
      const canonical = plant.files.find((f) => f.path === p.path);
      if (!canonical) continue;
      write(p.path, canonical.content);
      const entry = manifest.files.find((f) => f.path === p.path);
      entry.sha256 = sha(Buffer.from(canonical.content, "utf8"));
      fixed.push(`${p.path}: refreshed from the plugin (was ${p.state})`);
    }
    manifest.version = plant.version;
    write(".claude/harness/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
    planted = plantedState();
  } else if (stale.length) {
    notes.push(`${stale.length} planted file(s) are stale. This is a planted copy and does not carry the canonical content - re-run bootstrap from the plugin.`);
  }
}

findings.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
const failed = findings.some((f) => f.severity === "error" && !f.pending && !f.dropped);

if (json) {
  console.log(JSON.stringify({ mode, target, findings, planted, fixed: fix ? fixed : undefined, notes: fix ? notes : undefined }, null, 2));
} else {
  for (const f of findings) console.log(`[${f.severity}] ${f.id}: ${f.message}`);
  if (planted) for (const p of planted) console.log(`[planted] ${p.path}: ${p.state}${p.advice ? " - " + p.advice : ""}`);
  for (const f of fixed) console.log(`[fixed] ${f}`);
  for (const n of notes) console.log(`[note] ${n}`);
  console.log(`\n${findings.length} findings (${findings.filter((f) => f.pending).length} need judgement).`);
  if (fix) console.log(`${fixed.length} fixed. Findings above were measured before the fixes ran; planted state is current.`);
}
process.exit(failed ? 1 : 0);
