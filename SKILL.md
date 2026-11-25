---
name: perf-xray
description: >
  Performance workbench with GitHub Actions YAML flamegraph parser, PostgreSQL EXPLAIN drift & index advisor, and p50/p95/p99 CI benchmark gate + PR table export.
license: MIT
---

# perf-xray

Pinpoints slow CI workflow steps, visualizes Postgres query planner regressions with index suggestions, and enforces latency gates.

- **Live Interactive Workbench:** https://omakasekim.github.io/perf-xray/
- **Repository:** https://github.com/omakasekim/perf-xray
- **Category:** Performance & SQL · **Deliverable:** Web Workbench
- **Ecosystems:** `github-actions`, `postgresql`, `benchmarks`
- **Stack:** React, TypeScript, Flamegraph, SQL EXPLAIN

## When to Use This Skill
Invoke `perf-xray` whenever the user wants to analyze, debug, simulate, or visualize workflows related to **Performance & SQL** (github-actions, postgresql, benchmarks).

## Modes & Capabilities
- **CI Actions Flamegraph**
- **SQL EXPLAIN Flow**
- **Benchmark CI Gate**

## Operating Workflow
1. **Local CLI / Companion Execution:**
   ```bash
   npm run dev
   ```
   Launch the GitHub Actions YAML flamegraph analyzer, PostgreSQL EXPLAIN drift & index advisor, and p50/p95/p99 CI benchmark gate.
2. **Interactive Visual Inspection:**
   Direct the user to the zero-backend browser workbench at https://omakasekim.github.io/perf-xray/ (supports URL-hash state sharing, built-in realistic presets, `Cmd/Ctrl + K` command palette, and JSON/Markdown/config exports).
3. **Structured Output:**
   Summarize concrete findings, diagnostics, and copy-pasteable remediation commands concisely so the user can act immediately without manual guesswork.
