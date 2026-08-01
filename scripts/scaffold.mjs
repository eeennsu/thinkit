#!/usr/bin/env node
// Answers + stack profile -> files. Idempotent, and never overwrites a file it
// did not write: a config that was already there is the repo's, and a merge is
// the author's call, not ours. check.mjs reports the resulting state.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";
import { loadProfile, listStacks } from "./lib/profile.mjs";
import { plantedFiles, sha } from "./lib/planted.mjs";
import { readAlias } from "./lib/alias.mjs";
import { buildElements, buildPolicies, counts, resolveOptions } from "./fsd-boundaries.mjs";

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
const answers = existsSync(opt("answers", "")) ? JSON.parse(readFileSync(opt("answers"), "utf8")) : {};

const profile = loadProfile(root, stack);
const fsd = JSON.parse(readFileSync(join(root, "modules/fsd/layers.json"), "utf8"));
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
const { alias, source: aliasSource } = await readAlias(target, profile);
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
put(".claude/harness/manifest.json", JSON.stringify({
  version: plant.version,
  stack,
  declared: { safetyBoundaries: Boolean(answers.safetyBoundaries?.length) },
  fsd: {
    publicApi: fsdOpts.publicApi,
    sliceCoupling: fsdOpts.sliceCoupling,
    routingRoot: fsdOpts.routingRoot,
    routingImports: fsdOpts.routingImports,
  },
  alias: { source: aliasSource, count: Object.keys(alias).length },
  files: manifestFiles,
}, null, 2) + "\n");

// package.json: register the check and record the dev dependencies. Installing
// them is left to the repo owner.
const pkgPath = join(target, "package.json");
const pkgRaw = existsSync(pkgPath) ? readFileSync(pkgPath, "utf8") : null;
const pkg = pkgRaw ? JSON.parse(pkgRaw) : { name: vars.projectName.toLowerCase(), private: true, version: "0.0.0" };
pkg.scripts = { ...pkg.scripts, "harness:check": "node .claude/harness/check.mjs --mode principles", lint: pkg.scripts?.lint ?? "eslint ." };
pkg.devDependencies = { ...pkg.devDependencies, ...profile.devDependencies, [profile.resolver.devDependency]: pkg.devDependencies?.[profile.resolver.devDependency] ?? "*" };
// This is the one file here that belongs to the repo and is edited rather than
// owned, so it keeps the repo's own formatting. Reformatting it to our style
// would put every line of someone else's package.json in the diff for the sake
// of two added keys. Key order survives JSON.parse; indentation has to be read
// back off the file. The match is the first indented line, which in a JSON
// object is depth one, and it is passed to stringify verbatim so tabs stay tabs.
const indent = pkgRaw?.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
const trailingNewline = pkgRaw && !pkgRaw.endsWith("\n") ? "" : "\n";
put("package.json", JSON.stringify(pkg, null, indent) + trailingNewline);

const summary = {
  stack,
  target,
  written,
  counts: counts(fsd, profile, fsdOpts),
  fsd: { publicApi: fsdOpts.publicApi, sliceCoupling: fsdOpts.sliceCoupling },
  aliases: Object.keys(alias).length,
  aliasSource,
};
if (args.includes("--json")) console.log(JSON.stringify(summary, null, 2));
else console.log(`scaffolded ${stack} into ${target}: ${written.length} files`);
