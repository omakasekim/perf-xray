import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  Copy,
  Database,
  Download,
  Flame,
  Gauge,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  analyzeCiPipeline,
  CI_PRESETS,
  DEMO_BENCHMARKS,
  evaluateBenchmarks,
  parseSqlExplainJson,
  SQL_EXPLAIN_PRESETS,
} from './core/perfEngine.ts';

type PerfMode = 'ci' | 'sql' | 'bench';

export function App() {
  const [mode, setMode] = useState<PerfMode>('ci');

  // Mode A: CI Flamegraph
  const [ciPresetId, setCiPresetId] = useState<string>(CI_PRESETS[0].id);
  const [applyCiOpt, setApplyCiOpt] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string>(CI_PRESETS[0].steps[1].id);

  // Mode B: SQL EXPLAIN
  const [sqlPresetId, setSqlPresetId] = useState<string>(SQL_EXPLAIN_PRESETS[0].id);
  const [sqlRaw, setSqlRaw] = useState<string>(SQL_EXPLAIN_PRESETS[0].raw);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);

  // Mode C: Benchmark Comparator
  const [thresholdPct, setThresholdPct] = useState(10);

  const ciPreset = CI_PRESETS.find((p) => p.id === ciPresetId) ?? CI_PRESETS[0];
  const ciAnalysis = useMemo(() => analyzeCiPipeline(ciPreset.steps, applyCiOpt), [ciPreset, applyCiOpt]);
  const selectedStep = ciAnalysis.steps.find((s) => s.id === selectedStepId) ?? ciAnalysis.steps[0];

  const sqlPlan = useMemo(() => {
    try {
      return parseSqlExplainJson(sqlRaw);
    } catch {
      return null;
    }
  }, [sqlRaw]);

  const benchResults = useMemo(() => evaluateBenchmarks(DEMO_BENCHMARKS, thresholdPct), [thresholdPct]);

  const buildBenchmarkSvg = () => {
    const w = 780;
    const rowH = 68;
    const h = 76 + DEMO_BENCHMARKS.length * rowH;
    const maxP99 = Math.max(10, ...DEMO_BENCHMARKS.flatMap((b) => [b.baseP99, b.candP99]));
    const rows = DEMO_BENCHMARKS.map((b, i) => {
      const y = 58 + i * rowH;
      const bw = Math.max(16, (b.baseP99 / maxP99) * 440);
      const cw = Math.max(16, (b.candP99 / maxP99) * 440);
      const cmp = benchResults[i];
      const cFill = cmp.regressed ? '#f43f5e' : '#10b981';
      return `<g transform="translate(24,${y})">
        <text x="0" y="14" fill="#e2e8f0" font-family="monospace" font-size="12" font-weight="700">${b.name}</text>
        <rect x="0" y="22" width="${bw.toFixed(1)}" height="12" rx="4" fill="#475569" />
        <text x="${(bw + 8).toFixed(1)}" y="32" fill="#94a3b8" font-family="monospace" font-size="10">Base p99: ${b.baseP99}ms</text>
        <rect x="0" y="38" width="${cw.toFixed(1)}" height="12" rx="4" fill="${cFill}" />
        <text x="${(cw + 8).toFixed(1)}" y="48" fill="${cFill}" font-family="monospace" font-size="10">Cand p99: ${b.candP99}ms (${cmp.p99DeltaPct > 0 ? '+' : ''}${cmp.p99DeltaPct}% · ${cmp.rpsSpeedup}x RPS)</text>
      </g>`;
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="100%" height="100%" fill="#090D16" />
      <text x="24" y="32" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="700">perf-xray — p99 Latency &amp; Throughput Comparison</text>
      ${rows}
    </svg>`;
  };

  const exportChartSvg = () => {
    const svg = buildBenchmarkSvg();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'perf-xray-benchmark.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const exportChartPng = () => {
    const svg = buildBenchmarkSvg();
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        c.toBlob((png) => {
          if (!png) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(png);
          a.download = 'perf-xray-benchmark.png';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        });
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const exportJson = () => {
    const data = mode === 'ci' ? ciAnalysis : mode === 'sql' ? sqlPlan : { thresholdPct, benchmarks: DEMO_BENCHMARKS, results: benchResults };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `perf-xray-${mode}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#090D16] text-slate-100">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 bg-[#111827] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300">
              <Flame className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-50">perf-xray</h1>
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                  3-MODE PERF LAB
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                CI Bottleneck Flamegraph · SQL EXPLAIN Flow · Latency Benchmark Arena
              </p>
            </div>
          </div>

          <div className="flex rounded-lg border border-slate-700 bg-[#090D16] p-0.5 text-xs">
            {(
              [
                { id: 'ci', label: 'CI Flamegraph', icon: Flame },
                { id: 'sql', label: 'SQL EXPLAIN Flow', icon: Database },
                { id: 'bench', label: 'Benchmark Arena', icon: BarChart3 },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                  mode === m.id ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <m.icon className="h-3.5 w-3.5" />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {mode === 'bench' && (
            <>
              <button
                type="button"
                onClick={exportChartSvg}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#090D16] px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500"
              >
                <Download className="h-3.5 w-3.5 text-sky-400" /> SVG
              </button>
              <button
                type="button"
                onClick={exportChartPng}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#090D16] px-2.5 py-1 text-xs text-slate-200 hover:border-emerald-500"
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> PNG
              </button>
            </>
          )}
          <button
            type="button"
            onClick={exportJson}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#090D16] px-2.5 py-1 text-xs text-slate-200 hover:border-amber-500"
          >
            <Download className="h-3.5 w-3.5 text-amber-400" /> JSON
          </button>
        </div>
      </header>

      {/* MODE A: CI BOTTLENECK FLAMEGRAPH */}
      {mode === 'ci' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#0F172A] px-4 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {CI_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setCiPresetId(p.id);
                    setApplyCiOpt(false);
                    setSelectedStepId(p.steps[0].id);
                  }}
                  className={`rounded-md border px-2.5 py-1 ${
                    ciPresetId === p.id
                      ? 'border-amber-500/60 bg-amber-500/15 font-semibold text-amber-200'
                      : 'border-slate-700 bg-[#111827] text-slate-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setApplyCiOpt((v) => !v)}
                className={`ml-2 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-semibold ${
                  applyCiOpt
                    ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                    : 'border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{applyCiOpt ? `Optimized (-${ciAnalysis.savedSec}s)` : 'Simulate Cache + Parallel Wins'}</span>
              </button>
            </div>

            <div className="flex gap-3 font-mono text-[11px]">
              <span className="text-slate-200">Wall: <strong>{ciAnalysis.totalWallSec}s</strong></span>
              <span className="text-rose-300">{ciAnalysis.cacheMisses} cache miss(es)</span>
              <span className="text-amber-300">Critical path: {ciAnalysis.criticalSec}s</span>
            </div>
          </div>

          <div className="grid flex-1 overflow-hidden lg:grid-cols-[1.35fr_0.85fr]">
            {/* Timeline Flamegraph */}
            <section className="space-y-2.5 overflow-y-auto p-5">
              <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                <span>0s</span>
                <span>{Math.round(ciAnalysis.rawWallSec * 0.25)}s</span>
                <span>{Math.round(ciAnalysis.rawWallSec * 0.5)}s</span>
                <span>{Math.round(ciAnalysis.rawWallSec * 0.75)}s</span>
                <span>{ciAnalysis.rawWallSec}s (baseline)</span>
              </div>
              {ciAnalysis.steps.map((step) => {
                const leftPct = (step.startSec / ciAnalysis.rawWallSec) * 100;
                const widthPct = Math.max(4, (step.durationSec / ciAnalysis.rawWallSec) * 100);
                const active = step.id === selectedStep?.id;
                const barClass = !step.cacheHit
                  ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                  : step.criticalPath
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                    : 'bg-sky-500/80';
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setSelectedStepId(step.id)}
                    className={`block w-full rounded-xl border p-3 text-left transition ${
                      active ? 'border-amber-400 bg-[#111827] ring-1 ring-amber-400/50' : 'border-slate-800 bg-[#111827]/80 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{step.stage}</span>
                        <span className="font-bold text-slate-100">{step.name}</span>
                        {!step.cacheHit && (
                          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">CACHE MISS</span>
                        )}
                      </div>
                      <span className="text-amber-300">{step.durationSec}s</span>
                    </div>
                    <div className="relative mt-2 h-4 w-full overflow-hidden rounded-md bg-[#090D16]">
                      <div
                        className={`absolute top-0 h-full rounded-md transition-all ${barClass}`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </section>

            {/* Right Step Optimization Inspector */}
            <aside className="space-y-4 overflow-y-auto border-l border-slate-800 bg-[#111827] p-5">
              {selectedStep && (
                <div className="space-y-3 rounded-xl border border-slate-800 bg-[#090D16] p-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                      {selectedStep.stage}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      t={selectedStep.startSec}s → {selectedStep.startSec + selectedStep.durationSec}s
                    </span>
                  </div>
                  <h2 className="font-mono text-base font-bold text-slate-50">{selectedStep.name}</h2>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="rounded border border-slate-800 bg-[#111827] p-2">
                      Critical Path: <strong className={selectedStep.criticalPath ? 'text-rose-400' : 'text-emerald-400'}>{selectedStep.criticalPath ? 'YES' : 'NO'}</strong>
                    </div>
                    <div className="rounded border border-slate-800 bg-[#111827] p-2">
                      Cache: <strong className={selectedStep.cacheHit ? 'text-emerald-400' : 'text-rose-400'}>{selectedStep.cacheHit ? 'HIT' : 'MISS'}</strong>
                    </div>
                  </div>
                  {selectedStep.optimizationHint && (
                    <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                      <strong>Parallelization / Cache Win:</strong> {selectedStep.optimizationHint}
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        </div>
      )}

      {/* MODE B: SQL EXPLAIN FLOW */}
      {mode === 'sql' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#0F172A] px-4 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {SQL_EXPLAIN_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSqlPresetId(p.id);
                    setSqlRaw(p.raw);
                  }}
                  className={`rounded-md border px-2.5 py-1 ${
                    sqlPresetId === p.id
                      ? 'border-amber-500/60 bg-amber-500/15 font-semibold text-amber-200'
                      : 'border-slate-700 bg-[#111827] text-slate-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {sqlPlan && (
              <div className="flex gap-3 font-mono text-[11px]">
                <span className="text-amber-300">Exec Time: <strong>{sqlPlan.totalTimeMs}ms</strong></span>
                <span className={sqlPlan.driftAlerts.length ? 'text-rose-400' : 'text-emerald-400'}>
                  {sqlPlan.driftAlerts.length} drift/scan alert(s)
                </span>
              </div>
            )}
          </div>

          <div className="grid flex-1 overflow-hidden lg:grid-cols-[0.9fr_1.35fr]">
            <section className="flex flex-col overflow-hidden border-r border-slate-800">
              <div className="border-b border-slate-800 bg-[#111827] px-3.5 py-2 text-xs font-semibold text-slate-300">
                PostgreSQL `EXPLAIN (ANALYZE, FORMAT JSON)` Input
              </div>
              <textarea
                value={sqlRaw}
                onChange={(e) => {
                  setSqlPresetId('custom');
                  setSqlRaw(e.target.value);
                }}
                spellCheck={false}
                className="flex-1 resize-none bg-[#090D16] p-3.5 font-mono text-[11.5px] leading-5 text-sky-100 focus:outline-none"
              />
            </section>

            <section className="space-y-4 overflow-y-auto bg-[#111827] p-5">
              {!sqlPlan ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200">
                  Invalid JSON plan. Paste output from `EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...`
                </div>
              ) : (
                <>
                  {/* Animated Row-Volume Node Flow */}
                  <div className="space-y-2.5 rounded-xl border border-slate-800 bg-[#090D16] p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Execution Tree (Edge &amp; Bar Width = Actual Row Volume)
                    </div>
                    <div className="space-y-2">
                      {sqlPlan.nodes.map((n) => {
                        const maxRows = Math.max(1, ...sqlPlan.nodes.map((x) => x.actualRows));
                        const volPct = Math.max(5, Math.round((n.actualRows / maxRows) * 100));
                        return (
                          <div
                            key={n.id}
                            style={{ marginLeft: `${Math.min(4, n.depth) * 20}px` }}
                            className={`rounded-xl border p-3 ${
                              n.warning ? 'border-rose-500/60 bg-rose-950/20' : 'border-slate-800 bg-[#111827]'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                              <span className="font-bold text-slate-100">
                                {n.nodeType} {n.relation ? <span className="text-sky-300">on {n.relation}</span> : null}
                              </span>
                              <span className="text-amber-300">
                                {n.actualTimeMs}ms · {n.actualRows.toLocaleString()} rows
                              </span>
                            </div>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={`h-full rounded-full ${n.warning ? 'bg-rose-500' : 'bg-emerald-400'}`}
                                style={{ width: `${volPct}%` }}
                              />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-slate-400">
                              <span>est {n.planRows.toLocaleString()} → actual {n.actualRows.toLocaleString()} ({n.driftRatio}x)</span>
                              <span>cost {n.totalCost}</span>
                            </div>
                            {n.warning && (
                              <div className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{n.warning}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {sqlPlan.indexHints.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                        Recommended Index Hints
                      </div>
                      {sqlPlan.indexHints.map((hint) => (
                        <div key={hint} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 font-mono text-xs text-emerald-200">
                          <span className="truncate">{hint}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(hint);
                                setCopiedHint(hint);
                                setTimeout(() => setCopiedHint(null), 1500);
                              } catch {}
                            }}
                            className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-sky-300"
                          >
                            {copiedHint === hint ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                            Copy
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* MODE C: BENCHMARK COMPARATOR */}
      {mode === 'bench' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0F172A] px-4 py-2 text-xs">
            <div className="flex items-center gap-2 text-slate-200">
              <Gauge className="h-4 w-4 text-amber-400" />
              <span className="font-semibold">p50 / p95 / p99 Distribution &amp; Throughput Comparator</span>
            </div>
            <label className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <span>Regression Gate:</span>
              <input
                type="range"
                min={5}
                max={30}
                step={5}
                value={thresholdPct}
                onChange={(e) => setThresholdPct(Number(e.target.value))}
                className="w-28 accent-amber-400"
              />
              <span className="text-amber-300">+{thresholdPct}% p99</span>
            </label>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              {DEMO_BENCHMARKS.map((b, i) => {
                const cmp = benchResults[i];
                const maxMs = Math.max(b.baseP99, b.candP99, 1);
                return (
                  <div
                    key={b.id}
                    className={`rounded-xl border p-4 ${
                      cmp.regressed
                        ? 'border-rose-500/60 bg-rose-950/15'
                        : cmp.improved
                          ? 'border-emerald-500/45 bg-[#111827]'
                          : 'border-slate-800 bg-[#111827]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-mono text-sm font-bold text-slate-100">{b.name}</h2>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                          cmp.regressed
                            ? 'bg-rose-500/20 text-rose-300'
                            : cmp.improved
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {cmp.regressed ? 'REGRESSION' : cmp.improved ? `${cmp.rpsSpeedup}x FASTER` : 'NEUTRAL'} ({cmp.p99DeltaPct > 0 ? '+' : ''}{cmp.p99DeltaPct}% p99)
                      </span>
                    </div>

                    <div className="mt-3 space-y-2.5 font-mono text-[11px]">
                      {(
                        [
                          { label: 'p50', base: b.baseP50, cand: b.candP50 },
                          { label: 'p95', base: b.baseP95, cand: b.candP95 },
                          { label: 'p99', base: b.baseP99, cand: b.candP99 },
                        ] as const
                      ).map((row) => (
                        <div key={row.label} className="space-y-1">
                          <div className="flex justify-between text-slate-400">
                            <span>{row.label}</span>
                            <span>
                              base {row.base}ms → <strong className={row.cand > row.base ? 'text-rose-300' : 'text-emerald-300'}>{row.cand}ms</strong>
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="h-1.5 w-full rounded-full bg-[#090D16]">
                              <div className="h-full rounded-full bg-slate-500" style={{ width: `${(row.base / maxMs) * 100}%` }} />
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-[#090D16]">
                              <div
                                className={`h-full rounded-full ${row.cand > row.base ? 'bg-rose-400' : 'bg-emerald-400'}`}
                                style={{ width: `${(row.cand / maxMs) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5 font-mono text-xs text-slate-300">
                      <span>Throughput: {b.baseRps.toLocaleString()} → <strong className="text-sky-300">{b.candRps.toLocaleString()} req/s</strong></span>
                      <span className="text-amber-300">{cmp.rpsSpeedup}x</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
