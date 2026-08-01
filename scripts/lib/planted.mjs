import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

// The files in the target that are still exactly what this plugin wrote.
//
// Recorded-and-unchanged is a narrower thing than recorded: a config the repo
// has since edited is the repo's answer now, whatever the manifest says about
// who created it. Callers that must not read their own output back in as the
// repo's input use this to tell the two apart.
export function ownedUnchanged(target, manifest) {
  const out = new Set();
  for (const f of manifest?.files ?? []) {
    const abs = join(target, f.path);
    if (existsSync(abs) && sha(readFileSync(abs)) === f.sha256) out.add(f.path);
  }
  return out;
}

// The files this plugin plants into a target repo, and their content.
//
// One owner. scaffold.mjs writes them on bootstrap and check.mjs --fix
// refreshes a stale one; if each built its own copy of this list they would
// drift, and a planted file that disagrees with the plugin is exactly the
// failure this repo audits other repos for.
//
// Only the `principle` axis is planted. Calibrated items are positions on a
// model generation, and a value copied into someone else's repo is stale the
// moment the generation moves.
// The version recorded in a target's manifest, and the only thing that tells
// `current` from `outdated` there. It is a hash of the planted content, not
// rules.json's own version number: half of what gets planted is check.mjs,
// whose behaviour is not described by a version the rule set owns. Keyed on the
// rule version alone, every fix to the checker shipped as `current` to every
// repo already holding the old one.
//
// The rule version stays in the prefix so the value is still readable at a
// glance, and so a rule change alone is enough to move it.
export function plantedFiles(root) {
  const rules = JSON.parse(readFileSync(join(root, "principles/rules.json"), "utf8"));
  const principles = {
    version: rules.version,
    note: rules.note,
    items: rules.items.filter((i) => i.axis === "principle"),
  };
  const files = [
    { path: ".claude/harness/check.mjs", content: readFileSync(join(root, "scripts/check.mjs"), "utf8") },
    { path: ".claude/harness/rules.principles.json", content: JSON.stringify(principles, null, 2) + "\n" },
  ];
  const digest = sha(Buffer.from(files.map((f) => `${f.path}\n${f.content}`).join("\n"), "utf8"));
  return { version: `${rules.version}-${digest}`, files };
}
