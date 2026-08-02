import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// 병합 규칙, 일부러 고정했다.
//   스칼라  -> 자식이 부모를 덮어쓴다
//   배열    -> 자식이 부모를 교체한다 (절대 병합하지 않는다. 병합된 배열은 어느 파일을
//             읽어도 예측할 수 없는 설정을 만든다)
//   객체    -> 얕은 병합, 한 단계
//   extends -> 한 단계만
function merge(parent, child) {
  const out = { ...parent };
  for (const [k, v] of Object.entries(child)) {
    if (k === "extends" || k === "abstract") continue;
    if (v && typeof v === "object" && !Array.isArray(v) && parent[k] && typeof parent[k] === "object" && !Array.isArray(parent[k])) {
      out[k] = { ...parent[k], ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function loadProfile(root, stack) {
  const path = join(root, "stacks", stack, "profile.json");
  if (!existsSync(path)) throw new Error(`모르는 스택: ${stack}`);
  const own = JSON.parse(readFileSync(path, "utf8"));
  if (own.abstract) throw new Error(`스택 "${stack}"은(는) abstract라서 직접 쓸 수 없다`);
  if (!own.extends) return own;
  const parentPath = join(root, "stacks", own.extends, "profile.json");
  const parent = JSON.parse(readFileSync(parentPath, "utf8"));
  if (parent.extends) throw new Error("extends는 한 단계만 된다");
  return merge(parent, own);
}

// 스택의 인터뷰 오버레이, 없으면 null.
//
// 경로는 디렉터리 이름에서 가정하지 않고 프로필에서 읽는다. 오버레이가 존재한다고
// 선언하는 것이 프로필이기 때문이다. 아무도 읽지 않는 관례는 배선이 아니다. 그것은
// `questions`를 어느 스택이든 아무 값이나 넣어도 아무 효과가 없는 필드로 만들었고,
// 스택이 선언하기를 잊은 오버레이도 어차피 로드되게 만들었다.
//
// 해석된 절대 경로를 반환한다. 선언됐는데 디스크에 없는 경로는 부재한 오버레이가 아니라
// 오류다. 거기서의 침묵은 아무도 보고하지 않은 채 안 묻게 된 질문 집합이다.
export function questionsPath(root, stack) {
  const profile = loadProfile(root, stack);
  if (!profile.questions) return null;
  const abs = join(root, profile.questions);
  if (!existsSync(abs))
    throw new Error(`스택 "${stack}"이(가) questions: "${profile.questions}"를 선언했는데 그 파일이 없다`);
  return abs;
}

// abstract 프로필은 제외한다. 확장되기 위해 존재하고, 선택지로 제시하면 loadProfile이
// 곧바로 거부하는 실행을 만들어낸다.
export function listStacks(root) {
  return readdirSync(join(root, "stacks"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !JSON.parse(readFileSync(join(root, "stacks", name, "profile.json"), "utf8")).abstract);
}
