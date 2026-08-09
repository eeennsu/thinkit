#!/usr/bin/env node
// 하네스 검사. 모드는 둘이다.
//   --mode principles  세대 무관 항목만 (대상 레포에 심어지는 것이 이것이다)
//   --mode full        캘리브레이션 항목을 더하고, calibration/에 비추어 해석한다
//
// 찾은 것을 전부 보고하고 심각도 순으로 정렬한다. 절대 필터링하지 않는다. 필터링은
// 읽는 사람의 패스다. 종료 코드가 1이 되는 것은 `error` 항목이 실패했을 때뿐이다.
//
// --fix는 기계적인 처치만 적용하고, 하나같이 더하기만 한다. 없는 제목, 등록되지 않은
// 스크립트, 심어진 그대로 바이트가 같은 파일. 산문은 절대 고치지 않는다. 누군가의
// CLAUDE.md에서 문장을 지우는 건 그쪽의 결정이고, 보고서는 그 결정에 필요한 것을 준다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const SEV = { error: 0, warn: 1, info: 2 };
// 정렬만으로는 심각도가 보이지 않는다. 발견이 스무 줄이면 error와 warn의 경계가 어디인지
// 읽는 사람이 세어야 하고, 그 경계는 종료 코드를 가르는 선이다. 표식은 그 선을 눈에
// 보이게 할 뿐 판정을 바꾸지 않는다 - `[error]` 태그는 그대로 남는다. grep하는 쪽이 있다.
const MARK = { error: "🔴", warn: "🟠", info: "🔵" };
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const mode = opt("mode", "full");
const target = resolve(opt("target", process.cwd()));
const json = args.includes("--json");
const fix = args.includes("--fix");
const here = dirname(fileURLToPath(import.meta.url));

// 심어진 사본은 자기 규칙 집합 옆에 앉아 있고 위에 플러그인이 없다. 어떤 수리가
// 가능한지를 그 차이가 정한다. 낡은 심어진 파일을 갱신하려면 정본 내용이 필요하고,
// 그것은 플러그인만 가지고 있다.
const isPlantedCopy = existsSync(join(here, "rules.principles.json"));
const pluginRoot = isPlantedCopy ? null : join(here, "..");

// 알 수 없는 모드가 예전엔 그냥 돌았다. `principles`는 이름으로 검사하고 나머지는
// 캘리브레이션 분기로 흘러갔는데, 거기서 null 캘리브레이션이 기계 판정이 아니면서
// principle 축인 규칙을 전부 건너뛰었다. --mode 오타가 대부분 돌지 않은 검사의
// 짧고 깨끗한 보고서를 만들어냈다.
const MODES = ["principles", "full"];
if (!MODES.includes(mode)) {
  console.error(`--mode ${mode}: 모르는 모드다. ${MODES.join(", ")} 중 하나를 쓴다.`);
  process.exit(2);
}

// 기본 모드는 `full`인데, 심어진 사본은 캘리브레이션 규칙도 그것을 해석할
// lib/calibration.mjs도 지니지 않는다. 그렇게 돌리면 ERR_MODULE_NOT_FOUND로 죽었다 —
// 사용법 오류에 스택 트레이스를, 그것도 손으로 부를 가능성이 가장 높은 사본에서.
if (isPlantedCopy && mode !== "principles") {
  console.error(`--mode ${mode}: 이것은 심어진 사본이고, 세대 무관 규칙만 지닌다.`);
  console.error("--mode principles로 돌리거나, --mode full은 플러그인 자신의 scripts/check.mjs로 돌린다.");
  process.exit(2);
}

// 우리 것이 아닌 레포 파일. 그것이 깨져 있는 건 체커의 크래시가 아니라 레포에 대한
// 발견이다. 스택 트레이스로 종료하면 소유자는 여전히 검사 가능했던 나머지 열두 규칙에
// 대해 아무것도 듣지 못한다.
function parseJson(raw, label) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: `${label}이(가) 올바른 JSON이 아니다: ${e.message}` };
  }
}

function rulesPath() {
  const planted = join(here, "rules.principles.json");
  return existsSync(planted) ? planted : join(here, "..", "principles", "rules.json");
}
const rules = JSON.parse(readFileSync(rulesPath(), "utf8"));
const findings = [];

// `ask` 처치를 받은 규칙이 여기 앉는다. 값이 있는 동안만 채워지고, 규칙마다 초기화된다.
//
// 침묵시키지 않는 이유는 `drop`과 구별해야 하기 때문이다. 판정을 소유자에게 넘긴 것과
// 규칙이 은퇴한 것은 다른 상태이고, 둘을 같은 모양으로 내보내면 감사가 무엇을 안 했는지
// 읽는 사람이 알 수 없다.
//
// 심각도는 선언값 그대로 나간다. 예전엔 info로 내렸는데, 그 처치는 얻는 것 없이 잃기만
// 했다 — 종료 코드에서 빼는 일은 아래 `failed`의 `!f.deferred`가 이미 하고, 심각도를
// 내리면 `review.cutoff-instruction`처럼 error로 선언된 규칙이 보고서 맨 아래 파란 줄로
// 내려앉는다. 표식은 그 선을 보이게 할 뿐 판정을 바꾸지 않는다는 위쪽 불변식이 깨진다.
let deferral = null;
const add = (rule, severity, message, extra = {}) => {
  // 최후 방어선. 자리표시자가 남은 질문은 어떤 경로로도 나가면 안 된다 — 소유자는 그것을
  // 완성된 질문으로 알고 답한다. 위쪽 렌더 경로가 전부 막혔더라도 여기서 한 번 더 본다.
  // 이것은 레포에 대한 판정이 아니라 우리 규칙 선언의 결함이므로, 구현 누락과 같은 모양의
  // error를 내고 발견 대신 그것을 싣는다.
  if (typeof extra.asks === "string" && extra.asks.includes("{{")) {
    findings.push({
      id: rule.id,
      severity: "error",
      decidable: rule.decidable,
      message: `질문에 채우지 못한 자리표시자가 남아 있다: ${extra.asks}. 반쪽 질문은 내보내지 않았다.`,
      unrendered: true,
    });
    return;
  }
  findings.push({
    id: rule.id,
    severity,
    decidable: rule.decidable,
    message: deferral ? `${message} 판정은 소유자에게 넘긴다: ${deferral}.` : message,
    ...(deferral ? { deferred: true } : {}),
    ...extra,
  });
};

const readIf = (p) => (existsSync(join(target, p)) ? readFileSync(join(target, p), "utf8") : null);

// CLAUDE.md는 한 줄짜리면서도 10킬로바이트의 지시를 실어 나를 수 있다. `@AGENTS.md`는
// import이고 모델은 그것이 가리키는 것을 읽는다. 펼치지 않은 파일을 감사하면 하네스가
// 아니라 포인터를 판정하게 된다 — CLAUDE.md 전체가 `@AGENTS.md`인 레포가 3토큰으로
// 측정됐고, 산문을 읽는 규칙(repo-visible, 메모리 로그, 절대 규칙)은 전부 산문이 없는
// 파일에 대고 돌아 보고할 것을 찾지 못했다.
//
// 코드펜스 블록은 건너뛴다. 예시로 보여준 `@path`는 import가 아니라 문서다. 깊이에
// 상한이 있고 경로마다 한 번만 펼치므로, 서로를 import하는 파일 쌍은 메모리를 채우는
// 대신 종료한다.
function expandImports(text, seen = new Set(), depth = 0) {
  if (depth > 5) return text;
  const fences = [];
  const masked = text.replace(/```[\s\S]*?```/g, (m) => `\0${fences.push(m) - 1}\0`);
  const expanded = masked.replace(/(^|\s)@([\w.][\w./-]*)/g, (whole, lead, rel) => {
    if (rel.includes("..") || seen.has(rel)) return whole;
    const body = readIf(rel);
    if (body === null) return whole;
    seen.add(rel);
    return `${lead}${expandImports(body, seen, depth + 1)}`;
  });
  return expanded.replace(/\0(\d+)\0/g, (_, i) => fences[Number(i)]);
}

// raw는 디스크에 있는 것이자 --fix가 되쓸 수 있는 것이고, expanded는 모델이 실제로
// 읽는 것이자 산문 규칙과 토큰 개수가 판정하는 것이다.
const claudeMdRaw = readIf("CLAUDE.md");
const claudeMd = claudeMdRaw === null ? null : expandImports(claudeMdRaw);

// 하네스 산문이 실제로 사는 파일. CLAUDE.md가 import 하나뿐인 포인터면 규칙도 함정도
// 그 import된 파일에 있고, 포인터에 제목을 더하면 그 제목은 자기가 속한 문서와 다른
// 파일에 홀로 앉는다 — 함정을 쓰려고 여는 파일은 AGENTS.md 쪽이다.
//
// import가 여럿이거나 CLAUDE.md가 자기 산문을 가지고 있으면 어느 쪽인지 우리가 알 수
// 없다. 그때는 CLAUDE.md에 남긴다. 모르면서 남의 파일을 고르지 않는다.
function proseFile(raw) {
  if (raw === null) return null;
  const seen = new Set();
  const rest = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/(^|\s)@([\w.][\w./-]*)/g, (whole, lead, rel) => {
      if (rel.includes("..") || readIf(rel) === null) return whole;
      seen.add(rel);
      return lead;
    });
  if (seen.size !== 1 || rest.trim()) return "CLAUDE.md";
  return [...seen][0];
}

const machine = {
  "claude-md.exists": (rule) => {
    if (claudeMd === null) add(rule, rule.severity, "CLAUDE.md이 없다.");
  },
  "claude-md.gotcha-section": (rule) => {
    if (claudeMd === null) return;
    // 두 밴드다. 제목이 아예 없는 것과, 제목은 있는데 비어 있는 것. 둘의 심각도는 각각
    // rules.json이 정한다 - 여기서 고정하면 선언과 구현이 갈라지고, 갈라진 쪽을 읽은
    // 사람은 자기가 못 본 값을 믿는다.
    if (!/^##\s+함정\s*$/m.test(claudeMd)) {
      add(rule, rule.severity, "함정 섹션이 없다.");
      return;
    }
    const body = claudeMd.split(/^##\s+함정\s*$/m)[1] ?? "";
    const text = body.replace(/<!--[\s\S]*?-->/g, "").split(/^##\s/m)[0].trim();
    if (!text) add(rule, rule.audit.empty.severity, rule.audit.empty.message);
  },
  "claude-md.repo-visible.structural": (rule) => {
    if (claudeMd === null) return;
    const hits = [];
    for (const block of claudeMd.match(/```[\s\S]*?```/g) ?? []) {
      if (/[├└│]──/.test(block)) hits.push("코드펜스 블록 안의 디렉터리 트리");
    }
    // 임계값 5와 3에는 1차 소스가 없다. 지어내지 않고 지우지도 않되, 발견 줄이 그것을
    // 말한다 - 숫자가 근거처럼 읽히면 안 된다. `claude_md_budget`과 같은 처치다.
    const pathish = (claudeMd.match(/^\s*[-*]?\s*[\w.@/-]+\/[\w.@/-]+\s*$/gm) ?? []).length;
    if (pathish >= 5) hits.push(`경로형 줄 ${pathish}개 (임계값 5는 휴리스틱이다)`);
    if (/\.(ts|tsx|js|jsx)\b.*\.(ts|tsx|js|jsx)\b.*\.(ts|tsx|js|jsx)\b/.test(claudeMd))
      hits.push("확장자 나열 (연속 3개 기준은 휴리스틱이다)");
    for (const h of hits) add(rule, rule.severity, `repo-visible로 읽힌다: ${h}.`);
  },
  "safety.declared-boundaries-present": (rule) => {
    const manifest = readIf(".claude/harness/manifest.json");
    if (!manifest) return;
    const parsed = parseJson(manifest, ".claude/harness/manifest.json");
    if (!parsed.ok) {
      add(rule, rule.severity, `${parsed.error} 설정 때 무엇이 선언됐는지 읽을 수 없으므로 이 규칙은 돌지 못했다.`);
      return;
    }
    const declared = parsed.value.declared?.safetyBoundaries;
    if (!declared) return;
    if (claudeMd && !/^##\s+안전 경계\s*$/m.test(claudeMd))
      add(rule, rule.severity, "설정 때 안전 경계가 선언됐는데 그 섹션이 사라졌다.");
  },
  "harness.check-registered": (rule) => {
    // 하네스가 실제로 심어진 레포로 범위를 좁힌다. 다른 곳에는 등록할 체커가 없고
    // 이 발견은 잡음이 된다.
    if (!readIf(".claude/harness/manifest.json")) return;
    const pkg = readIf("package.json");
    // 등록될 자리가 없는 심어진 체커는 절대 돌지 않고, 그것은 체커가 없는 것과 같은
    // 결과다. package.json이 없다고 일찍 반환하면 그 레포가 깨끗하다고 보고됐다.
    if (!pkg) {
      add(rule, rule.severity, "하네스는 심어졌는데 package.json이 없다. 체커가 어디에도 등록되지 않았고 절대 돌지 않는다.");
      return;
    }
    const parsed = parseJson(pkg, "package.json");
    if (!parsed.ok) {
      add(rule, rule.severity, `${parsed.error} npm이 읽을 수 없는 package.json은 아무것도 등록하지 않는다.`);
      return;
    }
    if (!parsed.value.scripts?.["harness:check"])
      add(rule, rule.severity, 'package.json에 "harness:check" 스크립트가 없다.');
  },
  "claude-md.budget": (rule, cal) => {
    if (claudeMd === null) return;
    const tokens = Math.round(claudeMd.length / 4);
    if (!cal.set) {
      add(rule, "info", `CLAUDE.md은 약 ${tokens}토큰이다. 판정하지 않음: ${cal.reason}`, {
        dropped: true,
        measured: tokens,
      });
      return;
    }
    if (tokens > cal.value) add(rule, rule.severity, `CLAUDE.md은 약 ${tokens}토큰으로 ${cal.value}를 넘는다.`);
  },
};

let calibration = null;
if (mode === "full") {
  const { loadCalibration, get } = await import("./lib/calibration.mjs");
  const cal = loadCalibration(join(here, ".."));
  calibration = { cal, get };
}

// 처치 어휘. `on_value`와 `on_unset`이 같은 셋을 쓴다.
//   keep  규칙이 그대로 돈다
//   drop  탈락. 이유와 함께 info로 보고한다 — 안 돈 검사가 통과한 검사처럼 보이면 안 된다
//   ask   발견은 선언된 심각도 그대로 내되 판정은 소유자에게 넘긴다 (deferred: true)
const TREATMENTS = ["keep", "drop", "ask"];

// 규칙 선언 자체의 결함. 레포에 대한 판정이 아니라 우리 파일의 결함이므로, 구현이 없는
// 기계 규칙과 같은 처치를 받는다 — error로 드러내고 그 규칙은 돌지 않는다.
//
// `on_value`는 `valueTreatment`가 이미 검증하는데 `on_unset`은 아무도 보지 않았다. 계약이
// 광고하는 어휘를 오타 하나로 벗어나면 조용히 "처치 없음"이 되고, 그 규칙은 값이 없는
// 세대에서 탈락도 질문도 하지 않은 채 렌더되지 못한 질문을 싣고 나갔다.
//
// 기계 규칙에 `asks`나 `on_value`가 붙는 것도 같은 모양의 침묵이다. 기계 발견에는 질문이
// 실리지 않으므로 `asks`는 어디로도 나가지 않고, 값이 있을 때 무엇을 보고할지는 그 구현이
// 알고 있으므로 `on_value`가 여기서 가로채면 그 보고가 사라진다.
function declarationError(rule) {
  if (rule.axis === "calibrated" && !TREATMENTS.includes(rule.on_unset))
    return `on_unset이 모르는 처치를 지목한다: ${JSON.stringify(rule.on_unset) ?? "없음"}. 처치는 ${TREATMENTS.join(", ")}뿐이다. 판정하지 않았다.`;
  if (rule.decidable === "machine" && rule.audit?.asks !== undefined)
    return "기계 판정으로 선언됐는데 audit.asks를 지닌다. 기계 발견에는 질문이 실리지 않으므로 이 질문은 어디로도 나가지 않는다.";
  if (rule.decidable === "machine" && rule.on_value !== undefined)
    return "기계 판정으로 선언됐는데 on_value를 지닌다. 값이 있을 때 무엇을 보고할지는 그 구현이 소유한다.";
  return null;
}

// 캘리브레이션 값에서 처치를 뽑는다. `on_value_key`는 `value` 객체의 어느 하위 키를 볼지
// 지목하고, 없으면 값 자체를 키로 쓴다.
//
// 매핑되지 않은 값을 조용히 통과시키지 않는다. 그렇게 하면 규칙은 자기가 모르는 세대에서
// 자기가 아는 세대인 척 돌고, 그 판정은 근거 없이 나온 판정이다. 이 레포가 machine 규칙에
// 구현이 없을 때 하는 것과 같은 처치를 한다 — error로 드러낸다.
function valueTreatment(rule, calValue) {
  const key = rule.on_value_key;
  const label = key === undefined ? rule.calibrated_by : `${rule.calibrated_by}.${key}`;
  const raw = key === undefined ? calValue.value : calValue.value?.[key];
  if (raw === null || typeof raw === "object" || typeof raw === "undefined")
    return {
      error: `캘리브레이션이 이 규칙이 모르는 값을 준다: ${label} = ${JSON.stringify(raw) ?? "없음"}. on_value는 문자열 하나를 기대한다. 판정하지 않았다.`,
    };
  const treatment = rule.on_value[String(raw)];
  if (treatment === undefined)
    return {
      error: `캘리브레이션이 이 규칙이 모르는 값을 준다: ${label} = ${JSON.stringify(raw)}. on_value가 아는 값은 ${Object.keys(rule.on_value).join(", ")}뿐이다. 판정하지 않았다.`,
    };
  if (!TREATMENTS.includes(treatment))
    return {
      error: `on_value가 모르는 처치를 지목한다: ${label} = ${JSON.stringify(raw)} -> "${treatment}". 처치는 ${TREATMENTS.join(", ")}뿐이다. 판정하지 않았다.`,
    };
  return { treatment, label, raw };
}

// asks 문장의 세대 의존 부분은 캘리브레이션에서 렌더한다. `{{키}}`는 그 값의 `value`,
// `{{키.필드}}`는 그 항목의 다른 필드(`phrases`, `wide_axes`)를 가리킨다.
//
// 자리표시자를 채우지 못하면 문자열을 그대로 두고 못 채운 것을 돌려준다. 반쪽으로 나간
// 질문은 없는 질문보다 나쁘다 — 소유자는 그것이 완성된 질문인 줄 알고 답한다. 호출부가
// 그 경우를 unset과 같이 다룬다.
// 정규식이 `\w`(ASCII)만 받던 적이 있다. 이 레포의 산문이 한국어라 `{{모델기본값}}` 같은
// 키가 나오면 아예 매칭되지 않았고, 매칭되지 않은 자리표시자는 `missing`에도 오르지 못한 채
// 원본 그대로 소유자에게 나갔다 — 탐지 경로가 없는 누출이다.
function renderAsks(text, cal, get) {
  const missing = [];
  const rendered = text.replace(/\{\{([\p{L}\p{N}_.-]+)\}\}/gu, (whole, ref) => {
    const parts = ref.split(".");
    // 조각이 셋 이상이면 앞의 둘만 쓰고 나머지를 버리게 된다. 버려진 조각은 실패가 아니라
    // 조용한 오답이 되고, 그건 반쪽 질문보다 나쁘다 — 완전해 보이는데 틀린 질문이다.
    if (parts.length > 2) {
      missing.push(`${ref} (자리표시자는 키 하나와 필드 하나만 받는다)`);
      return whole;
    }
    const [key, field] = parts;
    const entry = get(cal, key);
    if (!entry.set) {
      missing.push(`${ref} (${entry.reason})`);
      return whole;
    }
    const v = field ? entry[field] : entry.value;
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) {
      missing.push(`${ref} (선택된 캘리브레이션의 ${key}에 ${field ?? "value"}가 없다)`);
      return whole;
    }
    // `wide_axes`처럼 `value`의 키 이름을 부르는 목록은 그대로 내면 질문 한가운데에
    // snake_case가 앉는다. 그 항목이 표시명을 지니면 그것으로 바꾼다 — 멤버십은 `value`가
    // 소유하고 `labels`는 이름만 대므로, 둘이 갈라져도 판정은 움직이지 않는다.
    if (Array.isArray(v)) return v.map((el) => entry.labels?.[el] ?? el).join(", ");
    return String(v);
  });
  return { rendered, missing };
}

for (const rule of rules.items) {
  if (mode === "principles" && rule.axis !== "principle") continue;
  deferral = null;
  const misdeclared = declarationError(rule);
  if (misdeclared) {
    add(rule, "error", misdeclared, { misdeclared: true });
    continue;
  }
  let calValue = { set: false, reason: "principles 모드에서는 캘리브레이션 항목을 평가하지 않는다" };
  let asks = rule.audit?.asks;
  if (rule.axis === "calibrated") {
    if (!calibration) continue;
    calValue = calibration.get(calibration.cal, rule.calibrated_by);

    // 자리표시자를 못 채운 질문은 값이 없는 것과 같이 다룬다. 채울 값이 없는데도 질문을
    // 내보내면 세대가 바뀐 자리에서 거짓 질문이 나간다.
    let unresolved = null;
    if (asks) {
      const r = renderAsks(asks, calibration.cal, calibration.get);
      if (r.missing.length) unresolved = `질문의 자리표시자를 채울 값이 없다: ${r.missing.join("; ")}`;
      else asks = r.rendered;
    }

    // 값이 없는 경로. `on_unset`이 정하고, 계약이 광고하는 두 처치를 모두 구현한다.
    // 기계 규칙은 여기로 떨어지지 않는다 — 값이 없을 때 무엇을 보고할지는 그 구현이
    // 알고 있고(claude-md.budget은 토큰 수를 여전히 보고한다), 여기서 가로채면 그
    // 보고가 사라진다.
    if (!calValue.set || unresolved) {
      const reason = calValue.set ? unresolved : calValue.reason;
      if (rule.decidable === "judgement" && rule.on_unset === "drop") {
        add(rule, "info", `탈락: ${reason}`, { dropped: true });
        continue;
      }
      if (rule.decidable === "judgement" && rule.on_unset === "ask") deferral = reason;
    } else if (rule.on_value && rule.decidable === "judgement") {
      // 값이 있는 경로. `on_value`가 없는 규칙은 여기 들어오지 않고 예전과 똑같이 돈다.
      //
      // `judgement` 가드는 위 unset 분기와 같은 불변식이다 — 기계 규칙의 보고는 그 구현이
      // 소유하고 여기서 가로채지 않는다. 기계 규칙에 `on_value`가 붙는 것 자체는
      // `declarationError`가 error로 드러내므로, 이 가드가 삼키는 선언은 없다.
      const v = valueTreatment(rule, calValue);
      if (v.error) {
        add(rule, "error", v.error, { unmapped: true });
        continue;
      }
      if (v.treatment === "drop") {
        add(rule, "info", `탈락: 캘리브레이션이 ${v.label} = ${JSON.stringify(v.raw)}라고 답한다. 이 값에서 이 규칙은 돌지 않는다.`, {
          dropped: true,
        });
        continue;
      }
      if (v.treatment === "ask") deferral = `캘리브레이션이 ${v.label} = ${JSON.stringify(v.raw)}라고 답한다`;
    }
  }
  if (rule.decidable === "machine") {
    // 구현이 없는 기계 규칙은 아무것도 내놓지 않았고, 아무것도 내놓지 않는 것은
    // 통과한 규칙이 내놓는 것과 정확히 같다. 여기서의 침묵은 이 플러그인이 다른
    // 레포에서 감사하는 바로 그 실패 양식이다. 돌지 않은 검사가 통과한 검사처럼
    // 보이면 안 된다.
    if (!machine[rule.id]) {
      // 구현 누락은 레포에 대한 판정이 아니라 체커 자신의 결함이다. 소유자에게 넘길
      // 판정이 없으므로 ask 처치로 낮추지 않는다.
      deferral = null;
      add(rule, "error", `기계 판정으로 선언됐는데 "${rule.id}"에 대한 검사가 구현되어 있지 않다. 돌지 않았다.`, { unimplemented: true });
      continue;
    }
    machine[rule.id](rule, calValue);
  } else {
    add(rule, rule.severity, `판단 항목. 루브릭: ${rule.rubric}`, {
      pending: true,
      asks,
      phrases: calValue.set ? calValue.phrases : undefined,
    });
  }
}
deferral = null;

// 지금 판정에 쓰인 세대. 축 이름 -> 세대 이름이고, `--mode principles`에는 없다 —
// 그 모드는 캘리브레이션을 아예 읽지 않으므로 세대를 댈 수 없고, 없는 것을 적으면
// 심어진 사본의 출력이 자기가 하지 않은 판정을 주장하게 된다.
const generation = calibration ? calibration.cal._selected : null;

// 세운 시점의 세대와 지금 세대를 맞춰 본다. 상태만 보고한다 — 무엇을 고칠지는 나머지
// 발견들이 이미 말하고, 여기서 지시를 더하면 같은 말이 두 곳에서 나온다.
//
// 세대 기록이 없는 매니페스트는 unknown이고 아무것도 내지 않는다. 지금 배포된 매니페스트는
// 전부 그 상태이고, 없는 것을 "다른 세대"로 읽으면 기존 레포 전부가 거짓 발견을 받는다.
//
// 발견이 아니다. `findings`에 사는 것은 레포가 자기 하네스에 대해 고칠 수 있는 판정이고,
// 이것은 우리 기준선이 움직였다는 우리 쪽 사실이다 — 심어진 파일 상태를 [planted]로,
// 세대를 [calibration]으로 내보내는 것과 같은 채널에 앉는다. 한동안 `findings`에 있었는데,
// 그러면 `rules.json`에 없는 id가 발견 배열에 섞이고 세대를 옮긴 직후 모든 레포의 발견 수가
// 하나씩 늘었다 — 레포가 고칠 수 없는 것 하나가 고칠 것들의 개수에 실린 것이다.
//
// 축은 양쪽의 합집합에서 돈다. 지금 index.json에 있는 축에서만 출발하면, 매니페스트에
// 기록된 축이 나중에 index.json에서 사라졌을 때 그 축의 드리프트를 영영 보고하지 않는다.
let generationDrift = null;
if (mode === "full" && generation) {
  const raw = readIf(".claude/harness/manifest.json");
  const parsed = raw === null ? null : parseJson(raw, ".claude/harness/manifest.json");
  const built = parsed?.ok ? parsed.value.generation : null;
  if (built && typeof built === "object") {
    const axes = new Set([...Object.keys(generation), ...Object.keys(built)]);
    const moved = [...axes]
      .filter((axis) => built[axis] && built[axis] !== generation[axis])
      .map((axis) => ({ axis, built: built[axis], now: generation[axis] ?? null }));
    if (moved.length) generationDrift = moved;
  }
}

// 플러그인이 오늘 심을 내용. 그것에 답할 수 있는 것은 플러그인 사본뿐이므로 `outdated`는
// 그쪽만 도달할 수 있는 판정이다. 심어진 사본은 플러그인이 앞서 나갔는지 알 방법이 없고,
// 거기서 `current`라고 추측하는 것은 참인 답이 아니라 안심시키는 답이다.
const plantLib = pluginRoot ? await import("./lib/planted.mjs") : null;
const canonicalVersion = plantLib ? plantLib.plantedFiles(pluginRoot).version : null;

// 대상 레포에서 지금 강제되고 있는 것. 삭제 처치의 관문이고, 삭제하지 않을 때도
// 보고한다 — 판단 항목을 판정하는 쪽이 "린터가 대신할 수 있다"를 확인 없이 말하는 것이
// 이 감사가 다른 레포에서 지적하는 실패와 같은 모양이기 때문이다.
const enforcement = pluginRoot ? (await import("./lib/enforced.mjs")).readEnforcement(target) : null;

// 심어진 사본: 스킬이 보고하는 것과 같은 세 상태 비교.
function plantedState() {
  const manifestPath = join(target, ".claude/harness/manifest.json");
  if (!existsSync(manifestPath)) return null;
  const parsed = parseJson(readFileSync(manifestPath, "utf8"), ".claude/harness/manifest.json");
  if (!parsed.ok) return [{ path: ".claude/harness/manifest.json", state: "unreadable", advice: parsed.error }];
  const manifest = parsed.value;
  if (!Array.isArray(manifest.files))
    return [{ path: ".claude/harness/manifest.json", state: "unreadable", advice: "files[] 배열이 없다. 무엇이 심어졌는지 아무것도 기록하지 않는다" }];
  const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);
  return manifest.files.map((f) => {
    const p = join(target, f.path);
    if (!existsSync(p)) return { path: f.path, state: "missing" };
    const now = sha(p);
    if (now !== f.sha256) return { path: f.path, state: "edited-locally", advice: "손으로 병합한다. 덮어쓰지 않는다" };
    if (canonicalVersion === null)
      return { path: f.path, state: "current", advice: "심긴 뒤로 바뀌지 않았다. 플러그인이 앞서 나갔는지는 여기서 확인할 수 없다" };
    if (manifest.version !== canonicalVersion) return { path: f.path, state: "outdated", advice: "다시 생성한다" };
    return { path: f.path, state: "current" };
  });
}

let planted = plantedState();

// 기계적 처치. 각각은 부재가 의견이 아니라 사실인 것을 되돌린다. 판단이 필요한 것은
// 사람을 위해 보고서에 남는다.
const fixed = [];
const notes = [];
if (fix) {
  const write = (rel, content) => writeFileSync(join(target, rel), content, "utf8");

  // 빠진 제목을 산문이 사는 파일 끝에 더한다.
  //
  // 펼친 파일이 아니라 raw 파일에 쓴다. 펼친 쪽에 덧붙이면 import된 모든 파일을
  // import한 쪽에 인라인해 놓고 그것을 수리라고 부르게 된다. 어느 raw 파일인지는
  // proseFile이 정한다 — 포인터가 아니라 산문이 사는 쪽이다.
  //
  // 매번 디스크에서 다시 읽는다. 제목이 둘 다 빠져 있으면 두 번 불리고, 메모리에 든
  // 앞선 내용에 덧붙이면 먼저 쓴 제목을 지운다.
  const appendHeading = (heading) => {
    const file = proseFile(readIf("CLAUDE.md"));
    const head = readIf(file).replace(/\s*$/, "");
    write(file, head ? `${head}\n\n${heading}\n` : `${heading}\n`);
    return file;
  };

  if (claudeMdRaw !== null && !/^##\s+함정\s*$/m.test(claudeMd))
    fixed.push(`${appendHeading("## 함정")}: 빠진 함정 제목을 더했다 (일부러 비워 둠)`);

  // 같은 모양의 처치. 설정 때 안전 경계가 선언됐는데 섹션이 사라진 경우다.
  //
  // 제목만 되살리고 내용은 채우지 않는다. 매니페스트에 선언이 남아 있으니 그것을 도로
  // 펼칠 수도 있지만, 그러면 소유자가 일부러 지운 경계가 되살아난다. 그건 수리가 아니라
  // 되돌리기고, 감사가 내릴 판단이 아니다. 빈 제목과 발견을 남기면 소유자가 정한다.
  const manifestRaw = readIf(".claude/harness/manifest.json");
  const manifestParsed = manifestRaw === null ? null : parseJson(manifestRaw, ".claude/harness/manifest.json");
  if (
    claudeMdRaw !== null &&
    manifestParsed?.ok &&
    manifestParsed.value.declared?.safetyBoundaries &&
    !/^##\s+안전 경계\s*$/m.test(claudeMd)
  )
    fixed.push(`${appendHeading("## 안전 경계")}: 빠진 안전 경계 제목을 더했다 (일부러 비워 둠)`);

  // 디렉터리 트리를 지운다. 이것이 유일하게 기계가 혼자 내려도 되는 삭제인 이유는,
  // 판정에 레포의 의도가 들어가지 않기 때문이다. 트리는 규칙이 아니라 파일 시스템에
  // 대한 서술이고, `ls` 한 번이 더 정확한 답을 더 싸게 내놓는다. 무엇이 강제되는지
  // 물을 것도 없다 — 강제할 것이 없다.
  //
  // 펜스만 지우고 그 위의 제목과 문장은 남긴다. 트리 옆에 붙은 산문은 보통 규칙이고
  // (의존은 한 방향으로 흐른다), 규칙을 지우는 것은 도구가 그것을 맡았는지 확인한
  // 뒤에만 할 수 있다. 그 확인은 판단 패스의 몫이다.
  const treeFile = proseFile(claudeMdRaw);
  if (treeFile) {
    const before = readIf(treeFile) ?? "";
    let removed = 0;
    const after = before
      .replace(/```[\s\S]*?```\n?/g, (m) => {
        if (!/[├└│]──/.test(m)) return m;
        removed++;
        return "";
      })
      .replace(/\n{3,}/g, "\n\n");
    if (removed) {
      write(treeFile, after);
      const lines = before.split("\n").length - after.split("\n").length;
      fixed.push(`${treeFile}: 디렉터리 트리 ${removed}개를 지웠다 (${lines}줄). 파일 시스템이 이미 답한다`);
    }
  }

  const pkgRaw = readIf("package.json");
  // 규칙과 같은 방식으로 범위를 좁힌다. 심어진 체커가 없는 레포에 스크립트를 등록하면
  // 첫 실행에서 실패하는 명령을 쓰게 된다 — 발견했을 때보다 레포를 나쁘게 만드는 수리다.
  const havePlanted = Boolean(readIf(".claude/harness/manifest.json"));
  if (pkgRaw && havePlanted) {
    const parsed = parseJson(pkgRaw, "package.json");
    if (!parsed.ok) {
      notes.push(`${parsed.error} 건드리지 않았다. 읽지 못한 파일을 다시 쓰면 그 파일이 파괴된다.`);
    } else if (!parsed.value.scripts?.["harness:check"]) {
      const pkg = parsed.value;
      pkg.scripts = { ...pkg.scripts, "harness:check": "node .claude/harness/check.mjs --mode principles" };
      // 레포 자신의 포매팅이 살아남는다. 이유는 scaffold.mjs가 같은 일을 하는 자리에서
      // 대는 것과 같다. 누군가의 package.json을 다시 포매팅하면 키 하나 더하자고
      // 그 파일의 모든 줄이 diff에 올라간다.
      const indent = pkgRaw.match(/^[ \t]+(?=")/m)?.[0] ?? 2;
      write("package.json", JSON.stringify(pkg, null, indent) + (pkgRaw.endsWith("\n") ? "\n" : ""));
      fixed.push('package.json: "harness:check" 스크립트를 등록했다');
    }
  }

  // 심어진 그대로 바이트가 같은 파일만. `edited-locally`는 절대 건드리지 않는다.
  // 보고서가 그것을 드러내고 소유자가 병합한다.
  const stale = (planted ?? []).filter((p) => p.state === "outdated" || p.state === "missing");
  if (stale.length && plantLib) {
    const { plantedFiles, sha } = plantLib;
    const plant = plantedFiles(pluginRoot);
    const manifestPath = join(target, ".claude/harness/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    // 심어진 파일 목록은 매니페스트가 기록한 것보다 좁다. 매니페스트에는 scaffold가 쓴
    // 것이 전부 오르지만 `plantedFiles()`가 정본 내용을 지니는 것은 체커와 규칙 집합
    // 둘뿐이고, 나머지 — 린트 설정, tsconfig, 산문 — 는 스택과 답에서 생성된다.
    // 그것들을 여기서 되살릴 방법은 없다.
    const unfixable = [];
    for (const p of stale) {
      const canonical = plant.files.find((f) => f.path === p.path);
      if (!canonical) {
        unfixable.push(`${p.path} (${p.state})`);
        continue;
      }
      write(p.path, canonical.content);
      const entry = manifest.files.find((f) => f.path === p.path);
      entry.sha256 = sha(Buffer.from(canonical.content, "utf8"));
      fixed.push(`${p.path}: 플러그인에서 갱신했다 (이전 상태 ${p.state})`);
    }
    // 하나도 못 고쳤는데 버전을 찍으면 매니페스트가 최신이라고 말하고, 다음 실행은
    // 아직 없는 파일에 대해 `outdated`조차 내놓지 않는다. 실제로 쓴 것이 있을 때만 찍는다.
    if (fixed.length) {
      manifest.version = plant.version;
      write(".claude/harness/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
      planted = plantedState();
    }
    if (unfixable.length)
      notes.push(`이 스크립트가 되살릴 수 없다 - 스택과 답에서 생성되는 파일이다. bootstrap을 다시 돌린다: ${unfixable.join(", ")}`);
  } else if (stale.length) {
    notes.push(`심어진 파일 ${stale.length}개가 낡았다. 이것은 심어진 사본이라 정본 내용을 지니지 않는다 - 플러그인에서 bootstrap을 다시 돌린다.`);
  }
}

findings.sort((a, b) => SEV[a.severity] - SEV[b.severity]);

// 심어진 파일 상태 중 종료 코드에 들어가는 것 둘. 발견 목록이 아니라 여기 있는 이유는
// 이것이 규칙 판정이 아니라 하네스 자신이 온전한지의 문제이기 때문이다.
//
//   missing      심었다고 기록된 파일이 없다. 경계 설정이 통째로 사라진 레포가 이 상태로
//                exit 0을 받고 있었다 - 강제되던 규칙이 사라진 것을 통과로 보고했다.
//   unreadable   매니페스트를 읽지 못했다. 감사가 이 축에 대해 아무것도 답하지 못한
//                것이고, 돌지 않은 검사는 통과한 검사처럼 보이면 안 된다.
//
// `edited-locally`는 들어가지 않는다. 레포가 편집한 설정은 이제 레포의 답이고, 답을
// 가진 레포를 실패로 세우면 이 플러그인은 자기 출력을 강요하는 도구가 된다. 보고는
// 하지만 실패는 아니다. `outdated`도 아니다 - 플러그인이 앞서 나간 것은 레포의 결함이
// 아니고, 처치는 재생성이다.
const PLANTED_FAILS = new Set(["missing", "unreadable"]);
const plantedFailed = (planted ?? []).filter((p) => PLANTED_FAILS.has(p.state));
// `!f.deferred`는 명시적이다. 우리가 내리지 않은 판정이 종료 코드를 가르면 안 되는데,
// 오늘 deferral에 닿는 규칙이 전부 judgement라 `!f.pending`이 우연히 그것을 덮고 있었다.
// 기계 규칙이 그 처치를 받게 되는 날 우연은 끊긴다.
const failed =
  findings.some((f) => f.severity === "error" && !f.pending && !f.dropped && !f.deferred) || plantedFailed.length > 0;

if (json) {
  console.log(
    JSON.stringify({ mode, target, generation, generationDrift, findings, planted, enforcement, fixed: fix ? fixed : undefined, notes: fix ? notes : undefined }, null, 2),
  );
} else {
  for (const f of findings) console.log(`${MARK[f.severity]} [${f.severity}] ${f.id}: ${f.message}`);
  if (planted) for (const p of planted) console.log(`[planted] ${p.path}: ${p.state}${p.advice ? " - " + p.advice : ""}`);
  // 강제 상태는 발견이 아니다. 판단 패스가 "이건 린터가 맡는다"고 말하기 전에 확인할
  // 표이고, 확인 없는 그 주장이 이 감사가 남의 레포에서 지적하는 바로 그 실패다.
  if (enforcement)
    for (const [key, c] of Object.entries(enforcement.checks))
      console.log(`[enforced] ${key}: ${c.state}${c.where ? ` (${c.where.join(", ")})` : ""}${c.why ? ` - ${c.why}` : ""}`);
  // 어느 세대로 판정했는지. 발견 목록이 세대에 따라 달라지므로, 적지 않으면 같은 레포의
  // 두 보고서가 왜 다른지 읽는 사람이 알 수 없다.
  if (generation)
    for (const [axis, pick] of Object.entries(generation)) console.log(`[calibration] ${axis}: ${pick}`);
  // 드리프트도 같은 채널이다. 세대 줄 바로 옆에 있어야 "지금 무엇으로 판정했나"와 "무엇에
  // 비추어 세워졌나"를 한자리에서 읽는다.
  if (generationDrift)
    for (const d of generationDrift)
      console.log(`[calibration] drift: ${d.axis} — 세운 시점 ${d.built}, 지금 ${d.now ?? "그 축이 기준에 없다"}`);
  for (const f of fixed) console.log(`[fixed] ${f}`);
  for (const n of notes) console.log(`[note] ${n}`);
  console.log(`\n발견 ${findings.length}건 (판단이 필요한 것 ${findings.filter((f) => f.pending).length}건).`);
  // 발견이 0건인데 종료 코드가 1인 실행이 있다. 이유를 적지 않으면 읽는 사람이 통과한
  // 실행과 구별할 수 있는 것은 `echo $?`뿐이다.
  if (plantedFailed.length)
    console.log(`심어진 파일 ${plantedFailed.length}건이 실패다: ${plantedFailed.map((p) => `${p.path} (${p.state})`).join(", ")}`);
  if (fix) console.log(`${fixed.length}건 수리. 위 발견은 수리가 돌기 전에 측정한 것이고, 심어진 상태는 현재 값이다.`);
}
process.exit(failed ? 1 : 0);
