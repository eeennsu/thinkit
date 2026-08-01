#!/usr/bin/env node
// Static checks over the stack profiles. No sandbox, no install: everything
// here is answerable from the files in this repo, which is exactly why it was
// missing. The gaps it catches are the ones that only show up in someone
// else's repo, days later -- a stack whose dependency list forgot typescript
// generates a tsconfig and a typescript-eslint config that nothing can run.
//
// The rule these all share: a profile is a promise about what a scaffolded repo
// will contain, and a promise nothing checks drifts one stack at a time.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile, listStacks, questionsPath } from "../scripts/lib/profile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let failed = false;
const ok = (msg) => console.log(`ok   ${msg}`);
const bad = (msg) => {
  console.log(`FAIL ${msg}`);
  failed = true;
};

const stacks = listStacks(root);
if (!stacks.length) bad("listStacks() returned nothing");

// Every package the generated configs import by name. eslint cannot start
// without them, and the failure is MODULE_NOT_FOUND at lint time in the target
// repo -- far from the profile that omitted it.
//
// typescript is on the list even though no config imports it directly:
// typescript-eslint's parser requires it, and the scaffold writes a
// tsconfig.json that presumes a compiler exists to read it.
const REQUIRED_DEPS = [
  "eslint",
  "eslint-plugin-boundaries",
  "typescript-eslint",
  "typescript",
  "eslint-plugin-react-hooks",
  "prettier",
  "@ianvs/prettier-plugin-sort-imports",
];

for (const stack of stacks) {
  const profile = loadProfile(root, stack);

  const missing = REQUIRED_DEPS.filter((d) => !(d in (profile.devDependencies ?? {})));
  if (missing.length) bad(`${stack}: devDependencies missing ${missing.join(", ")}`);
  else ok(`${stack}: all ${REQUIRED_DEPS.length} required devDependencies declared`);

  // scaffold.mjs adds this one separately, so a profile naming a resolver
  // package it does not also list still installs. It must still name one.
  if (!profile.resolver?.devDependency) bad(`${stack}: resolver.devDependency is not set`);

  if (!profile.fsdRoot) bad(`${stack}: fsdRoot is not set`);

  const templates = profile.files ?? [];
  if (!templates.length) bad(`${stack}: files[] is empty, so the run writes no config`);
  for (const f of templates) {
    if (!existsSync(join(root, f.template))) bad(`${stack}: files[] names a template that does not exist: ${f.template}`);
  }
  ok(`${stack}: ${templates.length} templates resolve`);

  // A babel config that names an empty preset is a config babel rejects. Only
  // the stacks that write one are held to it.
  const writesBabel = templates.some((f) => f.dest === "babel.config.js");
  if (writesBabel && !profile.babelPreset) bad(`${stack}: writes babel.config.js but declares no babelPreset`);
}

// The overlay wiring, from both ends. One direction catches a profile pointing
// at a file that was renamed; the other catches an overlay that exists and is
// never read, which is the shape this check was written for.
const declared = new Map();
for (const stack of stacks) {
  let path;
  try {
    path = questionsPath(root, stack);
  } catch (e) {
    bad(`${stack}: ${e.message}`);
    continue;
  }
  if (path) declared.set(path.split("\\").join("/"), stack);
}

const onDisk = readdirSync(join(root, "stacks"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(root, "stacks", d.name, "questions.json"))
  .filter((p) => existsSync(p))
  .map((p) => p.split("\\").join("/"));

const orphans = onDisk.filter((p) => !declared.has(p));
if (orphans.length) {
  bad(`questions.json present but declared by no profile: ${orphans.map((p) => p.slice(root.length + 1)).join(", ")}`);
} else {
  ok(`interview overlays: ${declared.size} declared, ${onDisk.length} on disk, no orphans`);
}

// The question ids the interview actually has. An overlay naming Q8 is read,
// applied to nothing, and reports no error -- the same dead reference the
// `questions` field itself was, one level down.
const interview = readFileSync(join(root, "skills/harness-bootstrap/references/interview.md"), "utf8");
const questionIds = new Set([...interview.matchAll(/^##\s+(Q\d+)\b/gm)].map((m) => m[1]));
if (!questionIds.size) bad("interview.md: no Q-numbered headings found, so overlay targets cannot be checked");

for (const [path, stack] of declared) {
  let overlay;
  try {
    overlay = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    bad(`${stack}: questions.json is not valid JSON: ${e.message}`);
    continue;
  }
  if (!Array.isArray(overlay.overlays)) {
    bad(`${stack}: questions.json has no overlays[] array`);
    continue;
  }
  for (const entry of overlay.overlays) {
    if (!questionIds.has(entry.question)) bad(`${stack}: overlay targets ${entry.question}, which the interview does not ask`);
    if (!Array.isArray(entry.prompts) || !entry.prompts.length) bad(`${stack}: overlay for ${entry.question} carries no prompts`);
  }
  ok(`${stack}: ${overlay.overlays.length} overlays, all targeting questions that exist`);
}

// Abstract profiles exist to be extended. Offering one produces a run that
// loadProfile refuses, so the two have to agree.
for (const dir of readdirSync(join(root, "stacks"), { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const p = join(root, "stacks", dir.name, "profile.json");
  if (!existsSync(p)) {
    bad(`stacks/${dir.name} has no profile.json`);
    continue;
  }
  const raw = JSON.parse(readFileSync(p, "utf8"));
  if (raw.abstract && stacks.includes(dir.name)) bad(`${dir.name} is abstract but listStacks() offers it`);
  if (!raw.abstract && !stacks.includes(dir.name)) bad(`${dir.name} is shippable but listStacks() omits it`);
}
ok(`stacks offered: ${stacks.join(", ")}`);

// Every place that types the stack list out by hand. A new stack directory is
// the easy half of adding a stack; the half that gets forgotten is every list
// that already exists, and a stack missing from the command's hint is a stack
// nobody is offered.
const HARDCODED = [
  { file: "commands/harness-bootstrap.md", why: "the command's argument-hint" },
  { file: "README.md", why: "the README's command block" },
];
for (const { file, why } of HARDCODED) {
  const text = readFileSync(join(root, file), "utf8");
  const listed = [...text.matchAll(/<([a-z0-9-]+(?:\|[a-z0-9-]+)+)>/g)].flatMap((m) => m[1].split("|"));
  const unique = [...new Set(listed)];
  if (!unique.length) {
    bad(`${file}: no stack list found where one was expected (${why})`);
    continue;
  }
  const missing = stacks.filter((s) => !unique.includes(s));
  const extra = unique.filter((s) => !stacks.includes(s));
  if (missing.length || extra.length) {
    bad(`${file}: ${why} lists [${unique.join("|")}], shippable stacks are [${stacks.join("|")}]`);
  } else {
    ok(`${file}: ${why} matches listStacks()`);
  }
}

// A rule declaring itself machine-decidable with nothing implementing it used
// to produce no findings, which is what a passing rule produces. check.mjs now
// reports that at runtime; this catches it before it ships, which matters
// because the rule set is planted into other people's repos.
{
  const source = readFileSync(join(root, "scripts/check.mjs"), "utf8");
  const rules = JSON.parse(readFileSync(join(root, "principles/rules.json"), "utf8"));
  const machineRules = rules.items.filter((i) => i.decidable === "machine");
  const unimplemented = machineRules.filter((i) => !source.includes(`"${i.id}":`));
  if (unimplemented.length) bad(`rules.json declares machine rules check.mjs does not implement: ${unimplemented.map((i) => i.id).join(", ")}`);
  else ok(`all ${machineRules.length} machine-decidable rules have an implementation`);

  // And the other direction: a handler for a rule id that no longer exists is
  // dead code that reads as coverage.
  const ids = new Set(rules.items.map((i) => i.id));
  const handlers = [...source.matchAll(/^ {2}"([a-z0-9.-]+)":/gm)].map((m) => m[1]);
  const orphanHandlers = handlers.filter((h) => !ids.has(h));
  if (orphanHandlers.length) bad(`check.mjs implements rules that rules.json does not declare: ${orphanHandlers.join(", ")}`);
  else ok(`no orphan rule handlers in check.mjs`);
}

process.exit(failed ? 1 : 0);
