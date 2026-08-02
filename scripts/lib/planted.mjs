import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

// 대상 레포에서 이 플러그인이 쓴 그대로 남아 있는 파일들.
//
// 기록됨-그리고-안 바뀜은 기록됨보다 좁은 것이다. 레포가 그 뒤 편집한 설정은 매니페스트가
// 누가 만들었다고 말하든 이제 레포의 답이다. 자기 출력을 레포의 입력으로 되읽으면 안 되는
// 호출자가 둘을 구별하는 데 이것을 쓴다.
export function ownedUnchanged(target, manifest) {
  const out = new Set();
  for (const f of manifest?.files ?? []) {
    const abs = join(target, f.path);
    if (existsSync(abs) && sha(readFileSync(abs)) === f.sha256) out.add(f.path);
  }
  return out;
}

// 이 플러그인이 대상 레포에 심는 파일들과 그 내용.
//
// 소유자는 하나다. scaffold.mjs가 bootstrap 때 쓰고 check.mjs --fix가 낡은 것을
// 갱신한다. 각자 이 목록의 사본을 따로 만들면 어긋나고, 플러그인과 어긋나는 심어진
// 파일은 이 레포가 다른 레포에서 감사하는 바로 그 실패다.
//
// `principle` 축만 심는다. 캘리브레이션 항목은 모델 세대 위의 위치이고, 남의 레포로
// 복사된 값은 세대가 움직이는 순간 낡는다.
// 대상 레포 매니페스트에 기록되는 버전이자, 거기서 `current`와 `outdated`를 가르는
// 유일한 것. 심어진 내용의 해시이지 rules.json 자신의 버전 번호가 아니다. 심어지는 것의
// 절반은 check.mjs이고, 그 동작은 규칙 집합이 소유한 버전이 서술하지 않는다. 규칙 버전
// 하나로만 키를 잡으면 체커의 모든 수정이 옛것을 이미 지닌 모든 레포에 `current`로
// 출고됐다.
//
// 규칙 버전은 접두어에 남겨서 값을 한눈에 읽을 수 있게 하고, 규칙 변경만으로도 값이
// 움직이게 한다.
export function plantedFiles(root) {
  const rules = JSON.parse(readFileSync(join(root, "principles/rules.json"), "utf8"));
  const principles = {
    version: rules.version,
    note: rules.note,
    items: rules.items.filter((i) => i.axis === "principle"),
  };
  const files = [
    { path: ".claude/harness/check.mjs", content: readFileSync(join(root, "scripts/check.mjs"), "utf8") },
    { path: ".claude/harness/rules.principles.json", content: JSON.stringify(principles, null, 2) + "\n" },
  ];
  const digest = sha(Buffer.from(files.map((f) => `${f.path}\n${f.content}`).join("\n"), "utf8"));
  return { version: `${rules.version}-${digest}`, files };
}
