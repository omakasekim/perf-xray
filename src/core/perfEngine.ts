export interface CiStep {
  id: string;
  stage: string;
  name: string;
  startSec: number;
  durationSec: number;
  cacheHit: boolean;
  criticalPath: boolean;
  parallelizable?: boolean;
  optimizationHint?: string;
}

export interface CiPipelinePreset {
  id: string;
  name: string;
  steps: CiStep[];
}

export function analyzeCiPipeline(steps: CiStep[], applyOptimizations = false) {
  let cumulativeShift = 0;
  const adjusted = steps.map((s) => {
    if (!applyOptimizations) return s;
    const origDur = s.durationSec;
    let durationSec = origDur;
    if (!s.cacheHit) durationSec = Math.max(8, Math.round(origDur * 0.35));
    const startSec = Math.max(0, s.parallelizable ? Math.round((s.startSec - cumulativeShift) * 0.65) : s.startSec - cumulativeShift);
    if (s.criticalPath) {
      cumulativeShift += Math.max(0, origDur - durationSec);
    }
    return { ...s, startSec, durationSec, cacheHit: true };
  });

  const totalWallSec = Math.max(1, ...adjusted.map((s) => s.startSec + s.durationSec));
  const rawWallSec = Math.max(1, ...steps.map((s) => s.startSec + s.durationSec));
  const cacheMisses = steps.filter((s) => !s.cacheHit).length;
  const criticalSec = adjusted.filter((s) => s.criticalPath).reduce((a, s) => a + s.durationSec, 0);

  return {
    steps: adjusted,
    totalWallSec,
    rawWallSec,
    savedSec: Math.max(0, rawWallSec - totalWallSec),
    cacheMisses,
    criticalSec,
  };
}

export const CI_PRESETS: CiPipelinePreset[] = [
  {
    id: 'monorepo-ci',
    name: 'Monorepo Fullstack CI',
    steps: [
      { id: 'c1', stage: 'Setup', name: 'Checkout + Setup Node', startSec: 0, durationSec: 18, cacheHit: true, criticalPath: true },
      { id: 'c2', stage: 'Install', name: 'npm ci (lockfile cache miss)', startSec: 18, durationSec: 94, cacheHit: false, criticalPath: true, optimizationHint: 'Enable npm/pnpm store caching keyed on lockfile hash (~62s saved).' },
      { id: 'c3', stage: 'Verify', name: 'TypeScript tsc --noEmit', startSec: 112, durationSec: 46, cacheHit: true, criticalPath: false, parallelizable: true },
      { id: 'c4', stage: 'Verify', name: 'Vitest Unit + Integration Suite', startSec: 112, durationSec: 78, cacheHit: true, criticalPath: true, optimizationHint: 'Shard Vitest across 4 runners (--shard=1/4) to cut wall time by 65%.' },
      { id: 'c5', stage: 'Build', name: 'Docker Multi-Stage Image Build', startSec: 190, durationSec: 132, cacheHit: false, criticalPath: true, optimizationHint: 'Mount BuildKit cache (type=cache) & separate deps layer.' },
      { id: 'c6', stage: 'E2E', name: 'Playwright Chromium Smoke', startSec: 322, durationSec: 88, cacheHit: true, criticalPath: true, parallelizable: true, optimizationHint: 'Run against preview artifact in parallel with Docker push.' },
      { id: 'c7', stage: 'Deploy', name: 'Upload & Deploy Pages', startSec: 410, durationSec: 26, cacheHit: true, criticalPath: true },
    ],
  },
  {
    id: 'rust-wasm',
    name: 'Rust + WASM Release Pipeline',
    steps: [
      { id: 'r1', stage: 'Setup', name: 'Rustup + wasm32 Target', startSec: 0, durationSec: 24, cacheHit: true, criticalPath: true },
      { id: 'r2', stage: 'Compile', name: 'cargo build --release (cold sccache)', startSec: 24, durationSec: 168, cacheHit: false, criticalPath: true, optimizationHint: 'Enable Swatinem/rust-cache or sccache to cut cold build to ~45s.' },
      { id: 'r3', stage: 'Test', name: 'cargo nextest run', startSec: 192, durationSec: 52, cacheHit: true, criticalPath: true },
      { id: 'r4', stage: 'WASM', name: 'wasm-opt -O3 + gzip', startSec: 192, durationSec: 34, cacheHit: true, criticalPath: false, parallelizable: true },
      { id: 'r5', stage: 'Publish', name: 'Sign Checksums & Release', startSec: 244, durationSec: 20, cacheHit: true, criticalPath: true },
    ],
  },
];

export interface SqlPlanNode {
  id: string;
  parentId: string | null;
  nodeType: string;
  relation?: string;
  planRows: number;
  actualRows: number;
  totalCost: number;
  actualTimeMs: number;
  driftRatio: number;
  warning?: string;
  indexHint?: string;
  depth: number;
}

export interface SqlPlanResult {
  nodes: SqlPlanNode[];
  totalTimeMs: number;
  driftAlerts: SqlPlanNode[];
  indexHints: string[];
}

export function parseSqlExplainJson(raw: string): SqlPlanResult {
  const parsed = JSON.parse(raw) as Array<{ Plan: Record<string, unknown> }> | { Plan: Record<string, unknown> };
  const rootPlan = Array.isArray(parsed) ? parsed[0]?.Plan : parsed.Plan;
  const nodes: SqlPlanNode[] = [];
  let seq = 0;

  const walk = (p: Record<string, unknown> | undefined, parentId: string | null, depth: number) => {
    if (!p) return;
    const id = `q_${seq++}`;
    const nodeType = String(p['Node Type'] ?? 'Unknown');
    const relation = typeof p['Relation Name'] === 'string' ? p['Relation Name'] : undefined;
    const planRows = Number(p['Plan Rows'] ?? 1);
    const actualRows = Number(p['Actual Rows'] ?? planRows);
    const totalCost = Number(p['Total Cost'] ?? 0);
    const actualTimeMs = Number(p['Actual Total Time'] ?? 0);
    const driftRatio = Number((Math.max(actualRows, 1) / Math.max(planRows, 1)).toFixed(1));

    let warning: string | undefined;
    let indexHint: string | undefined;
    if (driftRatio >= 8 || driftRatio <= 0.12) {
      warning = `Row-estimate drift (${planRows.toLocaleString()} est vs ${actualRows.toLocaleString()} actual — ${driftRatio}x). Run ANALYZE ${relation ?? 'table'}.`;
    }
    if (nodeType === 'Seq Scan' && actualRows >= 5000 && relation) {
      const filter = typeof p['Filter'] === 'string' ? p['Filter'] : '';
      const colMatch = /\(([a-z_][a-z0-9_]*)\s*=/.exec(filter);
      const col = colMatch?.[1] ?? 'org_id';
      indexHint = `CREATE INDEX CONCURRENTLY idx_${relation}_${col} ON ${relation} (${col});`;
      warning = warning ?? `Full Sequential Scan reading ${actualRows.toLocaleString()} rows on "${relation}".`;
    }
    if (nodeType === 'Sort' && actualRows >= 10000) {
      warning = warning ?? `Large in-memory/disk Sort (${actualRows.toLocaleString()} rows) — consider composite ORDER BY index.`;
    }

    nodes.push({
      id,
      parentId,
      nodeType,
      relation,
      planRows,
      actualRows,
      totalCost,
      actualTimeMs,
      driftRatio,
      warning,
      indexHint,
      depth,
    });

    const children = Array.isArray(p['Plans']) ? (p['Plans'] as Record<string, unknown>[]) : [];
    for (const child of children) walk(child, id, depth + 1);
  };

  walk(rootPlan, null, 0);

  return {
    nodes,
    totalTimeMs: nodes[0]?.actualTimeMs ?? 0,
    driftAlerts: nodes.filter((n) => Boolean(n.warning)),
    indexHints: nodes.map((n) => n.indexHint).filter((x): x is string => Boolean(x)),
  };
}

export const SQL_EXPLAIN_PRESETS = [
  {
    id: 'slow-seq',
    name: 'Slow Seq Scan + Drift Alert',
    raw: JSON.stringify(
      [
        {
          Plan: {
            'Node Type': 'Sort',
            'Plan Rows': 1200,
            'Actual Rows': 28400,
            'Total Cost': 48920.4,
            'Actual Total Time': 412.6,
            Plans: [
              {
                'Node Type': 'Hash Join',
                'Plan Rows': 1200,
                'Actual Rows': 28400,
                'Total Cost': 31200.2,
                'Actual Total Time': 294.1,
                Plans: [
                  {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'invoices',
                    Filter: '(org_id = 42)',
                    'Plan Rows': 1400,
                    'Actual Rows': 42800,
                    'Total Cost': 22410.0,
                    'Actual Total Time': 198.4,
                  },
                  {
                    'Node Type': 'Hash',
                    'Plan Rows': 850,
                    'Actual Rows': 850,
                    'Total Cost': 412.0,
                    'Actual Total Time': 11.2,
                    Plans: [
                      {
                        'Node Type': 'Index Scan',
                        'Relation Name': 'customers',
                        'Plan Rows': 850,
                        'Actual Rows': 850,
                        'Total Cost': 412.0,
                        'Actual Total Time': 8.6,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
      null,
      2,
    ),
  },
  {
    id: 'fast-index',
    name: 'Optimized Covering Index Plan',
    raw: JSON.stringify(
      [
        {
          Plan: {
            'Node Type': 'Limit',
            'Plan Rows': 50,
            'Actual Rows': 50,
            'Total Cost': 142.8,
            'Actual Total Time': 4.2,
            Plans: [
              {
                'Node Type': 'Nested Loop',
                'Plan Rows': 50,
                'Actual Rows': 50,
                'Total Cost': 142.8,
                'Actual Total Time': 4.1,
                Plans: [
                  {
                    'Node Type': 'Index Only Scan',
                    'Relation Name': 'invoices',
                    'Plan Rows': 50,
                    'Actual Rows': 50,
                    'Total Cost': 28.4,
                    'Actual Total Time': 1.3,
                  },
                  {
                    'Node Type': 'Index Scan',
                    'Relation Name': 'customers',
                    'Plan Rows': 1,
                    'Actual Rows': 1,
                    'Total Cost': 2.2,
                    'Actual Total Time': 0.05,
                  },
                ],
              },
            ],
          },
        },
      ],
      null,
      2,
    ),
  },
] as const;

export interface BenchmarkMetric {
  id: string;
  name: string;
  baseP50: number;
  baseP95: number;
  baseP99: number;
  baseRps: number;
  candP50: number;
  candP95: number;
  candP99: number;
  candRps: number;
}

export interface BenchmarkComparison {
  id: string;
  name: string;
  p99DeltaPct: number;
  rpsSpeedup: number;
  regressed: boolean;
  improved: boolean;
}

export function evaluateBenchmarks(items: BenchmarkMetric[], regressionThresholdPct = 10): BenchmarkComparison[] {
  return items.map((b) => {
    const p99DeltaPct = Number((((b.candP99 - b.baseP99) / Math.max(0.01, b.baseP99)) * 100).toFixed(1));
    const rpsSpeedup = Number((b.candRps / Math.max(1, b.baseRps)).toFixed(2));
    return {
      id: b.id,
      name: b.name,
      p99DeltaPct,
      rpsSpeedup,
      regressed: p99DeltaPct > regressionThresholdPct,
      improved: p99DeltaPct < -5,
    };
  });
}

export const DEMO_BENCHMARKS: BenchmarkMetric[] = [
  { id: 'b1', name: 'POST /v2/auth/verify (Keyring)', baseP50: 4.8, baseP95: 11.2, baseP99: 18.4, baseRps: 4200, candP50: 3.1, candP95: 6.4, candP99: 9.8, candRps: 6850 },
  { id: 'b2', name: 'GET /v2/invoices (Covering Idx)', baseP50: 34.0, baseP95: 128.0, baseP99: 295.0, baseRps: 740, candP50: 5.2, candP95: 11.4, candP99: 18.2, candRps: 3920 },
  { id: 'b3', name: 'POST /v2/search (Hybrid Rerank)', baseP50: 19.5, baseP95: 48.2, baseP99: 74.0, baseRps: 1280, candP50: 24.8, candP95: 69.5, candP99: 108.4, candRps: 940 },
  { id: 'b4', name: 'WASM Lockfile Graph Parser', baseP50: 8.1, baseP95: 14.5, baseP99: 21.0, baseRps: 2150, candP50: 4.4, candP95: 8.2, candP99: 11.6, candRps: 4120 },
];

export function parseGithubActionsWorkflow(yaml: string): CiStep[] {
  const lines = yaml.replace(/\r\n/g, '\n').split('\n');
  const steps: CiStep[] = [];
  let inJobs = false;
  let currentJob = '';
  let cursorSec = 0;

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.search(/\S/);
    const trimmed = raw.trim();
    if (indent === 0) {
      inJobs = trimmed === 'jobs:';
      continue;
    }
    if (!inJobs) continue;
    if (indent === 2 && trimmed.endsWith(':')) {
      currentJob = trimmed.slice(0, -1);
      continue;
    }
    if (currentJob && (trimmed.startsWith('- run:') || trimmed.startsWith('- name:') || trimmed.startsWith('- uses:'))) {
      const label = trimmed.replace(/^-\s*(?:run|name|uses):\s*/, '').replace(/^['"]|['"]$/g, '');
      const isInstall = /npm ci|npm install|cargo build|pip install|docker build/i.test(label);
      const isTest = /test|vitest|pytest|playwright|lint|tsc/i.test(label);
      const dur = isInstall ? 78 : isTest ? 52 : 22;
      steps.push({
        id: `gh_${steps.length}`,
        stage: currentJob,
        name: label.slice(0, 48),
        startSec: cursorSec,
        durationSec: dur,
        cacheHit: !isInstall,
        criticalPath: true,
        parallelizable: isTest,
        optimizationHint: isInstall
          ? 'Enable dependency/layer caching for faster cold starts.'
          : isTest
            ? 'Candidate for matrix runner sharding.'
            : undefined,
      });
      cursorSec += dur;
    }
  }
  return steps;
}

export function formatBenchmarkPrComment(
  items: BenchmarkMetric[],
  results: BenchmarkComparison[],
  thresholdPct: number,
): string {
  const regCount = results.filter((r) => r.regressed).length;
  const verdict = regCount > 0 ? `FAIL (${regCount} regression(s) > +${thresholdPct}% p99)` : `PASS (0 regressions > +${thresholdPct}% p99)`;
  const lines = [
    `### perf-xray Benchmark Gate: **${verdict}**`,
    '',
    '| Benchmark | Base p99 | Cand p99 | Delta | Throughput | Status |',
    '| :--- | ---: | ---: | ---: | ---: | :---: |',
    ...items.map((b, i) => {
      const r = results[i];
      const status = r.regressed ? 'REGRESSION' : r.improved ? 'FASTER' : 'OK';
      return `| \`${b.name}\` | ${b.baseP99}ms | ${b.candP99}ms | ${r.p99DeltaPct > 0 ? '+' : ''}${r.p99DeltaPct}% | ${r.rpsSpeedup}x | ${status} |`;
    }),
  ];
  return lines.join('\n') + '\n';
}
