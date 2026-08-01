// layers.json + the alias table -> the formatter's import order.
//
// Same owner as the boundary policies. The lint rule decides which imports are
// legal; this decides where a legal one is written. Kept by hand the two drift,
// and the formatter's copy drifts silently: nothing reports a file whose import
// block stopped matching the layer graph, it just stops being readable as one.
//
// Verified against @ianvs/prettier-plugin-sort-imports 4.7.1:
//   - entries are regex strings, matched in order, first match wins
//   - "" is a blank-line separator, not a pattern
//   - <BUILTIN_MODULES> and <THIRD_PARTY_MODULES> are the documented
//     placeholders; anything matching no entry lands in third-party
//   - side-effect-only imports (`import './wdyr'`) are unsortable barriers by
//     default and other imports may not cross them. So the entry a @trivago
//     config needs at the top of the list is not generated here, and the repo
//     is not asked for one: the plugin already holds it.
//
// The @ianvs fork, not @trivago: @trivago is prettier-2 era and every profile
// pins prettier ^3.

const trimSlash = (s) => String(s).replace(/\/+$/, "");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A JS string literal for a config file written with singleQuote: true. Built
// rather than JSON.stringify'd so the quotes match the file's own rule; the
// backslashes escapeRe emits have to survive the second layer.
const jsString = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

// Alias values are stored the way profile.alias stores them: no leading "./",
// no trailing slash. A repo aliasing its own root writes "." — normalized to ""
// so that "covers everything" is one case instead of two.
const aliasTarget = (value) => {
  const to = trimSlash(value);
  return to === "." ? "" : to;
};

// A directory -> the regex matching how imports of it are actually written.
//
// The alias table is searched for the entry covering the directory most
// specifically. With `@screens -> src/screens` on the table the pattern is
// `^@screens/(.*)$`; with only `@ -> src` it is `^@/screens/(.*)$`. Both are
// real: the table is read off the target repo when it has one, so this cannot
// assume the shape bootstrap would have generated.
//
// A directory no alias covers falls back to its own path. That matches a repo
// importing through baseUrl, and on a repo that does neither it simply matches
// nothing -- an unmatched group costs an unused entry, not a wrong one.
export function patternFor(dir, alias = {}) {
  let best = null;
  for (const [prefix, value] of Object.entries(alias)) {
    const to = aliasTarget(value);
    if (!(to === "" || dir === to || dir.startsWith(`${to}/`))) continue;
    if (best && best.to.length >= to.length) continue;
    best = { prefix, to };
  }
  if (!best) return `^${escapeRe(dir)}/(.*)$`;
  const rest = best.to === "" ? dir : dir.slice(best.to.length).replace(/^\//, "");
  return `^${escapeRe(best.prefix)}${rest ? `/${escapeRe(rest)}` : ""}/(.*)$`;
}

// The directories that get their own group, in the order they are written.
// Routing first, then layers top-down -- the same sequence buildElements()
// registers, so the import block reads in the direction the policies allow.
export function groupDirs(fsd, profile, opts = {}) {
  const o = { routingRoot: profile.routingRoot ?? null, ...opts };
  const root = trimSlash(profile.fsdRoot);
  const dirs = [];
  if (o.routingRoot) dirs.push(trimSlash(o.routingRoot));
  for (const layer of fsd.layers) dirs.push(`${root}/${layer.name}`);
  return dirs;
}

export function buildImportOrder(fsd, profile, alias = {}, opts = {}) {
  const order = ["<BUILTIN_MODULES>", "", "<THIRD_PARTY_MODULES>", ""];
  for (const dir of groupDirs(fsd, profile, opts)) order.push(patternFor(dir, alias), "");

  // Catch-all for the rest of fsdRoot, after every layer so the layer patterns
  // win. Without it a file that is inside the source root but not inside a
  // layer -- `@/config`, `@/app.tsx` -- matches no entry and is filed under
  // third-party, next to the packages. FSD says such a file should not exist;
  // real repos have a few, and misfiling them is worse than one extra entry.
  const rest = patternFor(trimSlash(profile.fsdRoot), alias);
  if (!order.includes(rest)) order.push(rest, "");

  order.push("^[.]");
  return order;
}

// Rendered as a JS array literal rather than JSON: it is written into a
// prettier config that sets singleQuote, and a generated file that violates the
// rule it configures is the first thing a reader stops trusting.
export function renderImportOrder(order, indent = 4) {
  const pad = " ".repeat(indent);
  return `[\n${order.map((e) => `${pad}${jsString(e)},`).join("\n")}\n${" ".repeat(indent - 2)}]`;
}
