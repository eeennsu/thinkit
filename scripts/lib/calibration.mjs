import { readFileSync } from "node:fs";
import { join } from "node:path";

function parseValueBlock(md) {
  const m = md.match(/```json\n([\s\S]*?)\n```/);
  if (!m) throw new Error("calibration file has no ```json value block");
  return JSON.parse(m[1]);
}

export function loadCalibration(root, overrides = {}) {
  const index = JSON.parse(readFileSync(join(root, "calibration", "index.json"), "utf8"));
  const resolved = { _selected: {}, _values: {} };
  for (const [axis, spec] of Object.entries(index.axes)) {
    const pick = overrides[axis] || spec.default;
    const file = spec.files[pick];
    if (!file) throw new Error(`no calibration file for ${axis}=${pick}`);
    resolved._selected[axis] = pick;
    Object.assign(resolved._values, parseValueBlock(readFileSync(join(root, file), "utf8")).values);
  }
  return resolved;
}

// A value is unset when it has no value or no primary source. Callers must not
// guess a replacement: rules.json says drop or ask.
export function get(cal, key) {
  const entry = cal._values[key];
  if (!entry || entry.value === null || entry.value === undefined || !entry.source) {
    return { set: false, reason: entry?.unset_reason ?? "not present in the selected calibration" };
  }
  return { set: true, ...entry };
}
