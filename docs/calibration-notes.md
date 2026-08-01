# Calibration notes (not wired)

Generation-dependent observations with no consumer in any skill or script.
They are recorded here rather than in `calibration/` so that the calibration
files stay honest: everything in there is read by something.

If one of these acquires a consumer, move it into `calibration/claude-5.md`
with its source. Until then it is background reading.

| Axis | 2025 position [ECE] | 2026 position [NR]/[P5] |
| --- | --- | --- |
| Rule ↔ judgement dial | "right altitude" defined, mid-scale | moved far toward judgement |
| Reference complexity ceiling | file identifiers, metadata as signal | HTML artifacts, test suites, rubrics with verifier agents |
| Prompt formatting formality | "likely becoming less important" | not restated |
| Instruction position bias | — | older models favoured late instructions; no longer needed |
| Effective context budget | context rot stressed; bigger windows are not the answer | 1M window, consistent throughout |
| Effort defaults | — | low/medium liberally; re-run an effort sweep rather than carrying defaults over |
| Thinking-disabled artifacts | — | tool calls leaking as text, internal XML tags |

The last two are prompt-layer, not context-layer. They would belong to a
harness that owns its own system prompt, which this plugin does not.

Sources: `docs/references/01`, `02`, `04`.
