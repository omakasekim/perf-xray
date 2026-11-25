import { describe, expect, it } from 'vitest';
import {
  analyzeCiPipeline,
  CI_PRESETS,
  DEMO_BENCHMARKS,
  evaluateBenchmarks,
  formatBenchmarkPrComment,
  parseGithubActionsWorkflow,
  parseSqlExplainJson,
  SQL_EXPLAIN_PRESETS,
} from '../src/core/perfEngine.ts';

describe('perf-xray CI flamegraph, SQL EXPLAIN & benchmark engine', () => {
  it('computes CI critical path, cache misses, and simulated optimization savings', () => {
    const raw = analyzeCiPipeline(CI_PRESETS[0].steps, false);
    const opt = analyzeCiPipeline(CI_PRESETS[0].steps, true);
    expect(raw.cacheMisses).toBe(2);
    expect(opt.totalWallSec).toBeLessThan(raw.totalWallSec);
    expect(opt.savedSec).toBeGreaterThan(30);
  });

  it('parses Postgres EXPLAIN JSON, detects row-estimate drift, and generates index hints', () => {
    const slow = parseSqlExplainJson(SQL_EXPLAIN_PRESETS[0].raw);
    expect(slow.nodes.length).toBeGreaterThanOrEqual(4);
    expect(slow.driftAlerts.length).toBeGreaterThanOrEqual(2);
    expect(slow.indexHints.some((h) => h.includes('CREATE INDEX CONCURRENTLY idx_invoices_org_id'))).toBe(true);

    const fast = parseSqlExplainJson(SQL_EXPLAIN_PRESETS[1].raw);
    expect(fast.driftAlerts).toHaveLength(0);
  });

  it('flags p99 regressions above threshold, computes speedups, and formats PR Markdown + parses GHA YAML', () => {
    const cmp = evaluateBenchmarks(DEMO_BENCHMARKS, 10);
    expect(cmp.some((c) => c.regressed)).toBe(true);
    expect(cmp.some((c) => c.improved && c.rpsSpeedup > 3)).toBe(true);

    const md = formatBenchmarkPrComment(DEMO_BENCHMARKS, cmp, 10);
    expect(md).toContain('perf-xray Benchmark Gate');
    expect(md).toContain('REGRESSION');

    const steps = parseGithubActionsWorkflow(`jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test`);
    expect(steps.length).toBe(3);
    expect(steps[1].cacheHit).toBe(false);
  });
});
