// 아키텍처 모듈. 레포의 경계 규약이 무엇이고 그것을 무엇이 강제하는지가 사는 자리다.
//
// 슬롯이지 기본값이 아니다. 예전에는 `modules/fsd/layers.json`을 scaffold와 report가
// 각자 경로로 읽었고, 그래서 FSD는 고를 수 있는 답이 아니라 플러그인의 정의였다 —
// 아키텍처만 유일하게 묻지 않고 심어지는 답이었고, 그것은 이 플러그인이 자기에게 금지한
// 바로 그 짓이다. 이제 스택 프로필은 이름 하나를 제시하고, 레포가 답으로 고른다.
//
// 경계를 강제하지 않는 모듈(`none`)도 모듈이다. 그것이 없으면 "경계 규약 없음"은 답이
// 아니라 이 플러그인을 못 쓰는 이유가 된다.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// 답변 파일에서 손으로 오는 값이라 이름을 경로로 신뢰하지 않는다. routingRoot가 레포
// 바깥을 가리킬 수 있었던 것과 같은 부류이고, 여기서는 플러그인 바깥의 아무 디렉터리나
// 모듈로 읽히는 형태가 된다.
const SAFE = /^[a-z0-9][a-z0-9-]*$/;

export function loadModule(root, name) {
  if (typeof name !== "string" || !SAFE.test(name))
    throw new Error(`아키텍처 모듈 이름은 소문자·숫자·하이픈이어야 한다: "${name}". 있는 모듈: ${listModules(root).join(", ")}`);

  const dir = join(root, "modules", name);
  const manifest = join(dir, "module.json");
  if (!existsSync(manifest))
    throw new Error(`모르는 아키텍처 모듈: "${name}". 있는 모듈: ${listModules(root).join(", ")}`);

  const own = JSON.parse(readFileSync(manifest, "utf8"));
  const boundaries = own.boundaries === true;

  // 선언됐는데 없는 경로는 "레이어 그래프 없음"으로 읽지 않고 멈춘다. 인터뷰 오버레이가
  // 같은 대접을 받는 이유와 같다 — 여기서의 침묵은 아무도 보고하지 않은 채 강제를
  // 그만둔 모듈이다.
  let graph = null;
  if (boundaries) {
    if (!own.layers) throw new Error(`모듈 "${name}"이(가) boundaries: true인데 layers를 선언하지 않았다`);
    const layersPath = join(dir, own.layers);
    if (!existsSync(layersPath))
      throw new Error(`모듈 "${name}"이(가) layers: "${own.layers}"를 선언했는데 그 파일이 없다`);
    graph = JSON.parse(readFileSync(layersPath, "utf8"));
    if (!Array.isArray(graph.layers) || !graph.layers.length)
      throw new Error(`모듈 "${name}"의 레이어 그래프에 layers[]가 없다`);
  } else if (own.layers) {
    // 강제하지 않는다고 선언하면서 그래프를 실어 나르는 모듈은, 읽는 사람에게는 경계가
    // 있어 보이고 생성기에게는 없는 것이다.
    throw new Error(`모듈 "${name}"이(가) boundaries: false인데 layers를 선언한다`);
  }

  return {
    name,
    dir,
    summary: own.summary ?? "",
    boundaries,
    graph,
    devDependencies: own.devDependencies ?? {},
  };
}

export function listModules(root) {
  const dir = join(root, "modules");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "module.json")))
    .map((d) => d.name)
    .sort();
}
