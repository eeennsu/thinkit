// Whether the config we wrote is the one its tool actually reads.
//
// scaffold decides ownership by exact path: it writes `eslint.config.mjs`, sees
// nothing at that path, and records the file as ours. A tool decides effect by
// precedence over a *family* of names. ESLint takes the first of
// eslint.config.js / .mjs / .cjs that exists and never looks at the rest;
// Prettier ranks package.json#prettier and .prettierrc above prettier.config.mjs.
//
// So on a repo that already had `eslint.config.js`, both statements are true at
// once: the generated file is ours, and nothing loads it. report.mjs used to
// print the boundary counts from the first fact alone, which is how a repo with
// zero rules in effect was told 25 were enforced.
//
// "This path is free" is not "this concern is unowned".
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Highest precedence first. Sources are the tools' own resolution order, not a
// preference: reordering these changes what the report claims about a repo.
const FAMILIES = {
  // https://eslint.org/docs/latest/use/configure/configuration-files
  eslint: ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts", "eslint.config.cts"],
  // https://prettier.io/docs/configuration
  prettier: [
    "package.json#prettier",
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.yml",
    ".prettierrc.yaml",
    ".prettierrc.json5",
    ".prettierrc.js",
    "prettier.config.js",
    ".prettierrc.mjs",
    "prettier.config.mjs",
    ".prettierrc.cjs",
    "prettier.config.cjs",
    ".prettierrc.toml",
  ],
};

export function familyOf(rel) {
  for (const [name, members] of Object.entries(FAMILIES)) if (members.includes(rel)) return name;
  return null;
}

function present(target, member) {
  if (member === "package.json#prettier") {
    const p = join(target, "package.json");
    if (!existsSync(p)) return false;
    try {
      return JSON.parse(readFileSync(p, "utf8")).prettier !== undefined;
    } catch {
      // A package.json npm cannot read is not a prettier config either.
      return false;
    }
  }
  return existsSync(join(target, member));
}

// { shadowed, winner, family }. `shadowed` is false when the concern has no
// known family -- we only claim precedence where a published order says so,
// because a guessed one would move counts around for no reason.
export function shadowed(target, rel) {
  const family = familyOf(rel);
  if (!family) return { shadowed: false, winner: null, family: null };
  const members = FAMILIES[family];
  const ourRank = members.indexOf(rel);
  for (let i = 0; i < ourRank; i++) {
    if (present(target, members[i])) return { shadowed: true, winner: members[i], family };
  }
  return { shadowed: false, winner: present(target, rel) ? rel : null, family };
}
