import { readFileSync } from "node:fs";
import { join } from "node:path";

function parseValueBlock(md) {
  const m = md.match(/```json\n([\s\S]*?)\n```/);
  if (!m) throw new Error("캘리브레이션 파일에 ```json 값 블록이 없다");
  return JSON.parse(m[1]);
}

// 축마다 선택된 세대는 index.json의 `default`에서 오고, 오직 거기서만 온다. 예전에는
// 아무 호출자도 넘기지 않는 `overrides` 매개변수가 있었다. index.json이 문서화하는
// 방식("축마다 파일을 하나 더하고 default를 그것으로 가리킨다")과 모순되면서 아무것도
// 닿을 수 없는 두 번째 선택 기제였다. 고르는 방법이 둘인데 하나가 닿을 수 없는 것은
// 하나뿐인 것보다 나쁘다.
export function loadCalibration(root) {
  const index = JSON.parse(readFileSync(join(root, "calibration", "index.json"), "utf8"));
  const resolved = { _selected: {}, _values: {} };
  for (const [axis, spec] of Object.entries(index.axes)) {
    const pick = spec.default;
    const file = spec.files[pick];
    if (!file) throw new Error(`${axis}=${pick}에 대한 캘리브레이션 파일이 없다`);
    resolved._selected[axis] = pick;
    Object.assign(resolved._values, parseValueBlock(readFileSync(join(root, file), "utf8")).values);
  }
  return resolved;
}

// 값이 없거나 1차 소스가 없으면 unset이다. 호출자는 대체값을 추측하면 안 된다.
// rules.json이 탈락시킬지 물을지를 말한다.
export function get(cal, key) {
  const entry = cal._values[key];
  if (!entry || entry.value === null || entry.value === undefined || !entry.source) {
    return { set: false, reason: entry?.unset_reason ?? "선택된 캘리브레이션에 없다" };
  }
  return { set: true, ...entry };
}
