// layers.json -> eslint-plugin-boundaries settings + policies.
//
// eslint-plugin-boundaries 7.1.0에 대고 확인함:
//   - 정식 옵션 키는 `policies`다 (`rules`는 폐기된 별칭)
//   - `mode`는 폐기됐다. folder가 기본이고 `mode:"full"`은 이제 `partialMatch:false`다
//   - `{{ from.element.captured.X }}` 템플릿은 작동하지만 FSD에는 필요 없다.
//     슬라이스 격리는 `default: "disallow"`에서 따라 나온다. 각 슬라이스가 자기
//     요소이고 한 요소 안의 import는 검사하지 않기 때문이다
//     (checkInternals 기본값이 false)
//
// 정책 배열 순서: 라우팅 먼저, 그다음 레이어 위에서 아래로. 모든 정책이 `disallow`
// 기본값 위의 `allow`인 동안은 순서가 결과를 바꾸지 않는다(배열을 뒤집어도 결과가
// 같음을 확인했다). 그러니 순서는 결정적 출력을 위해 있다. `disallow` 정책을 언젠가
// 더하면 그것은 맨 끝에 와야 한다. 정책은 순서대로 평가되고 마지막 매칭이 이긴다.
//
// 모든 빌더가 같은, 해석된 `opts`를 받는다. resolveOptions()로 한 번 만들어 셋 다에
// 같은 객체를 넘긴다. elements, policies, counts는 하나의 설정을 서술해야 하고, 자기가
// 세는 설정과 어긋나는 개수는 개수가 없는 것보다 나쁘다.

const trimSlash = (s) => String(s).replace(/\/+$/, "");

const DEFAULTS = { publicApi: "enforced", sliceCoupling: "isolated" };

// 답변 -> 빌더가 받는 옵션 객체. 모르는 값은 기본값으로 떨어지는 대신 throw한다.
// 조용히 엄격한 설정을 만들어내는 오타는 레포의 답으로 보고되기 때문이다.
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
      throw new Error(`모르는 ${name}: "${given}". layers.json이 허용하는 값: ${def.values.join(", ")}`);
    opts[name] = given;
  }

  // 쓰이는 경로이면서 매칭되는 패턴이기도 한 유일한 답변이라, 나머지만큼은 엄격하게
  // 검증한다. 두 방향으로 동시에 실패한다. scaffold가 대상 아래에
  // `<routingRoot>/.gitkeep`을 쓰는데 빠져나가는 값은 설정 중인 레포 바깥에 파일을
  // 놓는다. 같은 값이 boundaries 요소 패턴도 되는데, 프로젝트 바깥으로 뻗는 패턴은
  // 아무것도 매칭하지 않는다 — 맞아 보이면서 0개를 강제하는 설정.
  const given = answers.routingRoot ?? profile.routingRoot ?? null;
  let routingRoot = null;
  if (given !== null) {
    const normalized = String(given).split("\\").join("/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || normalized.split("/").includes(".."))
      throw new Error(`routingRoot는 레포 안에 머무는 레포 상대 경로여야 한다: "${given}"`);
    // "."과 ""는 둘 다 레포 루트를 뜻하고, 그것은 라우팅 디렉터리가 아니라 모든
    // 디렉터리다. boundaries 패턴으로는 뒤에 등록되는 레이어 요소들을 삼키고, 경로로는
    // 레포 루트에 .gitkeep을 쓴다. 아무도 의도하지 않은 답이 조용히 받아들여진 것.
    if (normalized === "" || normalized === ".")
      throw new Error(`routingRoot는 레포 루트가 아니라 디렉터리를 지목해야 한다: "${given}". 라우팅 디렉터리가 없는 스택이면 키를 뺀다.`);
    // 앞의 "./"는 요소 패턴까지 살아남고 거기서 아무것도 매칭하지 않는다. 라우팅
    // 요소는 등록되고 그것을 참조하는 정책도 생성되는데, 라우팅으로 분류되는 파일은
    // 0개다. 맞게 읽히면서 아무것도 강제하지 않는 설정은 이 파일 전체가 맞서 쓰인
    // 실패 양식이므로, 경로를 거부하는 대신 정규화한다.
    routingRoot = normalized;
  }
  opts.routingRoot = routingRoot;

  const names = fsd.layers.map((l) => l.name);
  const routingImports = answers.routingImports ?? fsd.routing.mayImport;
  // 여기서 흔한 실수는 문자열이다 (["app"] 대신 "app"). 이것이 없으면 filter 안에서
  // TypeError로 실패한다 — 답변 형태 오류에 우리 코드를 가리키는 스택 트레이스를 준다.
  if (!Array.isArray(routingImports))
    throw new Error(`routingImports는 레이어 이름의 배열이어야 한다, 받은 타입 ${typeof routingImports}. 레이어: ${names.join(", ")}`);
  const unknown = routingImports.filter((n) => !names.includes(n));
  if (unknown.length)
    throw new Error(`routingImports가 없는 레이어를 지목한다: ${unknown.join(", ")}. 레이어: ${names.join(", ")}`);
  opts.routingImports = routingImports;

  // fsdRoot 아래에서 레이어가 아닌 디렉터리들. 하네스보다 먼저 있던 레포는 전부 몇 개씩
  // 가지고 있고 — src/db, src/data, src/subjects — 그것들을 위한 요소가 등록되어 있지
  // 않으면 `boundaries/no-unknown-dependencies`가 그리로 닿는 모든 import에 걸린다.
  // --max-warnings 0으로 린트를 도는 레포에서 그것은 발견이 아니라 아무도 켤 수 없는
  // 설정이다.
  //
  // 묻지 않고 레포에서 읽는다. 어떤 디렉터리가 있는지는 repo-visible이다. 그것들이
  // 무엇을 뜻하는지는 아니므로, 가장 적게 틀릴 수 있는 자리에 둔다 — 맨 아래, 무엇이든
  // 그것을 import할 수 있고, 그것은 맨 아래 레이어와 서로만 import한다. 그것이 `shared`가
  // 이미 가진 위치이고, 레이어 그래프가 이미 주지 않은 권한을 더하지 않는 유일한 자리다.
  const extraRoots = answers.extraRoots ?? [];
  if (!Array.isArray(extraRoots))
    throw new Error(`extraRoots는 디렉터리 이름의 배열이어야 한다, 받은 타입 ${typeof extraRoots}`);
  const collides = extraRoots.filter((n) => names.includes(n));
  if (collides.length)
    throw new Error(`extraRoots가 이미 요소를 가진 레이어를 지목한다: ${collides.join(", ")}`);
  opts.extraRoots = extraRoots.map(trimSlash);

  return opts;
}

export function buildElements(fsd, profile, opts = {}) {
  const o = { ...DEFAULTS, routingRoot: profile.routingRoot ?? null, ...opts };
  const root = trimSlash(profile.fsdRoot);
  const elements = [];
  // 일부러 먼저 등록한다. 아니면 fsdRoot 안의 routingRoot(src/navigators/)가 먼저
  // 닿는 레이어 패턴에 삼켜진다.
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
  // 레이어 뒤에 둔다. 레이어가 아닌 루트는 레이어 패턴과 절대 충돌하지 않으므로
  // (충돌할 이름은 resolveOptions가 거부한다) 순서는 읽기 편하라고 있는 것이다.
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
    // 레이어별 플래그는 어떤 레이어가 애초에 public API를 가지는지 말하고, 변형은
    // 그것이 강제되는지 말한다. 둘 다 참이어야 한다. 그래야 "open"으로 답하는 것이
    // 그런 걸 가진 적 없는 레이어를 검사 대상 요소로 만들지 않는다.
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
    // 형제 슬라이스는 별개 요소라서 disallow 기본값이 이미 막는다. 허용하려면 명시적인
    // 자기 허용이 필요하다. 그것도 target()을 거친다. 아니면 "same-layer"가
    // "enforced"가 다른 모든 호출자에게 막는 깊은 import를 형제에게 조용히 건네준다.
    if (o.sliceCoupling === "same-layer" && fsd.layers[i].sliced) {
      policies.push({ from: { element: { type: name } }, allow: { to: target(name) } });
    }
    const below = names.slice(i + 1);
    for (const lower of below) {
      policies.push({ from: { element: { type: name } }, allow: { to: target(lower) } });
    }
    // 슬라이스가 없고 자기 public API도 없으므로 target()을 거치지 않고 직접 닿는다.
    for (const extra of extras) {
      policies.push({ from: { element: { type: name } }, allow: { to: { element: { type: extra } } } });
    }
  });
  // 레이어가 아닌 루트는 맨 아래 레이어 옆에 앉는다. 그 레이어와 같은 종류에만 닿고
  // 위로는 못 간다. 더 주면 레포가 레이어 그래프를 빠져나가려고 코드를 레이어 밖으로
  // 옮기게 된다.
  for (const extra of extras) {
    policies.push({ from: { element: { type: extra } }, allow: { to: { element: { type: bottom } } } });
    for (const other of extras) {
      policies.push({ from: { element: { type: extra } }, allow: { to: { element: { type: other } } } });
    }
  }
  return policies;
}

// report.mjs가 보고하는 단위. 각 줄은 서로 다른 것을 센다. report.mjs를 보라.
// 제약을 끄는 변형은 줄을 없애는 대신 0으로 센다. "0"은 레포가 그것을 답으로 치워버렸다는
// 사실이다.
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
