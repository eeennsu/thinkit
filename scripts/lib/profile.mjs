import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Merge rules, fixed on purpose:
//   scalars  -> child overrides parent
//   arrays   -> child replaces parent (never merged: merged arrays produce
//               configs nobody can predict by reading either file)
//   objects  -> shallow merge, one level
//   extends  -> one level only
function merge(parent, child) {
  const out = { ...parent };
  for (const [k, v] of Object.entries(child)) {
    if (k === "extends" || k === "abstract") continue;
    if (v && typeof v === "object" && !Array.isArray(v) && parent[k] && typeof parent[k] === "object" && !Array.isArray(parent[k])) {
      out[k] = { ...parent[k], ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function loadProfile(root, stack) {
  const path = join(root, "stacks", stack, "profile.json");
  if (!existsSync(path)) throw new Error(`unknown stack: ${stack}`);
  const own = JSON.parse(readFileSync(path, "utf8"));
  if (own.abstract) throw new Error(`stack "${stack}" is abstract and cannot be used directly`);
  if (!own.extends) return own;
  const parentPath = join(root, "stacks", own.extends, "profile.json");
  const parent = JSON.parse(readFileSync(parentPath, "utf8"));
  if (parent.extends) throw new Error("extends is one level only");
  return merge(parent, own);
}

// Abstract profiles are excluded: they exist to be extended, and offering one
// as a choice produces a run that loadProfile then refuses.
export function listStacks(root) {
  return readdirSync(join(root, "stacks"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !JSON.parse(readFileSync(join(root, "stacks", name, "profile.json"), "utf8")).abstract);
}
