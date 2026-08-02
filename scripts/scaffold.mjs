#!/usr/bin/env node
// Answers + stack profile -> files. Idempotent, and never overwrites a file it
// did not write: a config that was already there is the repo's, and a merge is
// the author's call, not ours. check.mjs reports the resulting state.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";
import { loadProfile, listStacks } from "./lib/profile.mjs";
import { plantedFiles, sha, ownedUnchanged } from "./lib/planted.mjs";
import { readAlias } from "./lib/alias.mjs";
import { buildElements, buildPolicies, counts, resolveOptions } from "./fsd-boundaries.mjs";
import { buildImportOrder, renderImportOrder } from "./import-order.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const stack = args[0];
if (!stack || stack.startsWith("--")) {
  console.error("usage: scaffold.mjs <stack> --target <dir> [--answers <file.json>]");
  console.error(`stacks: ${listStacks(root).join(", ")}`);
  process.exit(2);
}
const target = resolve(opt("target", process.cwd()));

// An --answers path that does not resolve is the whole interview thrown away.
// Falling back to {} produced the strict defaults and reported them as the
// repo's answers -- the exact failure resolveOptions() refuses to make for a
// single key, made for all of them at once.
const answersPath = opt("answers", "");
let answers = {};
if (answersPath) {
  if (!existsSync(answersPath)) {
    console.error(`--answers ${answersPath}: no such file. Nothing was written.`);
    process.exit(2);
  }
  try {
    answers = JSON.parse(readFileSync(answersPath, "utf8"));
  } catch (e) {
    console.error(`--answers ${answersPath}: not valid JSON (${e.message}). Nothing was written.`);
    process.exit(2);
  }
  if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
    console.error(`--answers ${answersPath}: expected a JSON object of answer keys. Nothing was written.`);
    process.exit(2);
  }
}

// Goes straight into the generated rule as an eslint severity. An unknown value
// is not caught by eslint as a typo -- it is a config error that stops the whole
// lint run, on a file the repo owner did not write.
const SEVERITIES = ["error", "warn", "off"];
if (answers.severity !== undefined && !SEVERITIES.includes(answers.severity)) {
  console.error(`severity must be one of ${SEVERITIES.join(", ")}: got "${answers.severity}". Nothing was written.`);
  process.exit(2);
}

// The shape of the remaining answers, checked here rather than where they are
// used. Both mistakes are ones a person writing the file by hand makes:
//
//   "safetyBoundaries": "no production deploys"   one item, quotes instead of
//                                                 brackets. A string has a
//                                                 length, so it read as three
//                                                 non-empty answers and then
//                                                 died on .map, after the run
//                                                 had already written files.
//   "oneLine": { "ko": "…" }                      renders as [object Object]
//                                                 into the first line of
//                                                 someone's CLAUDE.md.
//
// Neither is caught by anything downstream, and the second one is not caught at
// all: it ships.
const shapeErrors = [];
for (const key of ["safetyBoundaries", "verification", "exceptions", "routingImports"]) {
  const v = answers[key];
  if (v === undefined || v === null) continue;
  if (!Array.isArray(v)) shapeErrors.push(`${key} must be an array of strings, got ${typeof v}`);
  else if (v.some((item) => typeof item !== "string")) shapeErrors.push(`${key} must contain only strings`);
}
for (const key of ["projectName", "oneLine", "routingRoot"]) {
  const v = answers[key];
  if (v === undefined || v === null) continue;
  if (typeof v !== "string") shapeErrors.push(`${key} must be a string, got ${Array.isArray(v) ? "array" : typeof v}`);
}
if (shapeErrors.length) {
  for (const e of shapeErrors) console.error(e);
  console.error("Nothing was written.");
  process.exit(2);
}

const profile = loadProfile(root, stack);
const fsd = JSON.parse(readFileSync(join(root, "modules/fsd/layers.json"), "utf8"));

// Which directories sit under fsdRoot is repo-visible, so it is read rather than
// asked -- the same treatment routingRoot gets. Without it every import into one
// of them is an unknown dependency, and a repo whose lint runs with
// --max-warnings 0 gets a config it cannot switch on. An explicit answer wins,
// including `[]` for a repo that would rather see them reported.
if (answers.extraRoots === undefined) {
  const fsdRootName = profile.fsdRoot.replace(/\/+$/, "");
  const fsdAbs = join(target, fsdRootName);
  const known = new Set(fsd.layers.map((l) => l.name));
  // A routingRoot inside fsdRoot (src/app, src/navigators) already has its own
  // element registered ahead of the layers; listing it again would shadow it.
  const routingParts = String(answers.routingRoot ?? profile.routingRoot ?? "").replace(/\/+$/, "").split("/").filter(Boolean);
  if (routingParts[0] === fsdRootName && routingParts[1]) known.add(routingParts[1]);
  answers.extraRoots = existsSync(fsdAbs)
    ? readdirSync(fsdAbs, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !known.has(d.name) && !d.name.startsWith("."))
        .map((d) => d.name)
        .sort()
    : [];
}

// Throws on an answer the layer graph does not allow. Loud beats a silent
// fall back to the strict default, which would be reported as the repo's answer.
const fsdOpts = resolveOptions(fsd, profile, answers);
const written = [];

// Read before anything is written: the manifest decides what this run is allowed
// to overwrite.
const manifestPath = join(target, ".claude/harness/manifest.json");
const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const manifestFiles = [];

function put(relPath, content) {
  const abs = join(target, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  const existed = existsSync(abs);
  if (existed && readFileSync(abs, "utf8") === content) {
    written.push({ path: relPath, state: "unchanged" });
    return;
  }
  writeFileSync(abs, content, "utf8");
  written.push({ path: relPath, state: existed ? "written" : "created" });
}

// Every generated file goes through here, and the manifest is the record of
// what this plugin owns. Three states, and only the first one writes:
//   not on disk, or on disk exactly as we last wrote it  -> ours, refresh it
//   on disk but never recorded                           -> the repo's, leave it
//   recorded but changed since                           -> edited locally, leave it
function putOwned(relPath, content) {
  const abs = join(target, relPath);
  const recorded = prev?.files.find((f) => f.path === relPath);
  if (existsSync(abs)) {
    if (!recorded) {
      written.push({ path: relPath, state: "exists, left alone" });
      return;
    }
    if (sha(readFileSync(abs)) !== recorded.sha256) {
      written.push({ path: relPath, state: "edited-locally, left alone" });
      manifestFiles.push(recorded);
      return;
    }
  }
  put(relPath, content);
  manifestFiles.push({ path: relPath, sha256: sha(Buffer.from(content, "utf8")) });
}

// One alias table. tsconfig paths and the babel alias are both derived from it;
// two hand-written tables drift and nothing notices. On a repo that already
// resolves imports the table is read from there instead of invented -- see
// lib/alias.mjs.
const { alias, source: aliasSource } = await readAlias(target, profile, ownedUnchanged(target, prev));
const paths = Object.fromEntries(Object.entries(alias).map(([k, v]) => [`${k}/*`, [`${v}/*`]]));
const babelAlias = Object.fromEntries(Object.entries(alias).map(([k, v]) => [k, `./${v}`]));
const fsdRootDir = profile.fsdRoot.replace(/\/+$/, "");
const include = [fsdRootDir];
if (fsdOpts.routingRoot) {
  const routingDir = fsdOpts.routingRoot.replace(/\/+$/, "");
  // A routingRoot inside fsdRoot is already covered; listing it twice makes
  // tsconfig include a duplicate entry.
  if (!routingDir.startsWith(`${fsdRootDir}/`) && routingDir !== fsdRootDir) include.push(routingDir);
}

const vars = {
  stack,
  severity: answers.severity ?? (answers.greenfield === false ? "warn" : "error"),
  elementsJson: JSON.stringify(buildElements(fsd, profile, fsdOpts), null, 8).replace(/\n {8}\]/, "\n      ]"),
  policiesJson: JSON.stringify(buildPolicies(fsd, profile, fsdOpts), null, 10).replace(/\n {10}\]/, "\n          ]"),
  resolverJson: JSON.stringify(profile.resolver.settings, null, 6).replace(/\n {6}\}/, "\n    }"),
  pathsJson: JSON.stringify(paths, null, 6).replace(/\n {6}\}/, "\n    }"),
  includeJson: JSON.stringify(include),
  babelPreset: profile.babelPreset ?? "",
  aliasJson: JSON.stringify(babelAlias, null, 10).replace(/\n {10}\}/, "\n        }"),
  // Built from the same layer graph and the same alias table as the boundary
  // policies, so the formatter groups imports in the order the linter allows
  // them. Passing the resolved fsdOpts matters: routingRoot decides whether
  // there is a routing group at all.
  importOrderJs: renderImportOrder(buildImportOrder(fsd, profile, alias, fsdOpts)),
  projectName: answers.projectName ?? "Project",
  oneLine: answers.oneLine ?? "<one line: what this repo is for>",
  safetySection: answers.safetyBoundaries?.length
    ? `\n## Safety Boundaries\n\n${answers.safetyBoundaries.map((s) => `- ${s}`).join("\n")}\n`
    : "",
  referencesSection: answers.exceptions?.length
    ? "\n## References\n\n- `@.claude/references/architecture.md`\n"
    : "",
  exceptions: (answers.exceptions ?? []).map((s) => `- ${s}`).join("\n"),
  verificationFacts: (answers.verification ?? []).map((s) => `- ${s}`).join("\n"),
};

for (const f of profile.files) putOwned(f.dest, render(readFileSync(join(root, f.template), "utf8"), vars));
putOwned("CLAUDE.md", render(readFileSync(join(root, "templates/CLAUDE.md.hbs"), "utf8"), vars));
if (answers.exceptions?.length)
  putOwned(".claude/references/architecture.md", render(readFileSync(join(root, "templates/architecture.md.hbs"), "utf8"), vars));

// Q3. Written only from an answer: with nothing repo-specific to say, the file
// would hold only the procedure the model already follows, and that is worse
// than no file. Empty is the expected outcome on a new repo.
if (answers.verification?.length)
  putOwned(".claude/skills/verification/SKILL.md", render(readFileSync(join(root, "templates/verification.SKILL.md.hbs"), "utf8"), vars));

// Layer directories exist on disk; they are never described in CLAUDE.md.
for (const layer of fsd.layers) put(`${fsdRootDir}/${layer.name}/.gitkeep`, "");
if (fsdOpts.routingRoot) put(`${fsdOpts.routingRoot.replace(/\/+$/, "")}/.gitkeep`, "");

// Plant the checker itself, plus the principle-only rule set. The list and its
// content live in lib/planted.mjs so that check.mjs --fix refreshes exactly
// what bootstrap wrote.
const plant = plantedFiles(root);
for (const { path: rel, content } of plant.files) putOwned(rel, content);

// The variants are recorded because report.mjs cannot re-derive them: they came
// from an answer, not from the stack. A report that recomputed them from the
// profile would print the strict counts for a repo that answered otherwise.
// Answered *and* written. The section this records lives in CLAUDE.md, and a
// repo that already had one keeps it -- so on a brownfield repo the answer was
// collected and then had nowhere to go. Recording it as declared anyway made
// check.mjs report "declared at setup but the section is gone", which is both an
// `error` that never clears and a false sentence: nothing is gone, nothing was
// ever written. A file we own but the repo has since edited stays declared, and
// that is the case the rule was built for.
const ownsClaudeMd = manifestFiles.some((f) => f.path === "CLAUDE.md");
const boundariesDropped = Boolean(answers.safetyBoundaries?.length) && !ownsClaudeMd;

put(".claude/harness/manifest.json", JSON.stringify({
  version: plant.version,
  stack,
  declared: { safetyBoundaries: Boolean(answers.safetyBoundaries?.length) && ownsClaudeMd },
  fsd: {
    publicApi: fsdOpts.publicApi,
    sliceCoupling: fsdOpts.sliceCoupling,
    routingRoot: fsdOpts.routingRoot,
    routingImports: fsdOpts.routingImports,
    extraRoots: fsdOpts.extraRoots,
  },
  alias: { source: aliasSource, count: Object.keys(alias).length },
  files: manifestFiles,
}, null, 2) + "\n");

// package.json: register the check and record the dev dependencies. Installing
// them is left to the repo owner.
const pkgPath = join(target, "package.json");
const pkgRaw = existsSync(pkgPath) ? readFileSync(pkgPath, "utf8") : null;
const pkg = pkgRaw ? JSON.parse(pkgRaw) : { name: vars.projectName.toLowerCase(), private: true, version: "0.0.0" };
// `format` is here for the same reason `lint` is. report.mjs prints an import
// order count as a rule the tooling enforces, and a formatter no command
// invokes enforces nothing -- the config is a preference until something runs
// it. Both are `??`: a repo that already has its own is left with it.
pkg.scripts = {
  ...pkg.scripts,
  "harness:check": "node .claude/harness/check.mjs --mode principles",
  lint: pkg.scripts?.lint ?? "eslint .",
  format: pkg.scripts?.format ?? "prettier --write .",
};
// An existing pin wins. A repo that fixed a version of eslint or typescript did
// it for a reason - usually a framework that ships its own - and a harness
// quietly widening someone's range is a change nobody asked for. Only names that
// are absent are added.
pkg.devDependencies = { ...pkg.devDependencies };
// The resolver is listed here in case a profile names one it did not pin. A
// profile that pinned it wins: spreading the resolver key last overwrote the
// profile's own `^4` with `*`, so the one dependency whose major version decides
// whether the generated config resolves at all shipped unpinned.
const devDeps = { [profile.resolver.devDependency]: "*", ...profile.devDependencies };
for (const [name, range] of Object.entries(devDeps))
  if (!(name in pkg.devDependencies)) pkg.devDependencies[name] = range;
// This is the one file here that belongs to the repo and is edited rather than
// owned, so it keeps the repo's own formatting. Reformatting it to our style
// would put every line of someone else's package.json in the diff for the sake
// of two added keys. Key order survives JSON.parse; indentation has to be read
// back off the file. The match is the first indented line, which in a JSON
// object is depth one, and it is passed to stringify verbatim so tabs stay tabs.
const indent = pkgRaw?.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
const trailingNewline = pkgRaw && !pkgRaw.endsWith("\n") ? "" : "\n";
put("package.json", JSON.stringify(pkg, null, indent) + trailingNewline);

// An answer that was collected and then had nowhere to go is not a detail of the
// file list. It is the one thing in this run the repo owner has to act on, and
// it is invisible in `written` -- the line there says "CLAUDE.md: exists, left
// alone", which reads like the harmless outcome it usually is.
const notes = [];
if (fsdOpts.extraRoots.length)
  notes.push(
    `${fsdOpts.extraRoots.length} directories under ${profile.fsdRoot} are not layers (${fsdOpts.extraRoots.join(", ")}). ` +
      `Each is registered at the bottom of the graph: anything may import it, and it may import ` +
      `${fsd.layers[fsd.layers.length - 1].name} and the others. Answer extraRoots to place them differently.`
  );
if (boundariesDropped)
  notes.push(
    `Q2 was answered but CLAUDE.md already existed, so no "## Safety Boundaries" section was written. ` +
      `The ${answers.safetyBoundaries.length} boundaries are in your answers file and nowhere else -- add them to CLAUDE.md by hand.`
  );

const summary = {
  stack,
  target,
  notes,
  written,
  counts: counts(fsd, profile, fsdOpts),
  fsd: { publicApi: fsdOpts.publicApi, sliceCoupling: fsdOpts.sliceCoupling },
  aliases: Object.keys(alias).length,
  aliasSource,
};
if (args.includes("--json")) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`scaffolded ${stack} into ${target}: ${written.length} files`);
  for (const n of notes) console.log(`  note: ${n}`);
}
