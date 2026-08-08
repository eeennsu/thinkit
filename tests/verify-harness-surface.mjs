#!/usr/bin/env node
// 5단계 검사기. rules.json이 정한 것과 스킬 산문이 실제로 말하는 것이 갈라지지 않았는지를
// 본다 — verify-profiles.mjs가 프로필과 파일 시스템 사이를 보는 것과 같은 자리를, 여기서는
// 판정 기준(rules.json)과 그것을 설명하는 산문(SKILL.md) 사이에서 본다.
//
// A1~A3는 오늘 RED다. `## 소유자에게 묻는 것` 절도, `AskUserQuestion`도, `[enforced]` 표의
// 표식도 아직 배선되지 않았기 때문이고, 그 배선은 이 검사기가 아니라 별도로 착지한다.
// 그것이 이 검사기가 존재하는 이유다 — RED가 신호이지, 버그가 아니다.
// A5·B는 오늘 GREEN이어야 하는 회귀 가드다. 새 규칙이나 새 principles 파일을 몰래 늘리는
// 것, 이 플러그인 자신의 CLAUDE.md가 `## 함정`을 다는 것을 잡는다.
//
// A4는 검사가 아니라 위 전부에 적용되는 매칭 규약이다: 코드펜스와 HTML 주석 안의 글자는
// 세지 않는다. 그것 없이는 예시로 등장하는 규칙 id나 문서용 헤딩이 진짜로 읽힌다.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const AUDIT_SKILL_PATH = "skills/harness-audit/SKILL.md";
const BOOTSTRAP_SKILL_PATH = "skills/harness-bootstrap/SKILL.md";
const ENFORCED_STATES = ["full", "partial", "none", "unknown"];
const ASKING_STATES = ["partial", "none"];
const NOT_ASKING_STATES = ["full", "unknown"];

// ---------------------------------------------------------------------------
// 매칭 규약 (A4) — 이 아래 전부가 이것을 거친 텍스트만 본다.
// ---------------------------------------------------------------------------

// 코드펜스 안의 예시와 HTML 주석 안의 메모는 산문이 아니다. 규칙 id를 예시로 한 번
// 적어 보이거나 지운 문장을 주석으로 남겨 둔 것이 "진짜로 그것을 말했다"로 읽히면 검사
// 자체가 속는다.
function stripNoise(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/<!--[\s\S]*?-->/g, "");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// id가 더 긴 토큰의 일부로 우연히 걸리지 않게, 앞뒤가 [\w.-]가 아닐 때만 나온 것으로 친다.
function idAppears(text, id) {
  const re = new RegExp(`(^|[^\\w.-])${escapeRegex(id)}($|[^\\w.-])`);
  return re.test(text);
}

// `## 제목` 아래 본문만 뽑는다. 같거나 더 높은 레벨의 다음 헤딩에서 멈춘다 — 그래야
// 그 절 안에 `###` 하위 절이 있어도 통째로 딸려 온다. 못 찾으면 null이라 호출부가
// "절 자체가 없다"와 "절은 있는데 내용이 비었다"를 구분할 수 있다.
function section(md, heading) {
  const lines = md.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${escapeRegex(heading)}\\s*$`).test(l.trim()));
  if (startIdx === -1) return null;
  const startLevel = (lines[startIdx].match(/^#+/) ?? [""])[0].length;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= startLevel) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join("\n");
}

// `1. …` 항목을 잘라낸다. 다음 번호 줄이 나오면 거기서 끊고, 그것이 없으면 빈 줄에서
// 끊는다 — 번호 목록 뒤에 오는 산문 문단(예: "4~6단계는 스크립트다…")까지 항목으로
// 삼키면 안 된다.
function orderedListItems(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let current = null;
  for (const line of lines) {
    if (/^\s*\d+\.\s+/.test(line)) {
      if (current) items.push(current.join("\n"));
      current = [line];
    } else if (current) {
      if (line.trim() === "") {
        items.push(current.join("\n"));
        current = null;
      } else {
        current.push(line);
      }
    }
  }
  if (current) items.push(current.join("\n"));
  return items;
}

// 마크다운 표를 전부 찾는다. 구분줄(`| --- | --- |`)이 헤딩 바로 다음에 있어야 표로 친다.
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

// 표 셀에서 경로만 꺼낸다. 백틱 코드나 마크다운 링크 `[글](경로)` 둘 다 받는다.
function extractPath(cell) {
  const link = cell.match(/\(([^)]+)\)/);
  if (link) return link[1].trim();
  return cell.replace(/`/g, "").trim();
}

// `${CLAUDE_PLUGIN_ROOT}/` 접두어를 벗기고, 스킬 상대 경로(`references/…`)는 그 SKILL.md의
// 디렉터리 기준으로 레포 루트 상대 경로로 편다. 이것 없이는 SKILL.md의 `references/x.md`와
// rules.json의 `skills/harness-audit/references/x.md`가 같은 파일을 가리켜도 문자열로는
// 갈라진다.
function normalizeRubricPath(raw, skillMdRelPath) {
  let p = (raw ?? "").trim();
  p = p.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, "");
  if (p.startsWith("references/")) {
    const skillDir = skillMdRelPath.split("/").slice(0, -1).join("/");
    p = `${skillDir}/${p}`;
  }
  return p;
}

function findRubricColumn(header) {
  return header.findIndex((h) => h.includes("루브릭"));
}

// ---------------------------------------------------------------------------
// A1 — ask 표면 결속
// ---------------------------------------------------------------------------
//
// 대상은 파일 전체가 아니라 `## 소유자에게 묻는 것` 절이다. 파일 전체로 잡으면 지나가는
// 문장 하나가 규칙 id를 언급하는 것만으로 초록이 되고, 그것이 A4가 막으려는 구멍이다.
//
// 정방향: rules.json에서 audit.asks를 가진 모든 id가 그 절에 나온다.
// 역방향: 그 절이 부르는 모든 id가 audit.asks를 가진다 — 단순히 rules.json에 실재하는가가
//         아니다. 실재만 보면 "그래서 review.cutoff-instruction이…" 같은 지나가는 언급도
//         통과해 버린다.
// rubric 일치(J7): 판단 규칙마다 rubric 표가 지목하는 파일과 rules.json의 rubric 필드가
//         정규화 후 같다. 두 곳이 각자 id→rubric를 주장하면 rule.single-ownership이 금지하는
//         모양 그대로다.
function checkA1(rulesJson, skillMd, skillMdRelPath) {
  const findings = [];
  const stripped = stripNoise(skillMd);
  const ids = rulesJson.items.map((i) => i.id);
  const asksIds = rulesJson.items
    .filter((i) => i.audit && Object.prototype.hasOwnProperty.call(i.audit, "asks"))
    .map((i) => i.id);

  const sec = section(stripped, "소유자에게 묻는 것");
  if (sec === null) {
    findings.push({ ok: false, message: `A1: "## 소유자에게 묻는 것" 절이 ${skillMdRelPath}에 없다` });
    for (const id of asksIds) {
      findings.push({
        ok: false,
        message: `A1 정방향: audit.asks를 가진 "${id}"이(가) ask 표면 절에 없다 (절 자체가 없다)`,
      });
    }
  } else {
    const idsInSection = ids.filter((id) => idAppears(sec, id));
    for (const id of asksIds) {
      const present = idsInSection.includes(id);
      findings.push({
        ok: present,
        message: present
          ? `A1 정방향: "${id}" ask 표면 절에 있음`
          : `A1 정방향: audit.asks를 가진 "${id}"이(가) ask 표면 절에 없다`,
      });
    }
    for (const id of idsInSection) {
      const item = rulesJson.items.find((i) => i.id === id);
      const hasAsks = Boolean(item.audit && Object.prototype.hasOwnProperty.call(item.audit, "asks"));
      findings.push({
        ok: hasAsks,
        message: hasAsks
          ? `A1 역방향: "${id}" audit.asks 있음`
          : `A1 역방향: ask 표면 절이 "${id}"을(를) 부르는데 audit.asks가 없다`,
      });
    }
  }

  findings.push(...checkA1RubricAgreement(rulesJson, stripped, skillMdRelPath));
  return findings;
}

function checkA1RubricAgreement(rulesJson, strippedSkillMd, skillMdRelPath) {
  const findings = [];
  const judgementRules = rulesJson.items.filter((i) => i.decidable === "judgement");
  const tables = parseTables(strippedSkillMd);
  const table = tables.find((t) => findRubricColumn(t.header) !== -1);

  if (!table) {
    for (const item of judgementRules) {
      findings.push({ ok: false, message: `A1 rubric: 루브릭 표를 찾을 수 없어 "${item.id}"을(를) 확인할 수 없다` });
    }
    return findings;
  }

  const rubricIdx = findRubricColumn(table.header);
  const ids = rulesJson.items.map((i) => i.id);
  const rowRubricById = new Map();
  for (const row of table.rows) {
    const rowText = row.join(" ");
    for (const id of ids) {
      if (!rowRubricById.has(id) && idAppears(rowText, id)) rowRubricById.set(id, row[rubricIdx] ?? "");
    }
  }

  for (const item of judgementRules) {
    const cell = rowRubricById.get(item.id);
    if (cell === undefined) {
      findings.push({ ok: false, message: `A1 rubric: "${item.id}" 규칙이 루브릭 표에 없다` });
      continue;
    }
    const fromTable = normalizeRubricPath(extractPath(cell), skillMdRelPath);
    const fromRules = normalizeRubricPath(item.rubric, skillMdRelPath);
    const ok = fromTable === fromRules;
    findings.push({
      ok,
      message: ok
        ? `A1 rubric: "${item.id}" 일치 (${fromRules})`
        : `A1 rubric: "${item.id}" 불일치 — SKILL.md="${fromTable}" rules.json="${fromRules}"`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// A2 — 위치
// ---------------------------------------------------------------------------
//
// `## 순서` 순서 목록에서 `interview.md`를 담은 항목이 그 항목 **안에서**
// `AskUserQuestion`을 담아야 한다. 다른 절에 있는 언급은 세지 않는다 — 그 구분이 이 검사의
// 전부다.
function checkA2(bootstrapMd) {
  const stripped = stripNoise(bootstrapMd);
  const sec = section(stripped, "순서");
  if (sec === null) {
    return [{ ok: false, message: `A2: "## 순서" 절이 ${BOOTSTRAP_SKILL_PATH}에 없다` }];
  }
  const items = orderedListItems(sec);
  const interviewItems = items.filter((it) => it.includes("interview.md"));
  if (!interviewItems.length) {
    return [{ ok: false, message: `A2: "## 순서" 목록에 interview.md를 담은 항목이 없다` }];
  }
  return interviewItems.map((it) => {
    const has = it.includes("AskUserQuestion");
    const excerpt = it.split("\n")[0].trim();
    return {
      ok: has,
      message: has
        ? `A2: interview.md를 담은 항목이 AskUserQuestion도 담고 있다`
        : `A2: interview.md를 담은 항목이 AskUserQuestion을 담지 않는다: "${excerpt}"`,
    };
  });
}

// ---------------------------------------------------------------------------
// A3 — 상태 분할
// ---------------------------------------------------------------------------
//
// "모든 행에 선택지 하나"는 설계가 거부하는 것을 요구해서 정답 위에서도 빨간불이 된다.
// 그래서 분할 단언 셋으로 쪼갠다: 네 상태가 다 있는가, 묻는 둘은 선택지 표식을 둘 이상
// 지니는가, 안 묻는 둘은 `[묻지 않음]`을 명시하는가.
function checkA3(skillMd) {
  const findings = [];
  const stripped = stripNoise(skillMd);
  const tables = parseTables(stripped);
  const table = tables.find((t) => t.header.some((h) => h.includes("상태")));
  if (!table) {
    findings.push({ ok: false, message: `A3: [enforced] 관문 표를 ${AUDIT_SKILL_PATH}에서 찾을 수 없다` });
    return findings;
  }

  const rowByState = new Map();
  for (const row of table.rows) {
    const state = (row[0] ?? "").replace(/`/g, "").trim();
    if (state) rowByState.set(state, row);
  }

  for (const state of ENFORCED_STATES) {
    const present = rowByState.has(state);
    findings.push({
      ok: present,
      message: present
        ? `A3: "${state}" 행 있음`
        : `A3: enforced.mjs가 내보내는 상태 "${state}"이(가) 표에 없다`,
    });
  }

  for (const state of ASKING_STATES) {
    const row = rowByState.get(state);
    if (!row) continue; // 없는 행은 위에서 이미 잡혔다
    const marks = new Set(row.join(" ").match(/\([a-z]\)/g) ?? []);
    findings.push({
      ok: marks.size >= 2,
      message:
        marks.size >= 2
          ? `A3: 묻는 상태 "${state}" 행에 선택지 표식 ${marks.size}개`
          : `A3: 묻는 상태 "${state}" 행에 선택지 표식이 둘 미만이다 (${marks.size}개)`,
    });
  }

  for (const state of NOT_ASKING_STATES) {
    const row = rowByState.get(state);
    if (!row) continue;
    const hasMark = row.join(" ").includes("[묻지 않음]");
    findings.push({
      ok: hasMark,
      message: hasMark
        ? `A3: 묻지 않는 상태 "${state}" 행에 [묻지 않음] 표식 있음`
        : `A3: 묻지 않는 상태 "${state}" 행에 [묻지 않음] 표식이 없다`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// A5 — 개수 (회귀 가드, 오늘 초록이어야 한다)
// ---------------------------------------------------------------------------
//
// A1~A3와 달리 실패를 기다리는 검사가 아니다. rules.json이나 principles/가 조용히
// 늘어나는 것, 새 테스트 파일이 README의 개발 명령 블록에서 빠지는 것을 잡는 가드다.
function checkA5(rulesJson, principlesFiles, testsFiles, readme) {
  const findings = [];
  findings.push({
    ok: rulesJson.items.length === 14,
    message: `A5: rules.json 항목 수 ${rulesJson.items.length}개 (기대 14개)`,
  });
  findings.push({
    ok: principlesFiles.length === 4,
    message: `A5: principles/*.md ${principlesFiles.length}개 (기대 4개)`,
  });

  const fences = [...readme.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const devBlock = fences.find((f) => /node tests\//.test(f)) ?? "";
  const listed = new Set([...devBlock.matchAll(/tests\/([A-Za-z0-9_-]+\.mjs)/g)].map((m) => m[1]));
  const missing = testsFiles.filter((f) => !listed.has(f));
  findings.push({
    ok: missing.length === 0,
    message:
      missing.length === 0
        ? `A5: README.md 개발 명령 블록이 tests/*.mjs ${testsFiles.length}개를 모두 나열함`
        : `A5: README.md 개발 명령 블록에 없는 테스트 파일: ${missing.join(", ")}`,
  });

  return findings;
}

// ---------------------------------------------------------------------------
// B — 음성 가드 (오늘 초록이어야 한다)
// ---------------------------------------------------------------------------
//
// thinkit 자신의 CLAUDE.md에는 `## 함정`이 없어야 한다. 감사 루프가 자기 CLAUDE.md를
// 장식하기 시작하는 것을 잡는다 — gotcha는 정의상 레포 안에서만 알 수 있고, 이 레포 자신에
// 대해 루프가 지어낸 gotcha는 gotcha가 아니라 소음이다.
function checkB(claudeMdText) {
  const stripped = stripNoise(claudeMdText);
  const hasHeading = /^##\s+함정\s*$/m.test(stripped);
  return [
    {
      ok: !hasHeading,
      message: hasHeading
        ? `B: CLAUDE.md에 "## 함정" 제목이 있다 — 루프가 자기 CLAUDE.md를 장식하면 안 된다`
        : `B: CLAUDE.md에 "## 함정" 제목이 없다`,
    },
  ];
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

function runReal() {
  let failed = false;

  const rulesJson = JSON.parse(readFileSync(join(root, "principles/rules.json"), "utf8"));
  const auditMd = readFileSync(join(root, AUDIT_SKILL_PATH), "utf8");
  const bootstrapMd = readFileSync(join(root, BOOTSTRAP_SKILL_PATH), "utf8");
  const claudeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const principlesFiles = readdirSync(join(root, "principles")).filter((f) => f.endsWith(".md"));
  const testsFiles = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".mjs"));

  if (printFindings(checkA1(rulesJson, auditMd, AUDIT_SKILL_PATH))) failed = true;
  if (printFindings(checkA2(bootstrapMd))) failed = true;
  if (printFindings(checkA3(auditMd))) failed = true;
  if (printFindings(checkA5(rulesJson, principlesFiles, testsFiles, readme))) failed = true;
  if (printFindings(checkB(claudeMd))) failed = true;

  return !failed;
}

// ---------------------------------------------------------------------------
// --self-test — 픽스처는 전부 인메모리 문자열이다. 레포에는 아무것도 쓰지 않는다.
// ---------------------------------------------------------------------------
//
// 통과만 보는 검사기는 아무것도 안 하는 검사기와 구분되지 않는다(design-log:44-58).
// 그래서 깨진 픽스처마다 REPORTED를, 온전한 픽스처마다 CLEAN을 확인한다 — 한쪽만 보면
// 전부 막는 설정이 전부 통과시키는 설정과 똑같이 초록으로 읽힌다.
function selfCase(name, kind, findings) {
  const hasFail = findings.some((f) => !f.ok);
  const passed = kind === "broken" ? hasFail : !hasFail;
  if (passed) {
    console.log(`ok   [self-test] ${name}: ${kind === "broken" ? "REPORTED됨" : "CLEAN함"}`);
  } else {
    console.log(
      `FAIL [self-test] ${name}: ${kind === "broken" ? "REPORTED돼야 하는데 CLEAN하다" : "CLEAN해야 하는데 REPORTED됐다"}`,
    );
    for (const f of findings.filter((x) => !x.ok)) console.log(`     - ${f.message}`);
  }
  return !passed;
}

function runSelfTest() {
  let failed = false;
  const run = (name, kind, findings) => {
    if (selfCase(name, kind, findings)) failed = true;
  };

  // --- A1 ----------------------------------------------------------------
  const a1Rules = () => ({
    items: [
      { id: "rule.one", decidable: "judgement", rubric: "principles/one.md", audit: { check: "x", asks: "질문1" } },
      {
        id: "rule.two",
        decidable: "judgement",
        rubric: "skills/harness-audit/references/two.md",
        audit: { check: "x", asks: "질문2" },
      },
      { id: "rule.three", decidable: "judgement", rubric: "principles/three.md", audit: { check: "x" } },
      { id: "rule.four", decidable: "machine", audit: { check: "y" } },
    ],
  });
  const a1SkillLines = (askSurfaceBody, rubricRows) => [
    "# 하네스 감사",
    "",
    "## 소유자에게 묻는 것",
    "",
    ...askSurfaceBody,
    "",
    "## 판단 항목",
    "",
    "| 규칙 | 루브릭 |",
    "| --- | --- |",
    ...rubricRows,
    "",
  ];
  const baseAskSurface = ["- `rule.one` — 질문1", "- `rule.two` — 질문2"];
  const baseRubricRows = [
    "| `rule.one` | `principles/one.md` |",
    "| `rule.two` | `references/two.md` |",
    "| `rule.three` | `principles/three.md` |",
  ];

  run(
    "A1 온전한 픽스처",
    "intact",
    checkA1(a1Rules(), a1SkillLines(baseAskSurface, baseRubricRows).join("\n"), AUDIT_SKILL_PATH),
  );

  run(
    "A1 정방향만 깨짐 (rule.two가 ask 표면 절에 없음)",
    "broken",
    checkA1(a1Rules(), a1SkillLines(["- `rule.one` — 질문1"], baseRubricRows).join("\n"), AUDIT_SKILL_PATH),
  );

  run(
    "A1 역방향만 깨짐 (audit.asks 없는 rule.three가 절에서 불림)",
    "broken",
    checkA1(
      a1Rules(),
      a1SkillLines([...baseAskSurface, "- `rule.three` — 질문3?"], baseRubricRows).join("\n"),
      AUDIT_SKILL_PATH,
    ),
  );

  run(
    "A1 rubric 불일치 하나 (rule.one)",
    "broken",
    checkA1(
      a1Rules(),
      a1SkillLines(baseAskSurface, [
        "| `rule.one` | `principles/one-WRONG.md` |",
        "| `rule.two` | `references/two.md` |",
        "| `rule.three` | `principles/three.md` |",
      ]).join("\n"),
      AUDIT_SKILL_PATH,
    ),
  );

  const a1NormRules = () => ({
    items: [
      { id: "rule.norm.a", decidable: "judgement", rubric: "principles/norm-a.md", audit: {} },
      { id: "rule.norm.b", decidable: "judgement", rubric: "skills/harness-audit/references/norm-b.md", audit: {} },
    ],
  });
  const a1NormSkill = [
    "# 하네스 감사",
    "",
    "## 소유자에게 묻는 것",
    "",
    "(해당 없음)",
    "",
    "## 판단 항목",
    "",
    "| 규칙 | 루브릭 |",
    "| --- | --- |",
    "| `rule.norm.a` | `${CLAUDE_PLUGIN_ROOT}/principles/norm-a.md` |",
    "| `rule.norm.b` | `references/norm-b.md` |",
    "",
  ].join("\n");
  run("A1 정규화 형태만 다름 — 통과해야 한다", "intact", checkA1(a1NormRules(), a1NormSkill, AUDIT_SKILL_PATH));

  // --- A2 ------------------------------------------------------------------
  const bootstrapBroken = [
    "# 하네스 bootstrap",
    "",
    "## 순서",
    "",
    "1. 스택을 확정한다.",
    "2. 이미 있는 것을 읽는다.",
    "3. 인터뷰. `references/interview.md`를 읽고 진행한다.",
    "4. Scaffold.",
    "",
    "## 다른 절",
    "",
    "여기서는 AskUserQuestion을 언급한다.",
    "",
  ].join("\n");
  run("A2 문자열이 다른 절에 있음", "broken", checkA2(bootstrapBroken));

  const bootstrapIntact = [
    "# 하네스 bootstrap",
    "",
    "## 순서",
    "",
    "1. 스택을 확정한다.",
    "2. 이미 있는 것을 읽는다.",
    "3. 인터뷰. `references/interview.md`를 AskUserQuestion으로 진행한다.",
    "4. Scaffold.",
    "",
  ].join("\n");
  run("A2 온전한 픽스처", "intact", checkA2(bootstrapIntact));

  // --- A3 --------------------------------------------------------------------
  const enforcedTable = ({ full, partial, none, unknown, includeUnknownRow = true } = {}) => {
    const rows = [
      "# 하네스 감사",
      "",
      "## 산문을 지우기 전에 지나는 관문",
      "",
      "| 상태 | 처리 | 표식 |",
      "| --- | --- | --- |",
      `| \`full\` | 문서에서 지운다 | ${full ?? "`[묻지 않음]`"} |`,
      `| \`partial\` | ${partial ?? "(a) 보고만 (b) 대체 줄로 교체"} | 선택지 2 |`,
      `| \`none\` | ${none ?? "(a) 보고만 (b) 도구로 옮긴다"} | 선택지 2 |`,
    ];
    if (includeUnknownRow) rows.push(`| \`unknown\` | 지우지 않는다 | ${unknown ?? "`[묻지 않음]`"} |`);
    rows.push("");
    return rows.join("\n");
  };

  run("A3 온전한 픽스처", "intact", checkA3(enforcedTable()));
  run("A3 unknown 행이 빠진 표", "broken", checkA3(enforcedTable({ includeUnknownRow: false })));
  run("A3 partial에 선택지 하나뿐인 표", "broken", checkA3(enforcedTable({ partial: "(a) 보고만" })));
  run("A3 full에 [묻지 않음]이 없는 표", "broken", checkA3(enforcedTable({ full: "문서에서 지운다" })));

  // --- A5 ----------------------------------------------------------------
  const a5Fixture = (itemCount) => {
    const rulesJson = { items: Array.from({ length: itemCount }, (_, i) => ({ id: `rule.${i}` })) };
    const principlesFiles = ["a.md", "b.md", "c.md", "d.md"];
    const testsFiles = ["verify-one.mjs", "verify-two.mjs"];
    const readme = [
      "# repo",
      "",
      "## 개발",
      "",
      "```",
      "node tests/verify-one.mjs   설치 불필요",
      "node tests/verify-two.mjs   설치 불필요",
      "```",
      "",
    ].join("\n");
    return { rulesJson, principlesFiles, testsFiles, readme };
  };
  {
    const f = a5Fixture(14);
    run("A5 온전한 픽스처", "intact", checkA5(f.rulesJson, f.principlesFiles, f.testsFiles, f.readme));
  }
  {
    const f = a5Fixture(13);
    run("A5 항목 13개짜리 rules.json", "broken", checkA5(f.rulesJson, f.principlesFiles, f.testsFiles, f.readme));
  }

  // --- B -------------------------------------------------------------------
  run("B 온전한 픽스처", "intact", checkB("# repo\n\n## 참조\n\n내용\n"));
  run("B ## 함정이 있는 CLAUDE.md", "broken", checkB("# repo\n\n## 함정\n\n뭔가 있다.\n"));

  // --- A4 규약 (B를 빌려서 시험한다) -----------------------------------------
  run(
    "A4 코드펜스 안의 문자열은 세지 않는다",
    "intact",
    checkB(["# repo", "", "예시:", "```", "## 함정", "```", "", "## 참조", "", "내용", ""].join("\n")),
  );
  run(
    "A4 HTML 주석 안의 문자열은 세지 않는다",
    "intact",
    checkB(["# repo", "", "<!--", "## 함정", "-->", "", "## 참조", "", "내용", ""].join("\n")),
  );

  return !failed;
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  process.exit(runSelfTest() ? 0 : 1);
} else {
  process.exit(runReal() ? 0 : 1);
}
