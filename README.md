# perf-xray

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-f59e0b?style=flat-square)](https://aetherx86.github.io/perf-xray/)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=flat-square)](LICENSE)

> **Interactive 3-mode performance workbench:** CI critical-path flamegraph simulator, PostgreSQL `EXPLAIN (ANALYZE, FORMAT JSON)` query plan flow analyzer, and p50/p95/p99 latency benchmark comparator.

## Modes
1. **CI Bottleneck Flamegraph** — Visualize pipeline stages on a timeline, highlight critical-path delays and cache misses, and simulate parallelization + caching speedups.
2. **SQL `EXPLAIN` Flow** — Convert JSON query plans into row-volume scaled trees with row-estimate drift alerts and copyable `CREATE INDEX CONCURRENTLY` hints.
3. **Benchmark Arena** — Compare p50/p95/p99 latency distributions and req/s speedups with configurable regression thresholds and SVG/PNG/JSON chart export.

## Quickstart

```bash
npm install
npm run dev
```

## Architecture
- Pure TypeScript analytics engines in `src/core/perfEngine.ts` (zero backend, zero API keys).
- Dark engineering workbench UI built with React 18, TypeScript, Tailwind CSS, and Vite (`base: './'` for static GitHub Pages deployment).
