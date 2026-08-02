// The alias table, read from the target repo when it has one.
//
// Bootstrap generates an alias table for a repo that has none. A repo that
// already resolves imports has the real table on disk, and generating a second
// one produces a config that reports every existing import as unresolved --
// `boundaries/no-unknown-dependencies` is on, so that failure is loud and total.
// This is repo-visible information, so it is read, never invented.
//
// babel.config.js is executed, not pattern-matched: it is a module, commonly a
// function of `api`, and a regex over it reads whichever alias block appears
// first rather than the one that applies.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonc } from "./jsonc.mjs";

// Enough of babel's api object for a config to evaluate. A config that reaches
// for more than this throws, and the caller falls through to the next source.
const stubApi = () => {
  const cache = () => {};
  cache.forever = () => {};
  cache.never = () => {};
  cache.using = (f) => f?.();
  cache.invalidate = (f) => f?.();
  return {
    cache,
    env: () => false,
    caller: () => undefined,
    assertVersion: () => {},
    version: "7",
  };
};

function fromBabel(config) {
  const plugins = Array.isArray(config?.plugins) ? config.plugins : [];
  for (const p of plugins) {
    if (!Array.isArray(p) || p[0] !== "module-resolver") continue;
    const alias = p[1]?.alias;
    if (alias && typeof alias === "object") {
      // Stored the way profile.alias is: no leading "./", no trailing slash.
      return Object.fromEntries(
        Object.entries(alias).map(([k, v]) => [k, String(v).replace(/^\.\//, "").replace(/\/+$/, "")])
      );
    }
  }
  return null;
}

// tsconfig paths are per-pattern ("@/*": ["src/*"]). The alias table is
// per-prefix, so only the "/*" form maps back; a single-file path has no
// prefix to strip and is kept whole.
function fromTsconfig(raw) {
  // JSONC, and the comment form that broke this was not `//` but the
  // `/* Bundler mode */` banner every Vite-derived tsconfig ships with. See
  // lib/jsonc.mjs for why the stripping has to be string-aware.
  const parsed = parseJsonc(raw);
  if (!parsed) return null;
  const paths = parsed?.compilerOptions?.paths;
  if (!paths || typeof paths !== "object") return null;
  const out = {};
  for (const [pattern, targets] of Object.entries(paths)) {
    const to = Array.isArray(targets) ? targets[0] : targets;
    if (typeof to !== "string") continue;
    out[pattern.replace(/\/\*$/, "")] = to.replace(/^\.\//, "").replace(/\/\*$/, "");
  }
  return Object.keys(out).length ? out : null;
}

// Returns { alias, source }. `source` is reported, because "15 aliases" means
// something different when it came from the repo than when we wrote it.
//
// `ours` names the configs that are still byte-for-byte what this plugin wrote.
// They are skipped, and that is the whole point of the parameter: after the
// first run our own generated tsconfig.json is sitting in the target, and
// reading it back turned "we generated this table from the profile" into "the
// repo already had this table". The report said so, the manifest recorded it,
// and a second run produced a different manifest than the first from identical
// inputs. A config the repo has since edited is no longer in the set, so an
// edited table is read -- which is correct, because by then it is theirs.
export async function readAlias(target, profile, ours = new Set()) {
  const babelPath = join(target, "babel.config.js");
  if (existsSync(babelPath) && !ours.has("babel.config.js")) {
    try {
      const mod = await import(pathToFileURL(babelPath).href);
      const exported = mod.default ?? mod;
      const config = typeof exported === "function" ? exported(stubApi()) : exported;
      const alias = fromBabel(config);
      if (alias) return { alias, source: "babel.config.js" };
    } catch {
      /* unreadable config: fall through rather than guess at its contents */
    }
  }

  const tsconfigPath = join(target, "tsconfig.json");
  if (existsSync(tsconfigPath) && !ours.has("tsconfig.json")) {
    const alias = fromTsconfig(readFileSync(tsconfigPath, "utf8"));
    if (alias) return { alias, source: "tsconfig.json" };
  }

  return { alias: profile.alias ?? {}, source: "profile" };
}
