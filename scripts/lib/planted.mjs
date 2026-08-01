import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

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
export function plantedFiles(root) {
  const rules = JSON.parse(readFileSync(join(root, "principles/rules.json"), "utf8"));
  const principles = {
    version: rules.version,
    note: rules.note,
    items: rules.items.filter((i) => i.axis === "principle"),
  };
  return {
    version: rules.version,
    files: [
      { path: ".claude/harness/check.mjs", content: readFileSync(join(root, "scripts/check.mjs"), "utf8") },
      { path: ".claude/harness/rules.principles.json", content: JSON.stringify(principles, null, 2) + "\n" },
    ],
  };
}
