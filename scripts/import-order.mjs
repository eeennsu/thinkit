// layers.json + alias 테이블 -> 포매터의 import 순서.
//
// 경계 정책과 같은 소유자. 린트 규칙은 어떤 import가 합법인지 정하고, 이쪽은 합법인
// 것이 어디에 쓰이는지 정한다. 손으로 관리하면 둘이 어긋나고, 포매터 쪽 사본은 조용히
// 어긋난다. import 블록이 레이어 그래프와 안 맞게 된 파일을 아무도 보고하지 않고,
// 그냥 그래프로 읽히지 않게 될 뿐이다.
//
// @ianvs/prettier-plugin-sort-imports 4.7.1에 대고 확인함:
//   - 항목은 정규식 문자열이고 순서대로 매칭되며 첫 매칭이 이긴다
//   - ""는 패턴이 아니라 빈 줄 구분자다
//   - <BUILTIN_MODULES>와 <THIRD_PARTY_MODULES>가 문서화된 자리표시자다.
//     어느 항목에도 매칭되지 않는 것은 third-party로 간다
//   - 부수효과만 있는 import(`import './wdyr'`)는 기본적으로 정렬 불가 장벽이고 다른
//     import가 그것을 넘어갈 수 없다. 그래서 @trivago 설정이 목록 맨 위에 필요로 하는
//     항목은 여기서 생성하지 않고 레포에 묻지도 않는다. 플러그인이 이미 지니고 있다.
//
// @trivago가 아니라 @ianvs 포크다. @trivago는 prettier-2 시절 것이고 모든 프로필이
// prettier ^3을 고정한다.

const trimSlash = (s) => String(s).replace(/\/+$/, "");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// singleQuote: true로 쓰인 설정 파일을 위한 JS 문자열 리터럴. JSON.stringify 대신
// 직접 만드는 이유는 따옴표가 그 파일 자신의 규칙과 맞아야 하기 때문이다. escapeRe가
// 내보내는 백슬래시는 두 번째 층을 살아남아야 한다.
const jsString = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

// alias 값은 profile.alias가 저장하는 형태로 저장된다. 앞의 "./" 없고 뒤의 슬래시 없음.
// 자기 루트를 alias하는 레포는 "."을 쓴다 — ""로 정규화해서 "전부를 덮는다"가 두 경우가
// 아니라 한 경우가 되게 한다.
const aliasTarget = (value) => {
  const to = trimSlash(value);
  return to === "." ? "" : to;
};

// 디렉터리 -> 그것의 import가 실제로 어떻게 쓰이는지 매칭하는 정규식.
//
// alias 테이블에서 그 디렉터리를 가장 구체적으로 덮는 항목을 찾는다. 테이블에
// `@screens -> src/screens`가 있으면 패턴은 `^@screens/(.*)$`이고, `@ -> src`만 있으면
// `^@/screens/(.*)$`이다. 둘 다 실제 경우다. 대상 레포가 테이블을 가지고 있으면 거기서
// 읽으므로, bootstrap이 생성했을 형태를 가정할 수 없다.
//
// 어떤 alias도 덮지 않는 디렉터리는 자기 경로로 떨어진다. 그것은 baseUrl로 import하는
// 레포와 맞고, 둘 다 아닌 레포에서는 그냥 아무것도 매칭하지 않는다 — 매칭되지 않는
// 그룹은 안 쓰이는 항목 하나를 치를 뿐 틀린 항목은 아니다.
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

// 자기 그룹을 받는 디렉터리들, 쓰이는 순서대로. 라우팅 먼저, 그다음 레이어 위에서
// 아래로 — buildElements()가 등록하는 것과 같은 순서라서, import 블록이 정책이 허용하는
// 방향으로 읽힌다.
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

  // fsdRoot의 나머지를 위한 포괄 항목. 레이어 패턴이 이기도록 모든 레이어 뒤에 둔다.
  // 이것이 없으면 소스 루트 안에 있으면서 레이어 안에는 없는 파일 — `@/config`,
  // `@/app.tsx` — 이 어느 항목에도 매칭되지 않고 패키지 옆 third-party로 분류된다.
  // FSD는 그런 파일이 없어야 한다고 말하지만, 실제 레포에는 몇 개씩 있고, 잘못
  // 분류하는 것이 항목 하나 더 있는 것보다 나쁘다.
  const rest = patternFor(trimSlash(profile.fsdRoot), alias);
  if (!order.includes(rest)) order.push(rest, "");

  order.push("^[.]");
  return order;
}

// JSON이 아니라 JS 배열 리터럴로 렌더한다. singleQuote를 설정하는 prettier 설정에
// 쓰이는데, 자기가 설정하는 규칙을 어기는 생성 파일은 읽는 사람이 가장 먼저 믿기를
// 그만두는 것이다.
export function renderImportOrder(order, indent = 4) {
  const pad = " ".repeat(indent);
  return `[\n${order.map((e) => `${pad}${jsString(e)},`).join("\n")}\n${" ".repeat(indent - 2)}]`;
}
