#!/usr/bin/env node
// 빌드 산출물을 걸어서 링크·앵커·라우트·UI 계약을 검사한다. 의존성 없이 node로만 돈다 —
// 레포의 tests/verify-*.mjs 관행이고, 검사기가 설치에 매달리면 CI에서 가장 먼저 꺼진다.
//
// dist를 걷는 스크립트는 이것 하나다. 둘로 나누면 기대 라우트 목록이 두 곳에 생기고,
// 두 곳은 갈라진다.
//
//   node scripts/verify-links.mjs                  링크·앵커·라우트·산출물 계약(제목 중복·영어
//                                                  제목·내부 절대 URL·og:image·robots.txt).
//                                                  base가 있으면 접두사까지
//   node scripts/verify-links.mjs --base /x        그 판정을 덮어쓴다 (대조군이 쓰는 자리)
//   node scripts/verify-links.mjs --search 충돌,경계 pagefind 인덱스에 실제 질의
//   node scripts/verify-links.mjs --ui             라벨·자리표시자·인용 permalink·인용 시점·img alt
//   node scripts/verify-links.mjs --ui --contrast  위 + 강조색 대비비 (라이트/다크 각각)
//   node scripts/verify-links.mjs --self-test      일부러 깨뜨린 픽스처에서 exit 1이 나오는지
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { collectRepoFiles } from "../src/loaders/repo-docs.mjs";
import { readThemeColors } from "./theme-colors.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);

// 값을 먹는 플래그가 값 없이 오면 조용히 기본값으로 떨어지면 안 된다. `--base`가 그러면
// base가 빈 문자열이 되고, 그러면 접두사 검사 전체가 꺼진 채로 exit 0이 나온다 —
// 검사했다고 믿는 사람에게 아무것도 검사하지 않은 초록을 주는 것이다.
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) {
    console.error(`[USAGE] --${name} 는 값이 필요하다. 아무것도 검사하지 않았다.`);
    process.exit(2);
  }
  return value;
};

// base는 astro.config.mjs 하나에서 온다. 여기 다시 적으면 배포 경로만 바꿨을 때
// 검사기가 옛 경로를 기준으로 통과시킨다.
function configuredBase() {
  const config = readFileSync(join(siteRoot, "astro.config.mjs"), "utf8");
  const match = config.match(/export const BASE\s*=\s*["'`]([^"'`]*)["'`]/);
  if (!match) throw new Error("verify-links: astro.config.mjs 에서 BASE 를 찾지 못했다.");
  return match[1].replace(/\/+$/, "");
}

// 도메인도 astro.config.mjs 하나에서 온다. 여기 다시 적으면 도메인을 옮긴 날 검사기만
// 옛 도메인을 찾고, 새 도메인으로 박힌 내부 절대 링크를 그냥 통과시킨다.
function configuredSite() {
  const config = readFileSync(join(siteRoot, "astro.config.mjs"), "utf8");
  const match = config.match(/export const SITE\s*=\s*["'`]([^"'`]*)["'`]/);
  if (!match) throw new Error("verify-links: astro.config.mjs 에서 SITE 를 찾지 못했다.");
  return match[1].replace(/\/+$/, "");
}

// 라우트 목록도 로더의 매핑 표에서 파생한다. 손으로 적으면 문서가 하나 늘었을 때
// 검사기만 옛 목록을 들고 초록으로 끝난다.
function expectedRoutes() {
  return ["", ...collectRepoFiles().map((f) => f.id)];
}

// Starlight가 자동 생성한다. 기대 목록에 없다고 미지의 라우트로 걸면 안 되고,
// 예외를 안 적으면 그렇게 걸린다.
const ROUTE_EXCEPTIONS = new Set(["404.html"]);

const LABEL_BEFORE = "Before — 예전 정석";
const LABEL_AFTER = "After — thinkit이 생성한 것";
const PERMALINK = /\/blob\/[0-9a-f]{40}\//;
const CITED_AT = /\b20\d{2}-\d{2}-\d{2}\b/;
// 인용이 있는지부터 본다. Before가 남의 레포 발췌였을 때는 인용이 항상 있었지만, 지금은
// 우리가 쓴 예시라서 없다. 링크가 있을 때만 인용 계약을 적용한다.
const CITE_LINK = /github\.com\/[^\s"'<]+\/blob\//;

// ---------------------------------------------------------------- 수집

function htmlFiles(dist) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith(".html")) out.push(abs);
    }
  };
  walk(dist);
  return out.sort();
}

// id만 센다. `name=`까지 받으면 `<meta name="description">`이 앵커 목록에 들어가고,
// 그 순간 `#description`이 실재하지 않는데도 통과한다.
const idsOf = (html) => {
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]*)"/g)) ids.add(m[1]);
  return ids;
};

const linksOf = (html) => [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1]);

// 한국어 앵커는 인코딩된 채로도 날것으로도 나온다. 잘못된 %는 던지므로 원문으로 돌린다 —
// 여기서 죽으면 링크 하나 때문에 검사 전체가 사라진다.
const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** dist 안의 경로 문자열 -> 실제 파일. 디렉터리 형식 빌드라 후보가 셋이다. */
function resolveTarget(dist, pathname) {
  const clean = pathname.replace(/\/+$/, "");
  const candidates = clean === "" ? ["index.html"] : [`${clean}/index.html`, clean, `${clean}.html`];
  for (const candidate of candidates) {
    const abs = join(dist, candidate);
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }
  return null;
}

// ---------------------------------------------------------------- 검사

function checkLinks(dist, base, { strictBase }) {
  const problems = [];
  const pages = htmlFiles(dist);
  const idCache = new Map();
  const idsFor = (file) => {
    if (!idCache.has(file)) idCache.set(file, idsOf(readFileSync(file, "utf8")));
    return idCache.get(file);
  };

  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const from = relative(dist, page).split("\\").join("/");
    for (const raw of linksOf(html)) {
      const link = raw.trim();
      if (!link) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith("//")) continue;

      const hashAt = link.indexOf("#");
      const rawPath = hashAt >= 0 ? link.slice(0, hashAt) : link;
      const fragment = hashAt >= 0 ? safeDecode(link.slice(hashAt + 1)) : "";

      let target;
      if (rawPath === "") {
        target = page;
      } else if (rawPath.startsWith("/")) {
        const decoded = safeDecode(rawPath.split("?")[0]);
        let pathname = decoded;
        if (base) {
          if (decoded === base || decoded.startsWith(`${base}/`)) {
            pathname = decoded.slice(base.length);
          } else if (strictBase) {
            problems.push({ code: "BASE", message: `${from}: 루트 상대 링크 "${link}" 에 base 접두사 ${base} 가 없다` });
            continue;
          }
        }
        target = resolveTarget(dist, pathname);
      } else {
        const decoded = safeDecode(rawPath.split("?")[0]);
        const abs = resolve(dirname(page), decoded);
        target = resolveTarget(dist, relative(dist, abs).split("\\").join("/"));
      }

      if (!target) {
        problems.push({ code: "LINK", message: `${from}: "${link}" 의 대상이 dist 에 없다` });
        continue;
      }
      if (fragment && !idsFor(target).has(fragment)) {
        problems.push({
          code: "ANCHOR",
          message: `${from}: "${link}" 의 #${fragment} 가 ${relative(dist, target).split("\\").join("/")} 에 없다`,
        });
      }
    }
  }
  return problems;
}

function checkRoutes(dist) {
  const problems = [];
  const expected = expectedRoutes();
  for (const route of expected) {
    if (!resolveTarget(dist, route)) problems.push({ code: "ROUTE", message: `기대 라우트 /${route} 의 html 이 없다` });
  }

  // 반대 방향도 본다. 기대 목록에 없는 페이지가 조용히 배포되면 목록이 사실을 말하지 않는다.
  const expectedFiles = new Set(expected.map((r) => resolveTarget(dist, r)).filter(Boolean));
  for (const page of htmlFiles(dist)) {
    const rel = relative(dist, page).split("\\").join("/");
    if (expectedFiles.has(page)) continue;
    if (ROUTE_EXCEPTIONS.has(rel)) continue;
    problems.push({ code: "ROUTE", message: `기대 목록에 없는 라우트 /${rel} 가 dist 에 있다` });
  }
  return problems;
}

function sampleBlock(html, name) {
  const match = html.match(new RegExp(`<section[^>]*data-sample="${name}"[\\s\\S]*?</section>`));
  return match ? match[0] : null;
}

function checkUi(dist) {
  const problems = [];
  const landing = resolveTarget(dist, "");
  if (!landing) return [{ code: "ROUTE", message: "랜딩 / 의 html 이 없다" }];
  const html = readFileSync(landing, "utf8");

  // U3 — 색이 아니라 텍스트 라벨로 구분한다는 결정이 산출물에도 남아 있어야 한다.
  for (const label of [LABEL_BEFORE, LABEL_AFTER]) {
    if (!html.includes(label)) problems.push({ code: "UI_LABEL", message: `랜딩에 라벨 "${label}" 가 없다` });
  }

  const before = sampleBlock(html, "before");
  if (!before) {
    problems.push({ code: "UI_LABEL", message: '랜딩에 data-sample="before" 블록이 없다' });
  } else if (/class="sample-pending"/.test(before)) {
    // 자리표시자는 인용이 틀린 것이 아니라 Before 자체가 아직 없는 것이다. 예전에는 permalink
    // 검사가 이걸 곁다리로 잡았는데, 인용이 선택이 된 지금은 곁다리가 사라진다. 직접 본다.
    problems.push({
      code: "UI_PENDING",
      message: "Before 블록이 자리표시자다. src/content/samples/before.md 를 채운다",
    });
  } else if (CITE_LINK.test(before)) {
    // U4 U5 — 인용이 있을 때만 적용한다. 지금 Before는 우리가 쓴 예시라 인용이 없지만,
    // 검사를 지우면 다음에 인용을 다시 넣는 사람을 아무도 막지 않는다. blob/main 은 대상
    // 레포가 파일을 고치는 순간 인용이 거짓이 되므로 sha 고정만 통과시킨다.
    if (!PERMALINK.test(before)) {
      problems.push({
        code: "UI_PERMALINK",
        message: "Before 블록이 레포 파일을 인용하는데 blob/<40자 sha>/ 가 아니다 (blob/main 은 통과시키지 않는다)",
      });
    }
    if (!CITED_AT.test(before)) {
      problems.push({ code: "UI_CITED_AT", message: "Before 블록이 인용을 담고 있는데 인용 시점(YYYY-MM-DD) 이 없다" });
    }
  }

  // U7 — 이미지가 0개면 자동 통과다. 빈 alt 는 장식 이미지의 정당한 표기이므로 존재만 본다.
  for (const page of htmlFiles(dist)) {
    const pageHtml = readFileSync(page, "utf8");
    for (const tag of pageHtml.match(/<img\b[^>]*>/g) ?? []) {
      if (!/\salt=/.test(tag)) {
        problems.push({
          code: "UI_IMG_ALT",
          message: `${relative(dist, page).split("\\").join("/")}: alt 없는 <img> — ${tag.slice(0, 80)}`,
        });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------- 산출물 계약
//
// 아래 넷은 전부 dist만 보면 판정된다. 사람이 스크린샷을 봐야 아는 것이 아니라서 여기 있다 —
// 레포 규칙이 "도구로 강제 가능한 건 문서에서 뺀다"이고, 이것들은 한 번 고친 뒤 조용히
// 되돌아오는 종류다.

// 제목이 영어인지 판정하려면 한글이 있는지를 본다. 그런데 두 종류는 한글이 없는 것이 옳다.
// 예외를 안 적으면 이 검사는 옳은 것을 잡느라 꺼지게 된다.
//
//   docs/references/*  아카이브. 제목은 원저자의 것이고 우리가 번역하지 않는다.
//   ""                 랜딩. h1이 워드마크 "thinkit"이다.
//   404                숫자다.
const TITLE_HANGUL_EXEMPT = (route) => route === "" || route === "404" || route.startsWith("docs/references/");
const HANGUL = /[가-힣]/;

const titleOf = (html) => html.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim();
const h1Of = (html) =>
  html
    .match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]
    ?.replace(/<[^>]*>/g, "")
    .trim();

function checkMeta(dist) {
  const problems = [];
  const site = configuredSite();
  const rel = (file) => relative(dist, file).split("\\").join("/");
  const routeOf = (file) => rel(file).replace(/(^|\/)index\.html$/, "").replace(/\.html$/, "");

  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, "utf8");
    const route = routeOf(file);

    // D1 — 문서 제목이 사이트 이름과 같으면 Starlight가 "thinkit | thinkit"을 만든다. 조각을
    // 세는 이유는 사이트 이름을 여기 적지 않기 위해서다. 같은 조각이 두 번이면 무엇이든 중복이다.
    const title = titleOf(html);
    if (!title) {
      problems.push({ code: "META_TITLE", message: `${rel(file)}: <title> 이 없다` });
    } else {
      const parts = title.split("|").map((s) => s.trim()).filter(Boolean);
      const dupe = parts.find((p, i) => parts.indexOf(p) !== i);
      if (dupe) problems.push({ code: "META_TITLE", message: `${rel(file)}: <title> 에 "${dupe}" 가 두 번 — "${title}"` });
    }

    // D2 — 로케일이 한국어 하나뿐인데 우리가 쓴 문서 제목만 영어로 남는 일이 있었다.
    const h1 = h1Of(html);
    if (h1 && !TITLE_HANGUL_EXEMPT(route) && !HANGUL.test(h1)) {
      problems.push({ code: "META_LANG", message: `/${route}: h1 "${h1}" 에 한글이 없다 (아카이브·랜딩·404만 예외)` });
    }

    // D3 — 본문이 자기 사이트를 절대 URL로 가리키면 도메인이 바뀔 때 죽고, 프리뷰에서 누르면
    // 프로덕션으로 튄다. canonical·og:url은 절대여야 하므로 <a> 만 본다.
    for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
      if (m[1].startsWith(site)) {
        problems.push({ code: "META_SELF_URL", message: `${rel(file)}: 내부 링크가 절대 URL이다 — ${m[1]}` });
      }
    }

    // D4 — og:image가 빠지면 공유 카드가 빈 채로 나가고, 그건 공유해 보기 전에는 모른다.
    // 있다고만 보지 않고 가리키는 파일이 dist 안에 실재하는지까지 본다.
    const og = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/)?.[1];
    if (!og) {
      problems.push({ code: "META_OG", message: `${rel(file)}: og:image 가 없다` });
    } else if (!og.startsWith(site)) {
      problems.push({ code: "META_OG", message: `${rel(file)}: og:image 가 절대 URL이 아니다 — ${og}` });
    } else if (!existsSync(join(dist, og.slice(site.length).replace(/^\//, "")))) {
      problems.push({ code: "META_OG", message: `${rel(file)}: og:image 가 가리키는 ${og} 가 dist 에 없다` });
    }
  }

  // D4 — robots.txt. 없으면 크롤러가 sitemap을 스스로 찾아야 한다.
  const robots = join(dist, "robots.txt");
  if (!existsSync(robots)) problems.push({ code: "META_ROBOTS", message: "dist/robots.txt 가 없다" });
  else if (!/^\s*Sitemap:\s*\S+/im.test(readFileSync(robots, "utf8")))
    problems.push({ code: "META_ROBOTS", message: "robots.txt 에 Sitemap: 줄이 없다" });

  return problems;
}

// ---------------------------------------------------------------- 대비비

const srgb = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// 색 규약을 읽는 법은 scripts/theme-colors.mjs 에 있다. OG 이미지 생성도 같은 것을 읽는다.
function checkContrast(cssPath) {
  const problems = [];
  if (!existsSync(cssPath)) return [{ code: "CONTRAST", message: `${cssPath} 가 없다` }];
  const css = readFileSync(cssPath, "utf8");

  for (const theme of readThemeColors(css)) {
    if (theme.missingBlock) {
      problems.push({ code: "CONTRAST", message: `${theme.name} 테마 블록을 찾지 못했다` });
      continue;
    }
    const { accent, surface } = theme;
    if (!accent || !surface) {
      // var() 로 미룬 값은 여기서 볼 것이 없다. 못 읽은 것을 통과로 세면 검사가 사라진다.
      problems.push({
        code: "CONTRAST",
        message: `${theme.name}: --thinkit-accent / --thinkit-surface 가 리터럴 색으로 선언되지 않았다`,
      });
      continue;
    }
    const ratio = contrastRatio(accent, surface);
    const line = `${theme.name}: ${accent} on ${surface} = ${ratio.toFixed(2)}:1`;
    if (ratio < 4.5) problems.push({ code: "CONTRAST", message: `${line} (4.5:1 미달)` });
    else console.log(`  대비 ${line}`);
  }
  return problems;
}

// ---------------------------------------------------------------- 검색

// pagefind.js 는 fetch 로 인덱스를 읽는다. file:// 로는 안 되므로 dist 를 잠깐 띄운다.
// 인덱스를 직접 파싱하지 않는 이유는, 우리가 확인하려는 것이 파일의 존재가 아니라
// 한국어가 실제로 쪼개져 검색되는가이기 때문이다.
async function checkSearch(dist, terms) {
  const problems = [];
  if (!existsSync(join(dist, "pagefind"))) return [{ code: "SEARCH", message: "dist/pagefind 가 없다" }];

  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = join(dist, pathname);
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  try {
    const pagefind = await import(pathToFileURL(join(dist, "pagefind/pagefind.js")).href);
    await pagefind.options({ basePath: `http://127.0.0.1:${port}/pagefind/` });
    for (const term of terms) {
      const { results } = await pagefind.search(term);
      if (results.length < 1) problems.push({ code: "SEARCH", message: `"${term}" 질의 결과가 0건이다` });
      else console.log(`  검색 "${term}" -> ${results.length}건`);
    }
  } finally {
    server.close();
  }
  return problems;
}

// ---------------------------------------------------------------- 대조군

const FIXTURE_LABELS = `<h3 class="sample-label">${LABEL_BEFORE}</h3>`;

// 픽스처는 "온전한 dist"여야 한다. 산출물 계약(제목·h1·og:image)을 빼놓으면 대조군이 그것만으로
// 빨개지고, 그러면 이 파일의 다른 부정 케이스들이 무엇 때문에 빨간지 구분되지 않는다.
const fixturePage = (body, { title = "제목 | thinkit", h1 = "한글 제목" } = {}) =>
  `<!doctype html><html lang="ko"><head><title>${title}</title>` +
  `<meta property="og:image" content="${configuredSite()}/og.png"></head>` +
  `<body>${h1 === null ? "" : `<h1>${h1}</h1>`}${body}</body></html>\n`;

// base를 인자로 받는다. 접두사 대조군은 astro.config가 지금 무엇이든 자기 접두사로
// 픽스처를 세워야 한다 — 배포 경로가 루트로 내려간 순간 그 대조군이 아무것도 안 깨고
// 조용히 통과하면, 접두사 검사가 살아 있는지 아무도 모르게 된다.
function buildFixture(dir, base = configuredBase()) {
  rmSync(dir, { recursive: true, force: true });
  const routes = expectedRoutes();

  for (const route of routes) {
    if (route === "") continue;
    const file = join(dir, route, "index.html");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, fixturePage(`<h2 id="3-지시-충돌이-왜-비용인가">제목</h2><a href="${base}/">홈</a>`), "utf8");
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "index.html"),
    fixturePage(
      `<a href="${base}/docs/canon/#3-지시-충돌이-왜-비용인가">원칙</a>` +
        `<section class="sample" data-sample="before">${FIXTURE_LABELS}` +
        `<p>출처: https://github.com/owner/repo/blob/0123456789abcdef0123456789abcdef01234567/CLAUDE.md</p>` +
        `<p>인용 시점: 2026-08-02</p>` +
        `<img src="${base}/x.png" alt="설명">` +
        `</section>` +
        `<section class="sample" data-sample="after"><h3 class="sample-label">${LABEL_AFTER}</h3></section>`
    ),
    "utf8"
  );
  writeFileSync(join(dir, "x.png"), "", "utf8");
  writeFileSync(join(dir, "404.html"), fixturePage("<p>없다</p>", { title: "404 | thinkit", h1: "404" }), "utf8");
  writeFileSync(join(dir, "og.png"), "", "utf8");
  writeFileSync(join(dir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${configuredSite()}/sitemap-index.xml\n`, "utf8");
  return dir;
}

const patch = (file, from, to) => writeFileSync(file, readFileSync(file, "utf8").replace(from, to), "utf8");

function runSelf(extraArgs, cwd = siteRoot) {
  try {
    const stdout = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...extraArgs], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

async function selfTest() {
  const root = join(tmpdir(), `thinkit-verify-links-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  const base = configuredBase();
  const dist = (name) => join(root, name);

  // 대조군이 먼저다. 부정 케이스만 있으면 전부를 실패시키는 검사기와 구분이 안 된다.
  const cases = [
    { name: "ok", expect: null, args: () => ["--dist", buildFixture(dist("ok")), "--ui"] },
    {
      name: "broken-link",
      expect: "LINK",
      args: () => {
        const d = buildFixture(dist("broken-link"));
        patch(join(d, "index.html"), `${base}/docs/canon/`, `${base}/docs/nope/`);
        return ["--dist", d];
      },
    },
    {
      name: "broken-anchor",
      expect: "ANCHOR",
      args: () => {
        const d = buildFixture(dist("broken-anchor"));
        patch(join(d, "docs/canon/index.html"), 'id="3-지시-충돌이-왜-비용인가"', 'id="다른-제목"');
        return ["--dist", d];
      },
    },
    {
      name: "missing-route",
      expect: "ROUTE",
      args: () => {
        const d = buildFixture(dist("missing-route"));
        rmSync(join(d, "docs/modules"), { recursive: true, force: true });
        return ["--dist", d];
      },
    },
    // 접두사 검사는 자기 접두사를 가진 픽스처로 본다. 온전한 쪽을 먼저 두는 이유는
    // 다른 대조군과 같다 — 부정 케이스만으로는 접두사 모드 전체를 실패시키는 검사기와
    // 구분이 안 된다.
    {
      name: "base-ok",
      expect: null,
      args: () => ["--dist", buildFixture(dist("base-ok"), "/thinkit"), "--base", "/thinkit"],
    },
    {
      name: "missing-base",
      expect: "BASE",
      args: () => {
        const d = buildFixture(dist("missing-base"), "/thinkit");
        patch(join(d, "index.html"), "/thinkit/docs/canon/", "/docs/canon/");
        return ["--dist", d, "--base", "/thinkit"];
      },
    },
    {
      name: "no-label",
      expect: "UI_LABEL",
      args: () => {
        const d = buildFixture(dist("no-label"));
        patch(join(d, "index.html"), LABEL_AFTER, "그 밖의 것");
        return ["--dist", d, "--ui"];
      },
    },
    {
      name: "branch-permalink",
      expect: "UI_PERMALINK",
      args: () => {
        const d = buildFixture(dist("branch-permalink"));
        patch(join(d, "index.html"), /blob\/[0-9a-f]{40}\//, "blob/main/");
        return ["--dist", d, "--ui"];
      },
    },
    {
      name: "no-cited-at",
      expect: "UI_CITED_AT",
      args: () => {
        const d = buildFixture(dist("no-cited-at"));
        patch(join(d, "index.html"), "인용 시점: 2026-08-02", "인용 시점: 언젠가");
        return ["--dist", d, "--ui"];
      },
    },
    {
      // 인용 계약은 조건부다. 인용이 없는 Before가 막히면 자작 샘플을 실을 수 없고,
      // 이 대조군이 없으면 조건부로 바꾼 것이 "항상 통과"와 구분이 안 된다.
      name: "no-citation-ok",
      expect: null,
      args: () => {
        const d = buildFixture(dist("no-citation-ok"));
        patch(join(d, "index.html"), /<p>출처:[^<]*<\/p>/, "");
        patch(join(d, "index.html"), /<p>인용 시점:[^<]*<\/p>/, "");
        return ["--dist", d, "--ui"];
      },
    },
    {
      // 인용이 선택이 된 뒤에도 "Before가 아직 없다"는 계속 잡혀야 한다.
      name: "pending-before",
      expect: "UI_PENDING",
      args: () => {
        const d = buildFixture(dist("pending-before"));
        patch(join(d, "index.html"), /<p>출처:[^<]*<\/p>/, '<p class="sample-pending">아직 없다</p>');
        return ["--dist", d, "--ui"];
      },
    },
    {
      name: "img-without-alt",
      expect: "UI_IMG_ALT",
      args: () => {
        const d = buildFixture(dist("img-without-alt"));
        patch(join(d, "index.html"), ' alt="설명"', "");
        return ["--dist", d, "--ui"];
      },
    },
    {
      // `<meta name="description">` 가 앵커 목록에 섞이면 실재하지 않는 #description 이 통과한다.
      name: "meta-name-is-not-an-anchor",
      expect: "ANCHOR",
      args: () => {
        const d = buildFixture(dist("meta-name-is-not-an-anchor"));
        patch(join(d, "docs/canon/index.html"), "<body>", '<body><meta name="description" content="x">');
        patch(join(d, "index.html"), "#3-지시-충돌이-왜-비용인가", "#description");
        return ["--dist", d];
      },
    },
    {
      // 값 없는 플래그가 조용히 기본값으로 떨어지면 아무것도 검사하지 않은 초록이 나온다.
      name: "base-without-value",
      expect: "USAGE",
      args: () => ["--dist", buildFixture(dist("base-without-value")), "--base"],
    },
    {
      name: "search-without-value",
      expect: "USAGE",
      args: () => ["--dist", buildFixture(dist("search-without-value")), "--search"],
    },
    {
      name: "low-contrast",
      expect: "CONTRAST",
      args: () => {
        const d = buildFixture(dist("low-contrast"));
        const css = join(root, "low-contrast.css");
        writeFileSync(
          css,
          ':root { --thinkit-accent: #3a3f4a; --thinkit-surface: #17181c; }\n' +
            ':root[data-theme="light"] { --thinkit-accent: #1d4ed8; --thinkit-surface: #ffffff; }\n',
          "utf8"
        );
        return ["--dist", d, "--ui", "--contrast", "--css", css];
      },
    },
    {
      name: "deferred-contrast-var",
      expect: "CONTRAST",
      args: () => {
        const d = buildFixture(dist("deferred-contrast-var"));
        const css = join(root, "deferred.css");
        writeFileSync(
          css,
          ":root { --thinkit-accent: var(--sl-color-accent); --thinkit-surface: #17181c; }\n" +
            ':root[data-theme="light"] { --thinkit-accent: #1d4ed8; --thinkit-surface: #ffffff; }\n',
          "utf8"
        );
        return ["--dist", d, "--ui", "--contrast", "--css", css];
      },
    },
    {
      // D1 — 문서 제목이 사이트 이름과 같을 때 Starlight가 만드는 모양 그대로.
      name: "title-duplicated",
      expect: "META_TITLE",
      args: () => {
        const d = buildFixture(dist("title-duplicated"));
        patch(join(d, "index.html"), "<title>제목 | thinkit</title>", "<title>thinkit | thinkit</title>");
        return ["--dist", d];
      },
    },
    {
      // D2 — 한국어 전용 사이트에 우리 문서 제목만 영어로 남는 경우.
      name: "english-h1",
      expect: "META_LANG",
      args: () => {
        const d = buildFixture(dist("english-h1"));
        patch(join(d, "docs/canon/index.html"), "<h1>한글 제목</h1>", "<h1>Principles</h1>");
        return ["--dist", d];
      },
    },
    {
      // D2 대조군 — 아카이브의 영어 제목은 원저자의 것이라 통과해야 한다. 예외가 실제로
      // 동작하는지 보지 않으면 이 검사는 아카이브를 번역하라고 시키는 검사가 된다.
      name: "english-h1-in-archive-ok",
      expect: null,
      args: () => {
        const d = buildFixture(dist("english-h1-in-archive-ok"));
        patch(
          join(d, "docs/references/01-new-rules-of-context-engineering-claude-5/index.html"),
          "<h1>한글 제목</h1>",
          "<h1>The new rules of context engineering</h1>"
        );
        return ["--dist", d];
      },
    },
    {
      // D3 — 자기 사이트를 절대 URL로 가리키는 본문 링크.
      name: "internal-absolute-link",
      expect: "META_SELF_URL",
      args: () => {
        const d = buildFixture(dist("internal-absolute-link"));
        patch(join(d, "index.html"), '<a href="', `<a href="${configuredSite()}/">홈</a><a href="`);
        return ["--dist", d];
      },
    },
    {
      name: "og-image-missing",
      expect: "META_OG",
      args: () => {
        const d = buildFixture(dist("og-image-missing"));
        patch(join(d, "docs/canon/index.html"), /<meta property="og:image"[^>]*>/, "");
        return ["--dist", d];
      },
    },
    {
      // 있다고만 보면 파일 이름을 바꾼 날 죽은 이미지를 초록으로 배포한다.
      name: "og-image-dangling",
      expect: "META_OG",
      args: () => {
        const d = buildFixture(dist("og-image-dangling"));
        rmSync(join(d, "og.png"));
        return ["--dist", d];
      },
    },
    {
      name: "robots-missing",
      expect: "META_ROBOTS",
      args: () => {
        const d = buildFixture(dist("robots-missing"));
        rmSync(join(d, "robots.txt"));
        return ["--dist", d];
      },
    },
  ];

  const failures = [];
  for (const testCase of cases) {
    const { code, out } = runSelf(testCase.args());
    if (testCase.expect === null) {
      if (code !== 0) failures.push(`${testCase.name}: 온전한 픽스처인데 exit ${code}\n${out}`);
      else console.log(`  대조군 ${testCase.name} -> exit 0`);
      continue;
    }
    if (code === 0) failures.push(`${testCase.name}: 깨뜨렸는데 exit 0. 이 검사는 아무것도 안 하고 있다.`);
    else if (!out.includes(testCase.expect))
      failures.push(`${testCase.name}: exit ${code} 이지만 ${testCase.expect} 가 아니라 다른 이유로 실패했다\n${out}`);
    else console.log(`  ${testCase.name} -> exit ${code} (${testCase.expect})`);
  }

  // 검색도 대조군이 필요하다. 실재하지 않는 낱말이 히트하면 인덱스가 아니라 우리가 틀린 것이다.
  const realDist = resolve(siteRoot, opt("dist", "dist"));
  if (!existsSync(join(realDist, "pagefind"))) {
    failures.push("search: dist/pagefind 가 없다. 빌드 뒤에 돌린다.");
  } else {
    const nonsense = runSelf(["--search", "zzqqxxnotaword"]);
    if (nonsense.code === 0) failures.push("search: 없는 낱말이 히트했다.");
    else if (!nonsense.out.includes("SEARCH")) failures.push(`search: 다른 이유로 실패했다\n${nonsense.out}`);
    else console.log("  없는-낱말 검색 -> exit 1 (SEARCH)");
  }

  rmSync(root, { recursive: true, force: true });
  if (failures.length) {
    console.error("\n대조군 실패:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\n대조군 통과: 검사기가 실제로 잡는다.");
}

// ---------------------------------------------------------------- 진입

if (has("self-test")) {
  await selfTest();
  process.exit(0);
}

const dist = resolve(siteRoot, opt("dist", "dist"));
if (!existsSync(dist)) {
  console.error(`verify-links: ${dist} 가 없다. 먼저 빌드한다.`);
  process.exit(2);
}

// 접두사 검사는 별도 명령이 아니다. base가 있으면 기본 실행이 자동으로 켠다 —
// 별도 스텝으로 두면 배포 경로가 바뀔 때 그 스텝을 다시 다는 것을 잊을 수 있고,
// 잊힌 검사는 없는 검사다. `--base`는 그 판정을 덮어쓰는 자리이고, 대조군이 쓴다.
const base = (has("base") ? opt("base", "") : configuredBase()).replace(/\/+$/, "");
const strictBase = Boolean(base);
const searchTerms = (opt("search", "") || "").split(",").map((t) => t.trim()).filter(Boolean);

const problems = [];
if (searchTerms.length) {
  problems.push(...(await checkSearch(dist, searchTerms)));
} else {
  // 건너뛴 것은 말한다. 조용히 빠지면 통과가 "접두사도 봤다"로 읽힌다.
  console.log(
    strictBase
      ? `  base ${base}: 루트 상대 링크가 접두사를 갖는지까지 본다`
      : "  base 없음: 벗길 접두사가 없어 접두사 검사는 돌지 않는다"
  );
  problems.push(...checkLinks(dist, base, { strictBase }));
  problems.push(...checkRoutes(dist));
  // --ui 뒤에 두지 않는다. 이것들은 랜딩의 UI 계약이 아니라 배포되는 모든 쪽의 계약이고,
  // 플래그 뒤에 숨은 검사는 그 플래그를 안 붙인 날 없는 검사다.
  problems.push(...checkMeta(dist));
  if (has("ui")) {
    problems.push(...checkUi(dist));
    if (has("contrast")) problems.push(...checkContrast(resolve(siteRoot, opt("css", "src/styles/custom.css"))));
  }
}

if (problems.length) {
  console.error(`\n${problems.length}건:`);
  for (const p of problems) console.error(`  [${p.code}] ${p.message}`);
  process.exit(1);
}
console.log(`verify-links: 통과 (${relative(siteRoot, dist) || "dist"})`);
