// 우리가 쓴 설정이 그 도구가 실제로 읽는 설정인가.
//
// scaffold는 정확한 경로로 소유를 정한다. `eslint.config.mjs`를 쓰고, 그 경로에 아무것도
// 없는 것을 보고, 그 파일을 우리 것으로 기록한다. 도구는 이름의 *가족* 위 우선순위로
// 효력을 정한다. ESLint는 eslint.config.js / .mjs / .cjs 중 존재하는 첫 번째를 집고
// 나머지는 보지 않는다. Prettier는 package.json#prettier와 .prettierrc를
// prettier.config.mjs보다 위에 둔다.
//
// 그래서 이미 `eslint.config.js`가 있던 레포에서는 두 진술이 동시에 참이다. 생성된
// 파일은 우리 것이고, 아무것도 그것을 로드하지 않는다. report.mjs는 첫 번째 사실만으로
// 경계 개수를 출력하곤 했고, 그래서 효력 있는 규칙이 0개인 레포가 25개가 강제된다는
// 말을 들었다.
//
// "이 경로가 비어 있다"는 "이 관심사에 소유자가 없다"가 아니다.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// 우선순위가 높은 것부터. 출처는 도구 자신의 해석 순서이지 취향이 아니다. 이것을 다시
// 정렬하면 보고서가 레포에 대해 주장하는 내용이 바뀐다.
const FAMILIES = {
  // https://eslint.org/docs/latest/use/configure/configuration-files
  eslint: ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts", "eslint.config.cts"],
  // https://prettier.io/docs/configuration
  prettier: [
    "package.json#prettier",
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.yml",
    ".prettierrc.yaml",
    ".prettierrc.json5",
    ".prettierrc.js",
    "prettier.config.js",
    ".prettierrc.mjs",
    "prettier.config.mjs",
    ".prettierrc.cjs",
    "prettier.config.cjs",
    ".prettierrc.toml",
  ],
};

export function familyOf(rel) {
  for (const [name, members] of Object.entries(FAMILIES)) if (members.includes(rel)) return name;
  return null;
}

function present(target, member) {
  if (member === "package.json#prettier") {
    const p = join(target, "package.json");
    if (!existsSync(p)) return false;
    try {
      return JSON.parse(readFileSync(p, "utf8")).prettier !== undefined;
    } catch {
      // npm이 읽을 수 없는 package.json은 prettier 설정도 아니다.
      return false;
    }
  }
  return existsSync(join(target, member));
}

// 우선순위 경쟁에서 지는 것과 쓰이지 않는 것은 다르다. 레포는 자기 진입 설정을 지키고
// 우리 것을 거기 펼쳐 넣으라는 말을 듣는다. 정확히 그렇게 한 레포는 조회에서 이기면서
// *그리고* 생성된 정책을 import하는 eslint.config.js를 가진다. 그것을 가려졌다고
// 보고하면 올바르게 연결된 하네스를 죽었다고 부르는 것이고, 그건 이 파일이 막으려는
// 개수 부풀리기와 방향만 반대인 같은 종류의 오류다.
//
// 판정은 이긴 파일 안에 우리 파일명 중 하나가 언급되는지다. 텍스트 매칭이라 런타임에
// 조립되는 경로는 놓친다. 그 경우 가려졌다고 보고하는 쪽으로 틀리고, 그것이 안전한
// 방향이다.
function referencesOurs(target, winner, ourFiles) {
  if (winner === "package.json#prettier") return false;
  let text;
  try {
    text = readFileSync(join(target, winner), "utf8");
  } catch {
    return false;
  }
  return ourFiles.some((f) => f && text.includes(f));
}

// { shadowed, winner, via, family }. 관심사에 알려진 가족이 없으면 `shadowed`는
// false다 — 공개된 순서가 그렇다고 말하는 곳에서만 우선순위를 주장한다. 추측한 순서는
// 아무 이유 없이 개수를 움직이기 때문이다.
//
// `ourFiles`는 이 하네스가 그 관심사를 위해 생성한 모든 파일을 지목한다. 묻고 있는 것
// 하나가 아니다. 우선순위가 매기는 것은 진입 설정이고, 레포가 실제로 펼쳐 넣는 파일은
// 그 옆에 있는 것이다.
export function shadowed(target, rel, ourFiles = [rel]) {
  const family = familyOf(rel);
  if (!family) return { shadowed: false, winner: null, via: null, family: null };
  const members = FAMILIES[family];
  const ourRank = members.indexOf(rel);
  for (let i = 0; i < ourRank; i++) {
    if (!present(target, members[i])) continue;
    const winner = members[i];
    return referencesOurs(target, winner, ourFiles)
      ? { shadowed: false, winner, via: winner, family }
      : { shadowed: true, winner, via: null, family };
  }
  return { shadowed: false, winner: present(target, rel) ? rel : null, via: null, family };
}
