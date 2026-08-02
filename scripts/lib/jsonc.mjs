// tsconfig.json is JSONC, and stripping its comments with a regex corrupts the
// one field this repo reads it for.
//
//   "@app/*": ["src/app/*"]
//
// A non-greedy /\/\*[\s\S]*?\*\// starts matching at the `/*` inside "@app/*"
// and ends at the first `*/` after it, deleting the middle of the paths block
// and leaving `"@app*.js"` behind. JSON.parse then fails on a file that was
// never malformed, and the caller reports the failure as the repo's: zero
// strict flags, zero aliases, or a silent fall back to the profile table.
//
// Every tsconfig with path aliases has that shape, so the regex form is wrong
// for the common case rather than an edge one. The scanner below tracks string
// state, which is the whole difference.
export function stripJsonc(raw) {
  let out = "";
  let i = 0;
  const n = raw.length;
  while (i < n) {
    const c = raw[i];
    if (c === '"') {
      // Copy the string whole. Escapes are honoured so that a `\"` does not
      // read as the closing quote and hand the rest of the file to the
      // comment scanner.
      out += c;
      i++;
      while (i < n) {
        out += raw[i];
        if (raw[i] === "\\") {
          if (i + 1 < n) out += raw[++i];
          i++;
          continue;
        }
        if (raw[i] === '"') { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "/" && raw[i + 1] === "/") {
      while (i < n && raw[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && raw[i + 1] === "*") {
      const end = raw.indexOf("*/", i + 2);
      // An unterminated block comment is a broken file, not a reason to keep
      // its opener: dropping the tail lets JSON.parse report where it ends.
      i = end === -1 ? n : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  // Trailing commas are legal in JSONC and fatal to JSON.parse. Run this last:
  // before the comments are gone, `[1, /* c */]` still has content between the
  // comma and the bracket.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

// Returns the parsed value, or null when the file is genuinely unreadable.
// Callers treat null as "this file told us nothing" -- which is only true now
// that a well-formed tsconfig no longer lands here.
export function parseJsonc(raw) {
  try {
    return JSON.parse(stripJsonc(raw));
  } catch {
    return null;
  }
}
