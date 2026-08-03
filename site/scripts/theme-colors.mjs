// custom.css 의 색 규약이 사는 유일한 자리. `:root` 가 다크, `:root[data-theme="light"]` 가
// 라이트이고, 각 블록의 --thinkit-accent 와 --thinkit-surface 가 전경/배경 쌍이다.
//
// 대비 검사(verify-links --contrast)와 OG 이미지 생성(og-image.mjs)이 둘 다 여기서 읽는다.
// 정규식을 두 곳에 적으면 색을 바꿨을 때 한쪽만 따라오고, 그때 갈라진 쪽은 아무도 안 본다.
// 값 자체는 여전히 custom.css 에만 산다 — 여기 있는 것은 읽는 법이다.

const THEMES = [
  { name: "dark", selector: /:root\s*\{([\s\S]*?)\}/ },
  { name: "light", selector: /:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/ },
];

/**
 * @param {string} css  custom.css 원문
 * @returns {{name: string, accent?: string, surface?: string, missingBlock?: boolean}[]}
 *   블록이 없으면 missingBlock, 값이 var() 로 미뤄져 있으면 accent/surface 가 undefined.
 *   못 읽은 것을 기본값으로 메우지 않는다 — 그러면 검사가 조용히 사라진다.
 */
export function readThemeColors(css) {
  return THEMES.map((theme) => {
    const block = css.match(theme.selector);
    if (!block) return { name: theme.name, missingBlock: true };
    const read = (name) =>
      block[1].match(new RegExp(`--thinkit-${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`))?.[1];
    return { name: theme.name, accent: read("accent"), surface: read("surface") };
  });
}
