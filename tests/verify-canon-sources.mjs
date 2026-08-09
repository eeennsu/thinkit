#!/usr/bin/env node
// canon.md·structure-patterns.md·calibration/*.md·principles/rules.json이 대는 "주장은
// 출처가 있다"는 약속을 지키는지를 본다. verify-harness-surface.mjs가 rules.json↔SKILL.md
// 드리프트를, verify-profiles.mjs가 프로필↔파일 시스템을 보는 것과 같은 자리를, 여기서는
// 판정 기준·캘리브레이션의 산문 주장과 docs/references/ 원문 사이에서 본다.
//
// 이 검사기가 "주장이 참인가"를 판정하지는 않는다 — 그건 사람의 일이다. 대신 두 가지만
// 묻는다: 주장이 자기 출처를 댈 수 있는가, 그리고 그 출처가 실재하는가. canon.md:3이
// "이 문서의 모든 주장은 Anthropic 공식 문서에서만 온다"고 선언했고, calibration/claude-5.md
// 59-60행이 "모든 값은 source를 지닌다"고 선언했다. 선언에 기계 검사가 없으면 그건 산문일
// 뿐이다.
//
// 아는 약칭(NR/ECE/P5/V)과 그 원문 경로는 canon.md·structure-patterns.md 자신의 표에서
// 읽는다. 하드코딩하면 새 약칭이 추가돼도 검사기가 못 알아챈다. 반대로 "알려진 비참조
// 출처"(예: repo constitution)는 표가 없어서 하드코딩한다 — principles/rules.json을 읽고
// 지금 있는 것에 맞춘 목록이다. 새 비참조 출처가 생기면 이 목록도 사람이 늘려야 한다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const docsDir = join(root, "docs");
const referencesDir = join(docsDir, "references");

// rules.json을 읽고 정한 "알려진 비참조 출처" 목록 (§ 산출 4 참조). 표가 없는 출처라
// 여기서만 하드코딩한다. 새 항목이 생기면 사람이 여기를 늘려야 GREEN을 유지한다.
const KNOWN_NON_REFERENCE_SOURCE_PREFIXES = ["repo constitution", "no primary source states a number"];

// ---------------------------------------------------------------------------
// 매칭 규약 — verify-harness-surface.mjs의 stripNoise/escapeRegex와 같은 규약이다. 이
// 파일은 의존성 없이 독립적으로 돌아야 해서 import하지 않고 그대로 복제했다.
// ---------------------------------------------------------------------------

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}

// 코드펜스와 HTML 주석 안의 글자는 산문이 아니다. 예시로 적힌 약칭이나 지워진 문장이
// "진짜로 그것을 말했다"로 읽히면 검사 자체가 속는다.
function stripNoise(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/<!--[\s\S]*?-->/g, "");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function parseTables(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const header = splitRow(lines[i]);
    if (!isSeparatorRow(splitRow(lines[i + 1]))) continue;
    const rows = [];
    let j = i + 2;
    while (j < lines.length && lines[j].trim().startsWith("|")) {
      rows.push(splitRow(lines[j]));
      j++;
    }
    tables.push({ header, rows });
    i = j - 1;
  }
  return tables;
}

// 행 전체(모든 셀을 합친 문자열)에서 `.md`로 끝나는 마크다운 링크 타깃을 하나 뽑는다.
// canon.md는 링크를 "원문" 열에, structure-patterns.md는 "문서" 열 안에 다른 텍스트와
// 섞어 두므로 열 위치를 고정하지 않고 행 전체에서 찾는다.
function extractMdLinkTarget(row) {
  const joined = row.join(" | ");
  const m = joined.match(/\(([^()]+\.md)\)/);
  return m ? m[1].trim() : null;
}

// 약칭 셀("**[NR]**")에서 문자만 뽑는다.
function extractAbbrev(cell) {
  return cell.replace(/\*/g, "").replace(/[[\]]/g, "").trim();
}

// "약칭" 열을 가진 표를 찾아 abbrev -> { link, row } 맵으로 편다. canon.md와
// structure-patterns.md가 공유하는 형태다.
function collectAbbrevTable(mdText) {
  const stripped = stripNoise(mdText);
  const tables = parseTables(stripped);
  const table = tables.find((t) => t.header.some((h) => h.includes("약칭")));
  if (!table) return null;
  const abbrevIdx = table.header.findIndex((h) => h.includes("약칭"));
  const map = new Map();
  for (const row of table.rows) {
    const abbrev = extractAbbrev(row[abbrevIdx] ?? "");
    if (!abbrev) continue;
    map.set(abbrev, { link: extractMdLinkTarget(row), row });
  }
  return map;
}

// 본문에 등장하는 대괄호 약칭을 전부 모은다. `[NR]`, `[ECE]`, `[P5]`, `[V §9]`처럼 대문자와
// 숫자로만 시작하는 토큰만 잡는다 — `[references/01]`(링크 텍스트)이나 `[§7 표]`(section
// 앵커) 같은 소문자·기호 시작 대괄호는 앞의 `[A-Z]` 요건과 뒤의 단어 경계 요건 때문에
// 걸리지 않는다. `[Claude 5 시대의 ...]`도 "C" 다음이 소문자라 단어 경계가 서지 않아
// 매치되지 않는다.
//
// `[CLAUDE.md](../CLAUDE.md)`처럼 대괄호 전체가 마크다운 링크의 링크 텍스트인 경우는
// 약칭 인용이 아니다 — 닫는 `]` 바로 다음이 `(`이면 링크이므로 걸러낸다.
function extractUsedAbbrevs(strippedText) {
  const re = /\[([A-Z][A-Z0-9]*)\b[^\]]*\]/g;
  const found = new Set();
  let m;
  while ((m = re.exec(strippedText))) {
    if (strippedText[re.lastIndex] === "(") continue;
    found.add(m[1]);
  }
  return found;
}

function readText(relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

// ---------------------------------------------------------------------------
// 검사 1 — 약칭 무결성
// ---------------------------------------------------------------------------
//
// canon.md와 structure-patterns.md가 각자 쓰는 모든 대괄호 약칭이 그 문서 **자신의** 표에
// 등재돼 있는지(정방향), 그리고 표가 가리키는 링크가 실재하는 docs/references/ 파일을
// 가리키는지를 본다.
function checkAbbrevIntegrity(label, relPath) {
  const findings = [];
  const mdText = readText(relPath);
  const table = collectAbbrevTable(mdText);
  if (!table) {
    findings.push({ ok: false, message: `검사1 (${label}): "약칭" 열을 가진 표를 찾을 수 없다` });
    return { findings, table: new Map() };
  }

  const used = extractUsedAbbrevs(stripNoise(mdText));
  for (const abbrev of used) {
    const known = table.has(abbrev);
    findings.push({
      ok: known,
      message: known
        ? `검사1 (${label}): 약칭 "${abbrev}" 표에 등재됨`
        : `검사1 (${label}): 본문이 쓰는 약칭 "${abbrev}"이(가) 자신의 표에 없다`,
    });
  }

  for (const [abbrev, { link }] of table) {
    if (!link) {
      findings.push({ ok: false, message: `검사1 (${label}): 약칭 "${abbrev}" 행에서 .md 링크를 찾을 수 없다` });
      continue;
    }
    const resolved = join(docsDir, link);
    const exists = existsSync(resolved);
    findings.push({
      ok: exists,
      message: exists
        ? `검사1 (${label}): "${abbrev}" -> ${link} 실재함`
        : `검사1 (${label}): "${abbrev}" 표 링크 "${link}"이(가) 가리키는 파일이 없다`,
    });
  }

  return { findings, table };
}

// ---------------------------------------------------------------------------
// 검사 2 — 권위 경계: canon.md는 [V]를 인용하지 않는다
// ---------------------------------------------------------------------------
//
// canon.md:3 "이 문서의 모든 주장은 아래 Anthropic 공식 문서에서만 온다"는 선언이 지금
// 지켜지고 있다. 이 검사는 GREEN으로 시작해야 하고, 앞으로 canon.md에 외부 글([V]) 인용이
// 섞이면 RED로 잡아야 한다.
function checkAuthorityBoundary(canonMd) {
  const used = extractUsedAbbrevs(stripNoise(canonMd));
  const violated = used.has("V");
  return [
    {
      ok: !violated,
      message: violated
        ? `검사2: canon.md가 [V]를 인용한다 — canon.md:3의 "정본에서만 온다" 선언 위반`
        : `검사2: canon.md는 [V]를 인용하지 않는다`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 검사 3 — 아카이브 고아 검사
// ---------------------------------------------------------------------------
//
// docs/references/의 모든 파일이 canon.md 또는 structure-patterns.md 중 최소 한 곳의
// 표에 등재돼 있는지. 아무 데도 안 실린 원문은 아무도 안 읽는 아카이브다.
function checkArchiveOrphans(canonTable, structureTable) {
  const findings = [];
  const linkedBasenames = new Set();
  for (const table of [canonTable, structureTable]) {
    for (const { link } of table.values()) {
      if (link) linkedBasenames.add(basename(link));
    }
  }

  const archiveFiles = readdirSync(referencesDir).filter((f) => f.endsWith(".md"));
  for (const file of archiveFiles) {
    const linked = linkedBasenames.has(file);
    findings.push({
      ok: linked,
      message: linked
        ? `검사3: docs/references/${file}가 등재됨`
        : `검사3: docs/references/${file}가 canon.md·structure-patterns.md 어느 표에도 없다 — 고아 아카이브`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 검사 4 — source 존재
// ---------------------------------------------------------------------------
//
// principles/rules.json의 모든 항목이 비어 있지 않은 source를 지니는지. calibration/*.md의
// 값 블록에서 value가 null이 아닌 항목이 source(calibration/index.json의
// contract.value_requires가 정한 필드)를 지니는지, value가 null인 항목은 unset_reason을
// 지니는지.
function checkRulesJsonSources(rulesJson) {
  return rulesJson.items.map((item) => {
    const has = typeof item.source === "string" && item.source.trim().length > 0;
    return {
      ok: has,
      message: has
        ? `검사4 (rules.json): "${item.id}" source 있음`
        : `검사4 (rules.json): "${item.id}"에 비어 있지 않은 source가 없다`,
    };
  });
}

// 캘리브레이션 markdown 파일에 박힌 ```json 블록을 뽑아 파싱한다.
function extractEmbeddedJson(mdText, relPath) {
  const m = mdText.match(/```json\n([\s\S]*?)```/);
  if (!m) throw new Error(`${relPath}에서 \`\`\`json 블록을 찾을 수 없다`);
  return JSON.parse(m[1]);
}

function checkCalibrationSources(indexJson) {
  const findings = [];
  // 검사5가 쓸 source 목록. 여기서 함께 모으는 이유는, 호출부가 파일을 다시 파싱하면 검사4가
  // 이미 "파싱할 수 없다"로 보고한 파일에서 두 번째 파싱이 잡히지 않은 채 던지기 때문이다.
  // 깨진 파일 하나가 깨끗한 RED 대신 스택 트레이스로 나가면, 읽는 사람은 검사기가 무엇을
  // 확인했는지 아무것도 듣지 못한다.
  const sources = [];

  // "source"라는 이름을 하드코딩하지 않고 index.json의 계약에서 읽는다. value_requires는
  // ["value", "source"]처럼 "value" 자신을 포함하므로 그것만 걸러내면 남는 키가 값이 있을
  // 때 요구되는 동반 필드들이다.
  // 조기 반환도 성공 경로와 같은 모양으로 돌려준다. 배열과 객체를 섞어 돌려주면 호출부가
  // 없는 필드를 빈 배열로 받고, 검사5의 캘리브레이션 부분이 아무 말 없이 건너뛰어진다 —
  // 돌지 않은 검사가 통과한 검사처럼 보이는 그 모양이다.
  const abort = () => ({ findings, sources: [] });

  const valueRequires = indexJson.contract?.value_requires;
  if (!Array.isArray(valueRequires)) {
    findings.push({ ok: false, message: `검사4 (calibration): index.json에 contract.value_requires 배열이 없다` });
    return abort();
  }
  const requiredCompanionKeys = valueRequires.filter((k) => k !== "value");
  if (!requiredCompanionKeys.length) {
    findings.push({ ok: false, message: `검사4 (calibration): contract.value_requires가 "value" 말고는 아무것도 요구하지 않는다` });
    return abort();
  }

  // 캘리브레이션 파일 목록도 index.json의 axes에서 읽는다 — 경로를 하드코딩하지 않는다.
  const files = new Set();
  for (const axis of Object.values(indexJson.axes ?? {})) {
    for (const relPath of Object.values(axis.files ?? {})) files.add(relPath);
  }
  if (!files.size) {
    findings.push({ ok: false, message: `검사4 (calibration): index.json.axes에서 캘리브레이션 파일을 찾을 수 없다` });
    return abort();
  }

  for (const relPath of files) {
    let parsed;
    try {
      parsed = extractEmbeddedJson(readText(relPath), relPath);
    } catch (e) {
      findings.push({ ok: false, message: `검사4 (calibration): ${relPath} — ${e.message}` });
      continue;
    }
    // `values`가 없으면 그 파일에 대해 아무 단언도 하지 않게 된다 — 항목이 하나도 없어서
    // 통과한 것과 파일 모양이 바뀌어서 아무것도 못 읽은 것이 같은 초록으로 나간다.
    if (!parsed.values || typeof parsed.values !== "object") {
      findings.push({ ok: false, message: `검사4 (calibration): ${relPath}의 값 블록에 values 객체가 없다 — 이 파일에 대해 아무것도 확인하지 못했다` });
      continue;
    }
    for (const [key, entry] of Object.entries(parsed.values)) {
      if (entry.value !== null) {
        sources.push({ origin: `${relPath}:${key}`, source: entry.source });
        for (const reqKey of requiredCompanionKeys) {
          const v = entry[reqKey];
          const has = typeof v === "string" ? v.trim().length > 0 : v !== undefined && v !== null;
          findings.push({
            ok: has,
            message: has
              ? `검사4 (${relPath}): "${key}" ${reqKey} 있음`
              : `검사4 (${relPath}): "${key}"는 value가 null이 아닌데 ${reqKey}가 없다`,
          });
        }
      } else {
        const has = typeof entry.unset_reason === "string" && entry.unset_reason.trim().length > 0;
        findings.push({
          ok: has,
          message: has
            ? `검사4 (${relPath}): "${key}"는 value가 null이고 unset_reason이 있다`
            : `검사4 (${relPath}): "${key}"는 value가 null인데 unset_reason이 없다`,
        });
      }
    }
  }

  return { findings, sources };
}

// ---------------------------------------------------------------------------
// 검사 5 — source 추적 가능성
// ---------------------------------------------------------------------------
//
// source 문자열이 아는 약칭(canon.md·structure-patterns.md 표에서 읽는다)이나 알려진
// 비참조 출처로 시작하는지. 덤으로, "약칭 - 절 제목; 절 제목2" 형태(calibration/*.md가
// 쓰는 인용 형태)인 source는 그 절 제목이 실제로 원문 헤딩이거나 굵은 글씨 소제목으로
// 있는지까지 본다.
function titleAppearsInDoc(strippedDocText, title) {
  const escaped = escapeRegex(title.trim());
  const headingRe = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, "m");
  // Anthropic 원문은 절 제목을 `## 헤딩`으로도, 굵은 글씨 소제목("**제목:** 설명…")으로도
  // 쓴다 (예: 04번 원문의 "Code review and bug-finding"은 `## Capability improvements`
  // 아래 불릿의 굵은 글씨다). 둘 중 하나만 있어도 원문에 있다고 본다.
  const boldRe = new RegExp(`\\*\\*${escaped}:?\\*\\*`);
  return headingRe.test(strippedDocText) || boldRe.test(strippedDocText);
}

function checkSourceTraceability(sources, knownAbbrevs, refDocByAbbrev) {
  const findings = [];
  const abbrevList = [...knownAbbrevs];
  const dashCitationRe = new RegExp(`^(${abbrevList.map(escapeRegex).join("|")})\\s-\\s(.+)$`);

  for (const { origin, source } of sources) {
    if (typeof source !== "string" || !source.trim()) continue; // 검사4가 이미 잡는다

    const matchesAbbrev = abbrevList.some((a) => new RegExp(`^${escapeRegex(a)}(?![A-Za-z0-9])`).test(source));
    const matchesNonRef = KNOWN_NON_REFERENCE_SOURCE_PREFIXES.some((p) => source.startsWith(p));
    const ok = matchesAbbrev || matchesNonRef;
    findings.push({
      ok,
      message: ok
        ? `검사5 (${origin}): source가 알려진 출처로 시작함`
        : `검사5 (${origin}): source "${source}"가 아는 약칭이나 알려진 비참조 출처로 시작하지 않는다`,
    });

    // 덤 — "약칭 - 절 제목; 절 제목2" 형태는 절 제목이 원문에 실제 있는지까지 본다.
    const dashMatch = source.match(dashCitationRe);
    if (dashMatch) {
      const [, abbrev, titlesRaw] = dashMatch;
      const doc = refDocByAbbrev.get(abbrev);
      if (!doc) {
        findings.push({ ok: false, message: `검사5 (${origin}): 약칭 "${abbrev}"의 원문을 찾을 수 없어 절 제목을 확인할 수 없다` });
        continue;
      }
      const titles = titlesRaw
        .split(/[;/]/)
        .map((t) => t.trim())
        .filter(Boolean);
      for (const title of titles) {
        const present = titleAppearsInDoc(doc, title);
        findings.push({
          ok: present,
          message: present
            ? `검사5 절 제목 (${origin}): "${title}"이(가) ${abbrev} 원문에 있음`
            : `검사5 절 제목 (${origin}): "${title}"이(가) ${abbrev} 원문(헤딩·굵은 소제목)에서 안 보인다`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 실행부
// ---------------------------------------------------------------------------

function printFindings(findings) {
  let failed = false;
  for (const f of findings) {
    if (f.ok) console.log(`ok   ${f.message}`);
    else {
      console.log(`FAIL ${f.message}`);
      failed = true;
    }
  }
  return failed;
}

function run() {
  let failed = false;

  const canonMd = readText("docs/canon.md");
  const structureMd = readText("docs/structure-patterns.md");
  const rulesJson = JSON.parse(readText("principles/rules.json"));
  const indexJson = JSON.parse(readText("calibration/index.json"));

  const { findings: f1a, table: canonTable } = checkAbbrevIntegrity("canon.md", "docs/canon.md");
  const { findings: f1b, table: structureTable } = checkAbbrevIntegrity("structure-patterns.md", "docs/structure-patterns.md");
  if (printFindings(f1a)) failed = true;
  if (printFindings(f1b)) failed = true;

  if (printFindings(checkAuthorityBoundary(canonMd))) failed = true;

  if (printFindings(checkArchiveOrphans(canonTable, structureTable))) failed = true;

  if (printFindings(checkRulesJsonSources(rulesJson))) failed = true;

  const calibResult = checkCalibrationSources(indexJson);
  if (printFindings(calibResult.findings)) failed = true;

  // 검사5가 쓸 "아는 약칭" 집합 — 두 표의 합집합. canon.md에는 없는 V도 structure-patterns.md
  // 표에서 들어온다. 지금은 아무 source도 V로 시작하지 않지만, 하드코딩하지 않아야 새 약칭이
  // 생겼을 때 이 검사가 자동으로 따라온다.
  const knownAbbrevs = new Set([...canonTable.keys(), ...structureTable.keys()]);
  const refDocByAbbrev = new Map();
  for (const table of [canonTable, structureTable]) {
    for (const [abbrev, { link }] of table) {
      if (!link || refDocByAbbrev.has(abbrev)) continue;
      const resolved = join(docsDir, link);
      if (existsSync(resolved)) refDocByAbbrev.set(abbrev, stripNoise(normalizeNewlines(readFileSync(resolved, "utf8"))));
    }
  }

  // 캘리브레이션 쪽 source는 검사4가 파싱하면서 이미 모아 두었다. 여기서 다시 파싱하면
  // 검사4가 깨끗한 RED로 보고한 파일에 대해 두 번째 파싱이 던져 검사기를 죽인다.
  const sources = [
    ...rulesJson.items.map((item) => ({ origin: `rules.json:${item.id}`, source: item.source })),
    ...calibResult.sources,
  ];

  if (printFindings(checkSourceTraceability(sources, knownAbbrevs, refDocByAbbrev))) failed = true;

  return !failed;
}

process.exit(run() ? 0 : 1);
