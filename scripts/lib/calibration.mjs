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
  const resolved = { _selected: {}, _values: {}, _origin: {} };
  for (const [axis, spec] of Object.entries(index.axes)) {
    const pick = spec.default;
    const file = spec.files[pick];
    if (!file) throw new Error(`${axis}=${pick}에 대한 캘리브레이션 파일이 없다`);
    resolved._selected[axis] = pick;
    // 축들의 값은 한 네임스페이스로 평탄해진다. 예전에는 Object.assign 하나였고, 두 축이
    // 같은 키를 쓰면 뒤에 도는 축이 앞엣것을 조용히 덮었다 — 규칙은 자기가 이름을 댄 값
    // 대신 다른 축의 값을 읽고, 그래도 판정은 나온다. "새 세대는 파일 하나를 더한다"가
    // 문서화된 대응인데 그 파일이 이름 하나만 겹치면 그렇게 된다.
    //
    // 던지는 이유는 이것이 대상 레포에 대한 발견이 아니라 우리 설정의 결함이기 때문이다.
    // 발견으로 내리면 남의 레포 보고서에 우리 파일 이야기가 실린다.
    for (const [key, entry] of Object.entries(parseValueBlock(readFileSync(join(root, file), "utf8")).values)) {
      const prior = resolved._origin[key];
      if (prior)
        throw new Error(
          `캘리브레이션 키 "${key}"가 축 둘에서 온다: ${prior.axis}=${prior.generation} (${prior.file})와 ` +
            `${axis}=${pick} (${file}). 값은 한 네임스페이스로 평탄해지므로 뒤엣것이 앞엣것을 덮는다. 한쪽 이름을 바꾼다.`,
        );
      assertKeyReferences(key, entry, file);
      resolved._origin[key] = { axis, generation: pick, file };
      resolved._values[key] = entry;
    }
  }
  return resolved;
}

// `value`의 키 이름을 다시 부르는 동반 필드들. `wide_axes`는 그중 어느 축이 넓게 도는지를
// 고르고, `labels`는 그 키들의 표시명을 댄다. 멤버십과 이름의 소유자는 `value`이고 이
// 필드들은 가리키기만 한다.
//
// 검증하는 이유는 갈라짐이 조용하기 때문이다. `narration`을 `low`로 되돌리면서 `wide_axes`에서
// 빼는 것을 잊으면, 감사는 나레이션이 더는 넓게 돌지 않는 세대에서 나레이션 지시가 비었다고
// 계속 묻는다 — 이 플러그인이 남의 레포에서 지적하는 실패(모델이 이미 하는 일을 지시)를
// 우리가 유발한다. 오타는 이름이 `value`에 없는 것으로 드러나고, 이름이 `value`에 있는 한
// 목록은 `value`와 같은 파일 같은 항목에서 함께 움직인다.
//
// 던지는 이유는 축 간 키 충돌과 같다. 이것은 대상 레포에 대한 발견이 아니라 우리 설정의
// 결함이고, 발견으로 내리면 남의 레포 보고서에 우리 파일 이야기가 실린다.
function assertKeyReferences(key, entry, file) {
  const valueKeys =
    entry.value && typeof entry.value === "object" && !Array.isArray(entry.value) ? Object.keys(entry.value) : [];
  const named = [
    ...(Array.isArray(entry.wide_axes) ? entry.wide_axes.map((n) => ["wide_axes", n]) : []),
    ...(entry.labels && typeof entry.labels === "object" ? Object.keys(entry.labels).map((n) => ["labels", n]) : []),
  ];
  for (const [field, name] of named) {
    if (!valueKeys.includes(name))
      throw new Error(
        `캘리브레이션 "${key}"의 ${field}가 "${name}"을(를) 부르는데 그 항목의 value에 그런 키가 없다 (${file}). ` +
          `이 필드들은 value의 키를 가리키기만 한다. value를 고치면서 여기를 빠뜨렸거나 이름이 틀렸다.`,
      );
  }
}

// 값이 없거나 1차 소스가 없으면 unset이다. 호출자는 대체값을 추측하면 안 된다.
// rules.json이 탈락시킬지 물을지를 말한다.
//
// 세 상태를 구별한다. 예전엔 셋이 한 문장("선택된 캘리브레이션에 없다")으로 나갔는데,
// 이 문장은 `on_unset` 처치를 통해 소유자가 직접 읽는 발견 메시지가 된다 — 항목이 파일에
// 멀쩡히 있는데 "없다"고 적힌 보고서를 받은 사람은 파일을 열어보고 혼란에 빠진다.
export function get(cal, key) {
  const entry = cal._values[key];
  if (!entry) return { set: false, reason: `선택된 캘리브레이션에 "${key}" 항목이 없다` };
  if (entry.value === null || entry.value === undefined)
    return { set: false, reason: entry.unset_reason ?? "값이 비어 있는데 unset_reason이 적혀 있지 않다" };
  if (!entry.source) return { set: false, reason: "값은 있는데 1차 소스 인용이 없다" };
  return { set: true, ...entry };
}
