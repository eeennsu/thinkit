// layers.json -> eslint-plugin-boundaries settings + policies.
//
// Verified against eslint-plugin-boundaries 7.1.0:
//   - the canonical option key is `policies` (`rules` is a deprecated alias)
//   - `mode` is deprecated; folder is the default, `mode:"full"` is now `partialMatch:false`
//   - `{{ from.element.captured.X }}` templates work, but FSD does not need them:
//     slice isolation falls out of `default: "disallow"` because each slice is
//     its own element and imports inside one element are not checked
//     (checkInternals defaults to false)
//
// Policy array order: routing first, then layers top-down. Order does not change
// the outcome while every policy is an `allow` over a `disallow` default (proven
// by reversing the array and getting identical results), so the order exists for
// deterministic output. If a `disallow` policy is ever added it must come last:
// policies are evaluated in order and the last match wins.
//
// Every builder takes the same resolved `opts`. Build it once with
// resolveOptions() and pass the same object to all three: elements, policies and
// counts have to describe one configuration, and a count that disagrees with the
// config it counts is worse than no count.

const trimSlash = (s) => String(s).replace(/\/+$/, "");

const DEFAULTS = { publicApi: "enforced", sliceCoupling: "isolated" };

// answers -> the option object the builders take. Unknown values throw rather
// than falling back to the default: a typo that silently produces the strict
// config would be reported as the repo's answer.
export function resolveOptions(fsd, profile, answers = {}) {
  const spec = fsd.variants ?? {};
  const opts = { ...DEFAULTS };
  for (const name of Object.keys(DEFAULTS)) {
    const def = spec[name];
    if (!def) continue;
    opts[name] = def.default ?? DEFAULTS[name];
    const given = answers[name];
    if (given === undefined || given === null || given === "") continue;
    if (!def.values.includes(given))
      throw new Error(`unknown ${name}: "${given}". layers.json allows: ${def.values.join(", ")}`);
    opts[name] = given;
  }

  // The only answer that becomes both a path written to and a pattern matched
  // against, so it is validated at least as strictly as the rest. It fails two
  // ways at once: scaffold writes `<routingRoot>/.gitkeep` under the target, and
  // an escaping value puts files outside the repo being set up; the same value
  // also becomes a boundaries element pattern, and a pattern reaching outside
  // the project matches nothing - a config that looks right and enforces zero.
  const given = answers.routingRoot ?? profile.routingRoot ?? null;
  let routingRoot = null;
  if (given !== null) {
    const normalized = String(given).split("\\").join("/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || normalized.split("/").includes(".."))
      throw new Error(`routingRoot must be a repo-relative path that stays inside the repo: "${given}"`);
    // "." and "" both mean the repo root, which is not a routing directory --
    // it is every directory. As a boundaries pattern it would swallow the layer
    // elements registered after it; as a path it would write .gitkeep at the
    // repo root. An answer nobody meant, accepted in silence.
    if (normalized === "" || normalized === ".")
      throw new Error(`routingRoot must name a directory, not the repo root: "${given}". Omit the key for a stack with no routing directory.`);
    // A leading "./" survives into the element pattern, where it matches
    // nothing: the routing element registers, the policy referring to it is
    // generated, and zero files are ever classified as routing. A config that
    // reads correctly and enforces nothing is the failure mode this whole file
    // is written against, so the path is normalized rather than rejected.
    routingRoot = normalized;
  }
  opts.routingRoot = routingRoot;

  const names = fsd.layers.map((l) => l.name);
  const routingImports = answers.routingImports ?? fsd.routing.mayImport;
  // A string here is the likely mistake ("app" instead of ["app"]), and without
  // this it fails as a TypeError inside a filter -- a stack trace pointing at
  // our code for what is an answer-shape error.
  if (!Array.isArray(routingImports))
    throw new Error(`routingImports must be an array of layer names, got ${typeof routingImports}. layers: ${names.join(", ")}`);
  const unknown = routingImports.filter((n) => !names.includes(n));
  if (unknown.length)
    throw new Error(`routingImports names no such layer: ${unknown.join(", ")}. layers: ${names.join(", ")}`);
  opts.routingImports = routingImports;

  // Directories under fsdRoot that are not layers. Every repo that predates the
  // harness has some -- src/db, src/data, src/subjects -- and without an element
  // registered for them `boundaries/no-unknown-dependencies` fires on every
  // import that reaches one. On a repo whose lint runs with --max-warnings 0
  // that is not a finding, it is a config nobody can turn on.
  //
  // Read from the repo, not asked: which directories exist is repo-visible. What
  // they mean is not, so they are placed where the least can go wrong -- at the
  // bottom, importable by everything, importing only the bottom layer and each
  // other. That is the position `shared` already holds, and it is the only one
  // that adds no permission the layer graph did not already grant.
  const extraRoots = answers.extraRoots ?? [];
  if (!Array.isArray(extraRoots))
    throw new Error(`extraRoots must be an array of directory names, got ${typeof extraRoots}`);
  const collides = extraRoots.filter((n) => names.includes(n));
  if (collides.length)
    throw new Error(`extraRoots names a layer, which already has an element: ${collides.join(", ")}`);
  opts.extraRoots = extraRoots.map(trimSlash);

  return opts;
}

export function buildElements(fsd, profile, opts = {}) {
  const o = { ...DEFAULTS, routingRoot: profile.routingRoot ?? null, ...opts };
  const root = trimSlash(profile.fsdRoot);
  const elements = [];
  // Registered first on purpose. A routingRoot inside fsdRoot (src/navigators/)
  // would otherwise be swallowed by whichever layer pattern reaches it first.
  if (o.routingRoot) {
    elements.push({ type: fsd.routing.type, pattern: trimSlash(o.routingRoot) });
  }
  for (const layer of fsd.layers) {
    elements.push(
      layer.sliced
        ? { type: layer.name, pattern: `${root}/${layer.name}/*`, capture: ["slice"] }
        : { type: layer.name, pattern: `${root}/${layer.name}` }
    );
  }
  // After the layers: a non-layer root never collides with a layer pattern
  // (resolveOptions rejects a name that would), so the order is for reading.
  for (const extra of o.extraRoots ?? []) {
    elements.push({ type: extra, pattern: `${root}/${extra}` });
  }
  return elements;
}

export function buildPolicies(fsd, profile, opts = {}) {
  const o = {
    ...DEFAULTS,
    routingRoot: profile.routingRoot ?? null,
    routingImports: fsd.routing.mayImport,
    ...opts,
  };
  const names = fsd.layers.map((l) => l.name);
  const target = (name) => {
    const layer = fsd.layers.find((l) => l.name === name);
    // The per-layer flag says which layers have a public API at all; the variant
    // says whether it is enforced. Both must hold, so that answering "open" does
    // not turn a layer that never had one into a checked element.
    return layer.publicApiEnforced && o.publicApi === "enforced"
      ? { element: { type: name, fileInternalPath: fsd.publicApi } }
      : { element: { type: name } };
  };
  const extras = o.extraRoots ?? [];
  const bottom = names[names.length - 1];
  const policies = [];
  if (o.routingRoot) {
    policies.push({
      from: { element: { type: fsd.routing.type } },
      allow: { to: { element: { types: { anyOf: [...o.routingImports, ...extras] } } } },
    });
  }
  names.forEach((name, i) => {
    // Sibling slices are separate elements, so the disallow default already
    // blocks them; permitting them takes an explicit self-allow. It still goes
    // through target(), or "same-layer" would quietly hand a sibling the deep
    // import that "enforced" denies every other caller.
    if (o.sliceCoupling === "same-layer" && fsd.layers[i].sliced) {
      policies.push({ from: { element: { type: name } }, allow: { to: target(name) } });
    }
    const below = names.slice(i + 1);
    for (const lower of below) {
      policies.push({ from: { element: { type: name } }, allow: { to: target(lower) } });
    }
    // Un-sliced and with no public API of their own, so they are reached
    // directly rather than through target().
    for (const extra of extras) {
      policies.push({ from: { element: { type: name } }, allow: { to: { element: { type: extra } } } });
    }
  });
  // A non-layer root sits beside the bottom layer: it may reach that layer and
  // its own kind, and nothing above. Granting it more would let a repo move code
  // out of a layer to escape the layer graph.
  for (const extra of extras) {
    policies.push({ from: { element: { type: extra } }, allow: { to: { element: { type: bottom } } } });
    for (const other of extras) {
      policies.push({ from: { element: { type: extra } }, allow: { to: { element: { type: other } } } });
    }
  }
  return policies;
}

// Units reported by report.mjs. Each line counts a different thing; see report.mjs.
// A variant that switches a constraint off counts zero rather than dropping the
// line: "0" is the fact that the repo answered it away.
export function counts(fsd, profile, opts = {}) {
  const o = { ...DEFAULTS, routingRoot: profile.routingRoot ?? null, ...opts };
  const n = fsd.layers.length;
  const orderedPairs = n * (n - 1);
  const allowedPairs = (n * (n - 1)) / 2;
  return {
    layerDirection: orderedPairs - allowedPairs,
    sliceIsolation: o.sliceCoupling === "isolated" ? fsd.layers.filter((l) => l.sliced).length : 0,
    publicApi: o.publicApi === "enforced" ? fsd.layers.filter((l) => l.publicApiEnforced).length : 0,
    routing: o.routingRoot ? 1 : 0,
  };
}
