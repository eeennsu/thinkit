#!/usr/bin/env node
// 빌드 산출물을 걸어서 링크·앵커·라우트·UI 계약을 검사한다. 의존성 없이 node로만 돈다 —
// 레포의 tests/verify-*.mjs 관행이고, 검사기가 설치에 매달리면 CI에서 가장 먼저 꺼진다.
//
// dist를 걷는 스크립트는 이것 하나다. 둘로 나누면 기대 라우트 목록이 두 곳에 생기고,
// 두 곳은 갈라진다.
//
//   node scripts/verify-links.mjs                  링크·앵커·라우트
//   node scripts/verify-links.mjs --base /thinkit  루트 상대 링크가 base를 달고 있는지까지
//   node scripts/verify-links.mjs --search 충돌,경계 pagefind 인덱스에 실제 질의
//   node scripts/verify-links.mjs --ui             라벨·permalink·인용 시점·img alt
//   node scripts/verify-links.mjs --ui --contrast  위 + 강조색 대비비 (라이트/다크 각각)
//   node scripts/verify-links.mjs --self-test      일부러 깨뜨린 픽스처에서 exit 1이 나오는지
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { collectRepoFiles } from "../src/loaders/repo-docs.mjs";

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

  // U4 U5 — 인용 블록에만 적용한다. blob/main 은 대상 레포가 파일을 고치는 순간
  // 인용이 거짓이 되므로 sha 고정만 통과시킨다.
  const before = sampleBlock(html, "before");
  if (!before) {
    problems.push({ code: "UI_LABEL", message: '랜딩에 data-sample="before" 블록이 없다' });
  } else {
    // 자리표시자는 인용이 틀린 것이 아니라 아직 없는 것이다. 두 실패의 원인이 같으므로
    // 같은 문장을 달아준다 — 안 그러면 permalink 형식이 틀린 것처럼 읽힌다.
    const pending = /class="sample-pending"/.test(before)
      ? " — Before 블록이 아직 자리표시자다. src/content/samples/before.md 를 채운다"
      : "";
    if (!PERMALINK.test(before)) {
      problems.push({
        code: "UI_PERMALINK",
        message: `Before 블록에 blob/<40자 sha>/ permalink 가 없다 (blob/main 은 통과시키지 않는다)${pending}`,
      });
    }
    if (!CITED_AT.test(before)) {
      problems.push({ code: "UI_CITED_AT", message: `Before 블록에 인용 시점(YYYY-MM-DD) 이 없다${pending}` });
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

// custom.css 의 규약: `:root` 가 다크, `:root[data-theme="light"]` 가 라이트.
// 각 블록의 --thinkit-accent 와 --thinkit-surface 가 전경/배경 쌍이다.
function checkContrast(cssPath) {
  const problems = [];
  if (!existsSync(cssPath)) return [{ code: "CONTRAST", message: `${cssPath} 가 없다` }];
  const css = readFileSync(cssPath, "utf8");

  const themes = [
    { name: "dark", selector: /:root\s*\{([\s\S]*?)\}/ },
    { name: "light", selector: /:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/ },
  ];

  for (const theme of themes) {
    const block = css.match(theme.selector);
    if (!block) {
      problems.push({ code: "CONTRAST", message: `${theme.name} 테마 블록을 찾지 못했다` });
      continue;
    }
    const read = (name) => block[1].match(new RegExp(`--thinkit-${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`))?.[1];
    const accent = read("accent");
    const surface = read("surface");
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
const fixturePage = (body) => `<!doctype html><html lang="ko"><body>${body}</body></html>\n`;

function buildFixture(dir) {
  rmSync(dir, { recursive: true, force: true });
  const base = configuredBase();
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
      `<a href="${base}/docs/principles/#3-지시-충돌이-왜-비용인가">원칙</a>` +
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
  writeFileSync(join(dir, "404.html"), fixturePage("<p>없다</p>"), "utf8");
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
        patch(join(d, "index.html"), `${base}/docs/principles/`, `${base}/docs/nope/`);
        return ["--dist", d];
      },
    },
    {
      name: "broken-anchor",
      expect: "ANCHOR",
      args: () => {
        const d = buildFixture(dist("broken-anchor"));
        patch(join(d, "docs/principles/index.html"), 'id="3-지시-충돌이-왜-비용인가"', 'id="다른-제목"');
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
    {
      name: "missing-base",
      expect: "BASE",
      args: () => {
        const d = buildFixture(dist("missing-base"));
        patch(join(d, "index.html"), `${base}/docs/principles/`, "/docs/principles/");
        return ["--dist", d, "--base", base];
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
        patch(join(d, "docs/principles/index.html"), "<body>", '<body><meta name="description" content="x">');
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

const strictBase = args.includes("--base");
const base = strictBase ? opt("base", "").replace(/\/+$/, "") : configuredBase();
const searchTerms = (opt("search", "") || "").split(",").map((t) => t.trim()).filter(Boolean);

const problems = [];
if (searchTerms.length) {
  problems.push(...(await checkSearch(dist, searchTerms)));
} else {
  problems.push(...checkLinks(dist, base, { strictBase }));
  problems.push(...checkRoutes(dist));
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
