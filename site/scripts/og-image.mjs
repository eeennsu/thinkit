#!/usr/bin/env node
// 링크 공유 카드에 쓰이는 1200x630 PNG를 만든다. 레포에 이미지 자산이 없으므로 그리는 대신
// 텍스트로 짓는다 — 워드마크와 한 줄, 그게 전부다.
//
// 커밋하지 않고 빌드마다 만드는 이유는 색과 문구 때문이다. custom.css의 강조색이나 랜딩의
// 태그라인이 바뀌면 커밋된 PNG는 따라오지 않고, 따라오지 않는다는 사실은 아무도 모른다.
// 둘 다 여기서 읽어 쓴다.
//
//   node scripts/og-image.mjs            public/og.png 생성
//   node scripts/og-image.mjs --check    이미 있고 최신인지만 확인 (생성 안 함)
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readThemeColors } from "./theme-colors.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const cssPath = join(siteRoot, "src/styles/custom.css");
const landingPath = join(siteRoot, "src/content/docs/index.mdx");
const outPath = join(siteRoot, "public/og.png");

// 공유 카드는 하나뿐이라 테마를 고를 수 없다. 다크를 쓴다 — 사이트 기본값이 다크다.
const [dark] = readThemeColors(readFileSync(cssPath, "utf8"));
if (dark.missingBlock || !dark.accent || !dark.surface) {
  console.error("og-image: custom.css 의 :root 에서 --thinkit-accent / --thinkit-surface 를 리터럴 색으로 못 읽었다.");
  process.exit(1);
}

// 문구는 랜딩에서 읽는다. 여기 리터럴로 적으면 두 벌이 되고, 두 벌은 랜딩만 고친 날 갈라진다 —
// 그때 카드와 페이지가 다른 말을 하는데 카드는 공유될 때만 보이므로 아무도 모른다.
//
// YAML 파서를 붙이지 않는 이유는 이 한 줄만 필요해서다. 대신 못 찾으면 세운다. 조용히
// 기본값으로 떨어지면 랜딩이 아니라 이 스크립트가 지은 문구가 카드에 나간다.
const landing = readFileSync(landingPath, "utf8");
const frontmatter = landing.match(/^---\r?\n([\s\S]*?)\r?\n---/);
const taglineMatch = frontmatter?.[1].match(/^\s+tagline:\s*(.+?)\s*$/m);
if (!taglineMatch) {
  console.error(`og-image: ${landingPath} 의 frontmatter 에서 hero.tagline 을 못 읽었다.`);
  process.exit(1);
}
// YAML의 따옴표는 값이 아니라 인용 부호다. 그대로 두면 카드에만 따옴표가 찍힌다.
const TAGLINE = taglineMatch[1].replace(/^(["'])([\s\S]*)\1$/, "$2");

// SVG 안에서 웹폰트를 못 쓴다. sharp가 시스템 폰트로 렌더하므로 한글이 있는 줄은 한글을 가진
// 폰트를 지정해야 한다 — 없으면 두부(□)가 나간다. 목록은 fallback이고 첫 번째가 있는 환경에서
// 첫 번째가 쓰인다.
const SANS = "Malgun Gothic, Noto Sans KR, Apple SD Gothic Neo, sans-serif";

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

// SVG의 <text>는 줄을 바꾸지 않는다. 넘치면 잘리는 게 아니라 캔버스 밖으로 그냥 나간다 —
// 미리보기에서만 보이므로 눈으로 보기 전에는 모른다. 그래서 여기서 감싼다.
//
// 폭은 잰 값이 아니라 어림이다. 정확히 재려면 폰트를 열어야 하고, 그러면 이 스크립트가
// 폰트 파일에 매달린다. 한글은 글자 하나가 대략 1em, ASCII는 그 절반으로 본다. 어림이 틀려도
// 어절 단위로만 끊으므로 줄 수가 하나 달라질 뿐 글자가 깨지지는 않는다.
const widthOf = (s, size) => {
  let w = 0;
  for (const ch of s) w += (/[ᄀ-ᇿ가-힣　-ヿ＀-￯]/.test(ch) ? 1 : 0.52) * size;
  return w;
};

const wrap = (text, size, maxWidth) => {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && widthOf(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const MARGIN = 90;
const TAGLINE_SIZE = 40;
const taglineLines = wrap(TAGLINE, TAGLINE_SIZE, 1200 - MARGIN * 2);
const tagline = taglineLines
  .map(
    (line, i) =>
      `<text x="${MARGIN}" y="${380 + i * 56}" font-family="${SANS}" font-size="${TAGLINE_SIZE}" fill="#c8cbd4">${esc(line)}</text>`,
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${dark.surface}"/>
  <text x="${MARGIN}" y="300" font-family="${SANS}" font-size="132" font-weight="700" fill="${dark.accent}">thinkit</text>
  ${tagline}
  <rect x="${MARGIN}" y="${400 + taglineLines.length * 56}" width="120" height="4" fill="${dark.accent}"/>
  <text x="${MARGIN}" y="${470 + taglineLines.length * 56}" font-family="${SANS}" font-size="32" fill="#8b8f9a">thinkit.eunsu.pro</text>
</svg>`;

if (process.argv.includes("--check")) {
  if (!existsSync(outPath)) {
    console.error(`og-image: ${outPath} 가 없다. \`node scripts/og-image.mjs\` 를 먼저 돌린다.`);
    process.exit(1);
  }
  // 재료가 PNG보다 새로우면 색이나 문구가 갈라졌을 수 있다. 조용히 지나가면 갈라진 채로
  // 배포된다. 위에서 읽는 파일은 전부 여기 있어야 한다 — 빠진 파일은 검사받지 않는 재료다.
  const stale = [cssPath, landingPath].find((p) => statSync(p).mtimeMs > statSync(outPath).mtimeMs);
  if (stale) {
    console.error(`og-image: ${relative(siteRoot, stale)} 가 public/og.png 보다 새롭다. 다시 만든다.`);
    process.exit(1);
  }
  console.log("og-image: 최신");
  process.exit(0);
}

mkdirSync(dirname(outPath), { recursive: true });
const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(outPath, png);
console.log(`og-image: ${outPath} (${dark.accent} on ${dark.surface}, ${png.length} bytes)`);
