
# Calibration: Claude Code harness

```json
{
  "axis": "harness",
  "harness": "claude-code",
  "values": {
    "memory_location": {
      "value": "auto-memory",
      "note": "The harness saves memories itself; CLAUDE.md is not a memory store.",
      "source": "NR - Then: Memory in CLAUDE.md files / Now: Auto-memory"
    },
    "progressive_disclosure_mechanisms": {
      "value": ["skills", "deferred tool loading via ToolSearch", "@-mentioned references"],
      "source": "NR - Then: Put it all upfront / Now: Use progressive disclosure"
    },
    "rightsizing_tool": {
      "value": "claude doctor",
      "source": "NR - Try simplifying"
    }
  }
}
```

Separate axis from the model generation. These values depend on which harness
the repo is driven by, not on which model is behind it. The same Opus 5 in a
different harness has no `/doctor`, no auto-memory, and no ToolSearch.

Kept apart so that a new model generation does not silently claim new product
features, and a new harness version does not look like a model change.

Consumed by `claude-md.memory-log` (a memory log in CLAUDE.md is a finding
only when the harness has somewhere else to put it).
