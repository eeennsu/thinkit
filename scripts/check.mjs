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
    const declared = JSON.parse(manifest).declared?.safetyBoundaries;
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
    if (!JSON.parse(pkg).scripts?.["harness:check"])
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
    machine[rule.id]?.(rule, calValue);
  } else {
    add(rule, rule.severity, `Judgement item. Rubric: ${rule.rubric}`, {
      pending: true,
      asks: rule.audit?.asks,
      phrases: calValue.set ? calValue.phrases : undefined,
    });
  }
}

// Planted copies: same three-state comparison the skill reports on.
function plantedState() {
  const manifestPath = join(target, ".claude/harness/manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);
  return manifest.files.map((f) => {
    const p = join(target, f.path);
    if (!existsSync(p)) return { path: f.path, state: "missing" };
    const now = sha(p);
    if (now !== f.sha256) return { path: f.path, state: "edited-locally", advice: "merge by hand; do not overwrite" };
    if (manifest.version !== rules.version) return { path: f.path, state: "outdated", advice: "regenerate" };
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
  if (pkgRaw) {
    const pkg = JSON.parse(pkgRaw);
    if (!pkg.scripts?.["harness:check"]) {
      pkg.scripts = { ...pkg.scripts, "harness:check": "node .claude/harness/check.mjs --mode principles" };
      write("package.json", JSON.stringify(pkg, null, 2) + "\n");
      fixed.push('package.json: registered the "harness:check" script');
    }
  }

  // Only files still byte-identical to what was planted. `edited-locally` is
  // never touched: the report surfaces it and the owner merges.
  const stale = (planted ?? []).filter((p) => p.state === "outdated" || p.state === "missing");
  if (stale.length && pluginRoot) {
    const { plantedFiles, sha } = await import("./lib/planted.mjs");
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
