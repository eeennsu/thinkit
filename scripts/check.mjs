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
const add = (rule, severity, message, extra = {}) =>
  findings.push({ id: rule.id, severity, decidable: rule.decidable, message, ...extra });

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

const machine = {
  "claude-md.exists": (rule) => {
    if (claudeMd === null) add(rule, rule.severity, "CLAUDE.md이 없다.");
  },
  "claude-md.gotcha-section": (rule) => {
    if (claudeMd === null) return;
    if (!/^##\s+함정\s*$/m.test(claudeMd)) {
      add(rule, "warn", "함정 섹션이 없다.");
      return;
    }
    const body = claudeMd.split(/^##\s+함정\s*$/m)[1] ?? "";
    const text = body.replace(/<!--[\s\S]*?-->/g, "").split(/^##\s/m)[0].trim();
    if (!text) add(rule, "info", rule.audit.empty.message);
  },
  "claude-md.repo-visible.structural": (rule) => {
    if (claudeMd === null) return;
    const hits = [];
    for (const block of claudeMd.match(/```[\s\S]*?```/g) ?? []) {
      if (/[├└│]──/.test(block)) hits.push("코드펜스 블록 안의 디렉터리 트리");
    }
    const pathish = (claudeMd.match(/^\s*[-*]?\s*[\w.@/-]+\/[\w.@/-]+\s*$/gm) ?? []).length;
    if (pathish >= 5) hits.push(`경로형 줄 ${pathish}개`);
    if (/\.(ts|tsx|js|jsx)\b.*\.(ts|tsx|js|jsx)\b.*\.(ts|tsx|js|jsx)\b/.test(claudeMd))
      hits.push("확장자 나열");
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

for (const rule of rules.items) {
  if (mode === "principles" && rule.axis !== "principle") continue;
  let calValue = { set: false, reason: "principles 모드에서는 캘리브레이션 항목을 평가하지 않는다" };
  if (rule.axis === "calibrated") {
    if (!calibration) continue;
    calValue = calibration.get(calibration.cal, rule.calibrated_by);
    if (!calValue.set && rule.on_unset === "drop" && rule.decidable === "judgement") {
      add(rule, "info", `탈락: ${calValue.reason}`, { dropped: true });
      continue;
    }
  }
  if (rule.decidable === "machine") {
    // 구현이 없는 기계 규칙은 아무것도 내놓지 않았고, 아무것도 내놓지 않는 것은
    // 통과한 규칙이 내놓는 것과 정확히 같다. 여기서의 침묵은 이 플러그인이 다른
    // 레포에서 감사하는 바로 그 실패 양식이다. 돌지 않은 검사가 통과한 검사처럼
    // 보이면 안 된다.
    if (!machine[rule.id]) {
      add(rule, "error", `기계 판정으로 선언됐는데 "${rule.id}"에 대한 검사가 구현되어 있지 않다. 돌지 않았다.`, { unimplemented: true });
      continue;
    }
    machine[rule.id](rule, calValue);
  } else {
    add(rule, rule.severity, `판단 항목. 루브릭: ${rule.rubric}`, {
      pending: true,
      asks: rule.audit?.asks,
      phrases: calValue.set ? calValue.phrases : undefined,
    });
  }
}

// 플러그인이 오늘 심을 내용. 그것에 답할 수 있는 것은 플러그인 사본뿐이므로 `outdated`는
// 그쪽만 도달할 수 있는 판정이다. 심어진 사본은 플러그인이 앞서 나갔는지 알 방법이 없고,
// 거기서 `current`라고 추측하는 것은 참인 답이 아니라 안심시키는 답이다.
const plantLib = pluginRoot ? await import("./lib/planted.mjs") : null;
const canonicalVersion = plantLib ? plantLib.plantedFiles(pluginRoot).version : null;

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

  // 펼친 파일이 아니라 raw 파일에서 쓴다. 펼친 쪽에 덧붙이면 import된 모든 파일을
  // import한 쪽에 인라인해 놓고 그것을 수리라고 부르게 된다.
  if (claudeMdRaw !== null && !/^##\s+함정\s*$/m.test(claudeMd)) {
    write("CLAUDE.md", `${claudeMdRaw.replace(/\s*$/, "")}\n\n## 함정\n`);
    fixed.push("CLAUDE.md: 빠진 함정 제목을 더했다 (일부러 비워 둠)");
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
    for (const p of stale) {
      const canonical = plant.files.find((f) => f.path === p.path);
      if (!canonical) continue;
      write(p.path, canonical.content);
      const entry = manifest.files.find((f) => f.path === p.path);
      entry.sha256 = sha(Buffer.from(canonical.content, "utf8"));
      fixed.push(`${p.path}: 플러그인에서 갱신했다 (이전 상태 ${p.state})`);
    }
    manifest.version = plant.version;
    write(".claude/harness/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
    planted = plantedState();
  } else if (stale.length) {
    notes.push(`심어진 파일 ${stale.length}개가 낡았다. 이것은 심어진 사본이라 정본 내용을 지니지 않는다 - 플러그인에서 bootstrap을 다시 돌린다.`);
  }
}

findings.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
const failed = findings.some((f) => f.severity === "error" && !f.pending && !f.dropped);

if (json) {
  console.log(JSON.stringify({ mode, target, findings, planted, fixed: fix ? fixed : undefined, notes: fix ? notes : undefined }, null, 2));
} else {
  for (const f of findings) console.log(`[${f.severity}] ${f.id}: ${f.message}`);
  if (planted) for (const p of planted) console.log(`[planted] ${p.path}: ${p.state}${p.advice ? " - " + p.advice : ""}`);
  for (const f of fixed) console.log(`[fixed] ${f}`);
  for (const n of notes) console.log(`[note] ${n}`);
  console.log(`\n발견 ${findings.length}건 (판단이 필요한 것 ${findings.filter((f) => f.pending).length}건).`);
  if (fix) console.log(`${fixed.length}건 수리. 위 발견은 수리가 돌기 전에 측정한 것이고, 심어진 상태는 현재 값이다.`);
}
process.exit(failed ? 1 : 0);
