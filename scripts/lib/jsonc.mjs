// tsconfig.json은 JSONC이고, 그 주석을 정규식으로 벗기면 이 레포가 그 파일을 읽는
// 유일한 필드가 망가진다.
//
//   "@app/*": ["src/app/*"]
//
// 비탐욕 /\/\*[\s\S]*?\*\//는 "@app/*" 안의 `/*`에서 매칭을 시작해 그 뒤 첫 `*/`에서
// 끝나면서 paths 블록의 가운데를 지우고 `"@app*.js"`를 남긴다. 그러면 JSON.parse가
// 애초에 깨진 적 없는 파일에서 실패하고, 호출자는 그 실패를 레포의 것으로 보고한다.
// strict 플래그 0개, alias 0개, 또는 프로필 테이블로의 조용한 후퇴.
//
// 경로 alias가 있는 모든 tsconfig가 그 형태이므로, 정규식 방식은 엣지 케이스가 아니라
// 흔한 경우에 틀린다. 아래 스캐너는 문자열 상태를 추적하고, 차이는 그것 전부다.
export function stripJsonc(raw) {
  let out = "";
  let i = 0;
  const n = raw.length;
  while (i < n) {
    const c = raw[i];
    if (c === '"') {
      // 문자열을 통째로 복사한다. 이스케이프를 존중해서 `\"`가 닫는 따옴표로 읽히고
      // 파일의 나머지가 주석 스캐너로 넘어가는 일이 없게 한다.
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
      // 닫히지 않은 블록 주석은 깨진 파일이지 그 여는 기호를 남길 이유가 아니다.
      // 꼬리를 버리면 JSON.parse가 어디서 끝나는지 보고할 수 있다.
      i = end === -1 ? n : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  // 뒤따르는 쉼표는 JSONC에서 합법이고 JSON.parse에는 치명적이다. 이것을 마지막에
  // 돌린다. 주석이 사라지기 전에는 `[1, /* c */]`의 쉼표와 대괄호 사이에 아직 내용이
  // 있다.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

// 파싱된 값을 반환하거나, 파일이 정말 읽을 수 없을 때 null을 반환한다. 호출자는 null을
// "이 파일은 우리에게 아무것도 말해주지 않았다"로 다룬다 — 제대로 된 tsconfig가 더는
// 여기 떨어지지 않게 된 지금에야 그것이 참이다.
export function parseJsonc(raw) {
  try {
    return JSON.parse(stripJsonc(raw));
  } catch {
    return null;
  }
}
