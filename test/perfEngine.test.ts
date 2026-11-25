import { describe, expect, it } from 'vitest';
import {
  analyzeCiPipeline,
  CI_PRESETS,
  DEMO_BENCHMARKS,
  evaluateBenchmarks,
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

  it('flags p99 regressions above threshold and computes throughput speedups', () => {
    const cmp = evaluateBenchmarks(DEMO_BENCHMARKS, 10);
    expect(cmp.some((c) => c.regressed)).toBe(true);
    expect(cmp.some((c) => c.improved && c.rpsSpeedup > 3)).toBe(true);
  });
});
