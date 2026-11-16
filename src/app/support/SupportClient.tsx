'use client';

import { useState, useMemo, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { parseSupportXlsx } from '@/actions/support';
import type { SupportStore, SupportCluster } from '@/lib/types';

// ── Palette ───────────────────────────────────────────────────────────────────

const CLUSTER_COLOR: Record<string, string> = {
  '1':  '#6366f1',
  '2':  '#8b5cf6',
  '3':  '#10b981',
  '4':  '#06b6d4',
  '5':  '#f59e0b',
  '6':  '#3b82f6',
  '7':  '#ec4899',
  '8':  '#84cc16',
  '9':  '#f97316',
  '10': '#ef4444',
  '11': '#14b8a6',
  '12': '#a855f7',
  '13': '#64748b',
  '14': '#d97706',
  '15': '#0ea5e9',
  '':   '#cbd5e1',
};

function clusterColor(topCode: string) {
  return CLUSTER_COLOR[topCode] ?? '#94a3b8';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type Metric = 'count' | 'hours' | 'cost';

function topClusterLabel(topCode: string, clusters: SupportCluster[]): string {
  if (!topCode) return 'Kein Cluster';
  const c = clusters.find((x) => x.code === topCode + '.0');
  return c ? `${topCode}.0 ${c.label}` : `${topCode}.0`;
}

function subClusterLabel(code: string, clusters: SupportCluster[]): string {
  if (!code) return 'Kein Cluster';
  const c = clusters.find((x) => x.code === code);
  return c ? `${code} ${c.label}` : code;
}

function fmtHours(h: number) {
  return h >= 100 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

function fmtEur(v: number) {
  return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function fmtEurTick(v: number) {
  if (v >= 1000) return `${Math.round(v / 1000)}k €`;
  return `${v} €`;
}

function fmtMetric(v: number, m: Metric) {
  if (m === 'cost')  return fmtEur(v);
  if (m === 'hours') return fmtHours(v);
  return String(v);
}

function monthLabel(ym: string) {
  const [y, mo] = ym.split('-');
  const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  return `${months[parseInt(mo) - 1]} ${y.slice(2)}`;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-5 ${highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${highlight ? 'text-emerald-800' : 'text-slate-800'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function BarTooltip({ active, payload, label, metricType }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm px-3 py-2 text-xs max-w-xs">
      <p className="font-medium text-slate-700 mb-1 truncate">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name}: <span className="font-semibold">{typeof p.value === 'number' ? fmtMetric(p.value, metricType) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Upload area ───────────────────────────────────────────────────────────────

function UploadArea({ onUpload, uploading }: { onUpload: (f: File) => void; uploading: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(f: File | null) {
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) onUpload(f);
  }

  return (
    <div
      onClick={() => fileRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors select-none ${
        dragging ? 'border-slate-500 bg-slate-50' : 'border-slate-300 hover:border-slate-400'
      }`}
    >
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
      {uploading ? (
        <div className="flex items-center justify-center gap-2 text-slate-500">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Wird importiert…</span>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-600">Support.xlsx hier ablegen oder klicken</p>
          <p className="text-xs text-slate-400 mt-1">Tabs: Baumgartner, Puskas, Peric, Szogyenyi, Sigart + Clusters</p>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SupportClient({ store }: { store: SupportStore }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Filters & settings ────────────────────────────────────────────────────
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [incidentsOnly, setIncidentsOnly] = useState(true);
  const [metric, setMetric] = useState<Metric>('count');
  const [costRate, setCostRate] = useState(125);
  const [costRateInput, setCostRateInput] = useState('125');

  const hasData = store.entries.length > 0;

  const allYearMonths = useMemo(
    () => [...new Set(store.entries.map((e) => e.yearMonth))].sort(),
    [store.entries],
  );

  const filtered = useMemo(() => {
    let rows = store.entries;
    if (incidentsOnly)          rows = rows.filter((e) => e.isIncident);
    if (filterEmployee !== 'all') rows = rows.filter((e) => e.employee === filterEmployee);
    if (filterFrom) rows = rows.filter((e) => e.yearMonth >= filterFrom);
    if (filterTo)   rows = rows.filter((e) => e.yearMonth <= filterTo);
    return rows;
  }, [store.entries, incidentsOnly, filterEmployee, filterFrom, filterTo]);

  // ── KPI ───────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalH = filtered.reduce((s, e) => s + e.hours, 0);
    const incidents = filtered.filter((e) => e.isIncident).length;
    const withCluster = filtered.filter((e) => e.clusterCode).length;
    return {
      tickets: filtered.length,
      hours: totalH,
      cost: Math.round(totalH * costRate),
      incidentPct: filtered.length ? Math.round((incidents / filtered.length) * 100) : 0,
      withClusterPct: filtered.length ? Math.round((withCluster / filtered.length) * 100) : 0,
    };
  }, [filtered, costRate]);

  // ── Sort helper ───────────────────────────────────────────────────────────
  function sortVal(v: { count: number; hours: number }): number {
    if (metric === 'count') return v.count;
    if (metric === 'hours') return v.hours;
    return v.hours * costRate;
  }

  // ── Top clusters ──────────────────────────────────────────────────────────
  const topClustersData = useMemo(() => {
    const map = new Map<string, { count: number; hours: number }>();
    for (const e of filtered) {
      const key = e.topClusterCode || '';
      const cur = map.get(key) ?? { count: 0, hours: 0 };
      cur.count += 1;
      cur.hours += e.hours;
      map.set(key, cur);
    }
    return [...map.entries()]
      .sort((a, b) => sortVal(b[1]) - sortVal(a[1]))
      .map(([code, v]) => ({
        code,
        label: topClusterLabel(code, store.clusters),
        count: v.count,
        hours: Math.round(v.hours * 10) / 10,
        cost: Math.round(v.hours * costRate),
        fill: clusterColor(code),
      }));
  }, [filtered, store.clusters, metric, costRate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sub clusters ──────────────────────────────────────────────────────────
  const subClustersData = useMemo(() => {
    const map = new Map<string, { count: number; hours: number; top: string }>();
    for (const e of filtered) {
      if (!e.clusterCode) continue;
      const cur = map.get(e.clusterCode) ?? { count: 0, hours: 0, top: e.topClusterCode };
      cur.count += 1;
      cur.hours += e.hours;
      map.set(e.clusterCode, cur);
    }
    return [...map.entries()]
      .sort((a, b) => sortVal(b[1]) - sortVal(a[1]))
      .slice(0, 20)
      .map(([code, v]) => ({
        code,
        label: subClusterLabel(code, store.clusters),
        count: v.count,
        hours: Math.round(v.hours * 10) / 10,
        cost: Math.round(v.hours * costRate),
        fill: clusterColor(v.top),
      }));
  }, [filtered, store.clusters, metric, costRate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Monthly trend ─────────────────────────────────────────────────────────
  const { monthlyTrendData, trendKeys } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of filtered) {
      const key = e.topClusterCode || '';
      const val = metric === 'count' ? 1 : metric === 'hours' ? e.hours : e.hours * costRate;
      totals.set(key, (totals.get(key) ?? 0) + val);
    }
    const topKeys = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k]) => k);

    const data = allYearMonths
      .filter((ym) => !filterFrom || ym >= filterFrom)
      .filter((ym) => !filterTo   || ym <= filterTo)
      .map((ym) => {
        const monthEntries = filtered.filter((e) => e.yearMonth === ym);
        const point: Record<string, number | string> = { month: monthLabel(ym) };
        for (const k of topKeys) {
          const sub = monthEntries.filter((e) => (e.topClusterCode || '') === k);
          point[k] = metric === 'count'
            ? sub.length
            : metric === 'hours'
            ? Math.round(sub.reduce((s, e) => s + e.hours, 0) * 10) / 10
            : Math.round(sub.reduce((s, e) => s + e.hours, 0) * costRate);
        }
        return point;
      });

    return { monthlyTrendData: data, trendKeys: topKeys };
  }, [filtered, allYearMonths, filterFrom, filterTo, metric, costRate]);

  // ── Employee distribution ─────────────────────────────────────────────────
  const { employeeData, employeeStackKeys } = useMemo(() => {
    const empMap = new Map<string, Map<string, number>>();
    for (const e of filtered) {
      if (!empMap.has(e.employee)) empMap.set(e.employee, new Map());
      const cm = empMap.get(e.employee)!;
      const key = e.topClusterCode || '';
      const val = metric === 'count' ? 1 : metric === 'hours' ? e.hours : e.hours * costRate;
      cm.set(key, (cm.get(key) ?? 0) + val);
    }
    const topKeys = [...new Set(filtered.map((e) => e.topClusterCode || ''))];
    const data = [...empMap.entries()].map(([emp, cm]) => {
      const point: Record<string, string | number> = { employee: emp };
      for (const k of topKeys) point[k] = metric === 'hours' ? Math.round((cm.get(k) ?? 0) * 10) / 10 : Math.round(cm.get(k) ?? 0);
      return point;
    });
    return { employeeData: data, employeeStackKeys: topKeys };
  }, [filtered, metric, costRate]);

  // ── Pie data ──────────────────────────────────────────────────────────────
  const pieData = useMemo(() => {
    const inc = filtered.filter((e) => e.isIncident).length;
    const other = filtered.length - inc;
    return [
      { name: 'Incident', value: inc, fill: '#ef4444' },
      { name: 'Meeting / Sonstige', value: other, fill: '#94a3b8' },
    ].filter((d) => d.value > 0);
  }, [filtered]);

  // ── Cluster summary table ─────────────────────────────────────────────────
  const clusterTable = useMemo(() => topClustersData.map((tc) => ({
    ...tc,
    avgMin: tc.count > 0 ? Math.round((tc.hours / tc.count) * 60) : 0,
  })), [topClustersData]);

  // ── Metric axis label ─────────────────────────────────────────────────────
  const metricLabel = metric === 'count' ? 'Tickets' : metric === 'hours' ? 'Stunden' : 'Kosten (€)';
  const xTickFmt = metric === 'cost' ? fmtEurTick : undefined;

  // ── Upload ─────────────────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    setUploading(true);
    setUploadResult(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await parseSupportXlsx(fd);
    setUploading(false);
    if (res.ok) {
      setUploadResult({ ok: true, msg: `${res.entries} Einträge · ${res.employees} Mitarbeiter · ${res.clusters} Cluster` });
      startTransition(() => router.refresh());
    } else {
      setUploadResult({ ok: false, msg: res.error ?? 'Unbekannter Fehler' });
    }
  }

  function handleCostRateBlur() {
    const v = parseFloat(costRateInput.replace(',', '.'));
    if (!isNaN(v) && v > 0) setCostRate(v);
    else setCostRateInput(String(costRate));
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Support Cluster Analyse</h1>
        <p className="text-sm text-slate-500 mt-0.5">Ticket-Analyse für das Support-Team</p>
      </div>

      {/* Upload section */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Excel importieren
          {store.lastImport && (
            <span className="ml-3 normal-case font-normal text-slate-400">
              Letzter Import: {new Date(store.lastImport).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
        </p>
        <UploadArea onUpload={handleUpload} uploading={uploading} />
        {uploadResult && (
          <p className={`text-xs px-3 py-1.5 rounded ${uploadResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            {uploadResult.ok ? '✓ ' : '✗ '}{uploadResult.msg}
          </p>
        )}
      </div>

      {!hasData ? (
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-12 text-center">
          <p className="text-sm text-slate-500">Keine Daten — bitte zuerst die Support.xlsx hochladen.</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-4 items-end">
            {/* Employee */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Mitarbeiter</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="text-sm border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700"
              >
                <option value="all">Alle Mitarbeiter</option>
                {store.employeeNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* From */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Von</label>
              <select
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="text-sm border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700"
              >
                <option value="">Anfang</option>
                {allYearMonths.map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
              </select>
            </div>

            {/* To */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Bis</label>
              <select
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="text-sm border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700"
              >
                <option value="">Ende</option>
                {allYearMonths.map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
              </select>
            </div>

            {/* Incidents only toggle */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Eintragstyp</label>
              <div className="flex rounded border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setIncidentsOnly(true)}
                  className={`px-3 py-1.5 text-sm transition-colors ${incidentsOnly ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Nur Incidents
                </button>
                <button
                  onClick={() => setIncidentsOnly(false)}
                  className={`px-3 py-1.5 text-sm transition-colors ${!incidentsOnly ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Alle
                </button>
              </div>
            </div>

            {/* Metric toggle */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Kennzahl</label>
              <div className="flex rounded border border-slate-200 overflow-hidden">
                {(['count', 'hours', 'cost'] as Metric[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={`px-3 py-1.5 text-sm transition-colors ${metric === m ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {m === 'count' ? 'Anzahl' : m === 'hours' ? 'Stunden' : 'Kosten'}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost rate */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Stundensatz (€/h)</label>
              <div className="flex items-center border border-slate-200 rounded overflow-hidden">
                <span className="px-2 text-sm text-slate-400 bg-slate-50 border-r border-slate-200 select-none">€</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={costRateInput}
                  onChange={(e) => setCostRateInput(e.target.value)}
                  onBlur={handleCostRateBlur}
                  onKeyDown={(e) => e.key === 'Enter' && handleCostRateBlur()}
                  className="w-16 px-2 py-1.5 text-sm text-slate-700 bg-white focus:outline-none"
                />
                <span className="px-2 text-xs text-slate-400 bg-slate-50 border-l border-slate-200 select-none">/h</span>
              </div>
            </div>

            {(filterEmployee !== 'all' || filterFrom || filterTo || !incidentsOnly) && (
              <button
                onClick={() => { setFilterEmployee('all'); setFilterFrom(''); setFilterTo(''); setIncidentsOnly(true); }}
                className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2 py-1.5"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard label="Tickets gesamt" value={kpi.tickets.toLocaleString('de-DE')} />
            <KpiCard label="Kosten gesamt" value={fmtEur(kpi.cost)} highlight sub={`bei ${costRate} €/h`} />
            <KpiCard label="Stunden gesamt" value={fmtHours(kpi.hours)} />
            <KpiCard label="Incidents" value={`${kpi.incidentPct}%`} sub={`von ${kpi.tickets} Tickets`} />
            <KpiCard label="Mit Cluster" value={`${kpi.withClusterPct}%`} sub="kategorisiert" />
          </div>

          {/* Top clusters + Incident pie */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
                Top-Cluster nach {metricLabel}
              </p>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart layout="vertical" data={topClustersData} margin={{ left: 8, right: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={xTickFmt} />
                  <YAxis type="category" dataKey="label" width={185} tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 25 ? v.slice(0, 23) + '…' : v} />
                  <Tooltip content={(props) => <BarTooltip {...props} metricType={metric} />} />
                  <Bar dataKey={metric} name={metricLabel} radius={[0, 3, 3, 0]}>
                    {topClustersData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
                Incident vs. Meeting / Sonstige
              </p>
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={110}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [v, 'Tickets']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-1">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ background: d.fill }} />
                      {d.name}: <strong>{d.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Top 20 Sub-Clusters */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Top 20 Sub-Cluster nach {metricLabel}
            </p>
            <ResponsiveContainer width="100%" height={Math.max(380, subClustersData.length * 32)}>
              <BarChart layout="vertical" data={subClustersData} margin={{ left: 8, right: 48 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={xTickFmt} />
                <YAxis type="category" dataKey="label" width={265} tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.length > 40 ? v.slice(0, 38) + '…' : v} />
                <Tooltip content={(props) => <BarTooltip {...props} metricType={metric} />} />
                <Bar dataKey={metric} name={metricLabel} radius={[0, 3, 3, 0]}>
                  {subClustersData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly trend */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Monatlicher Verlauf nach Top-Cluster ({metricLabel})
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={monthlyTrendData} margin={{ left: 8, right: 24, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={xTickFmt} />
                <Tooltip content={(props) => <BarTooltip {...props} metricType={metric} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {trendKeys.map((k) => (
                  <Line key={k} type="monotone" dataKey={k}
                    name={topClusterLabel(k, store.clusters)}
                    stroke={clusterColor(k)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Employee distribution */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Verteilung nach Mitarbeiter ({metricLabel})
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={employeeData} margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="employee" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={xTickFmt} />
                <Tooltip content={(props) => <BarTooltip {...props} metricType={metric} />} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {employeeStackKeys.map((k) => (
                  <Bar key={k} dataKey={k} name={topClusterLabel(k, store.clusters)}
                    stackId="emp" fill={clusterColor(k)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cluster summary table */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Cluster-Übersicht · Stundensatz {fmtEur(costRate)}/h
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-slate-400">Cluster</th>
                    <th className="text-right py-2 pr-4 text-xs font-medium text-slate-400">Tickets</th>
                    <th className="text-right py-2 pr-4 text-xs font-medium text-slate-400">Stunden</th>
                    <th className="text-right py-2 pr-4 text-xs font-medium text-slate-400 bg-emerald-50 px-3 rounded">Kosten</th>
                    <th className="text-right py-2 text-xs font-medium text-slate-400">Ø Min/Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {clusterTable.map((row) => (
                    <tr key={row.code} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pr-4 font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ background: row.fill }} />
                          {row.label}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{row.count}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{fmtHours(row.hours)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium text-emerald-700 bg-emerald-50/50 px-3">{fmtEur(row.cost)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {row.count > 0 ? `${row.avgMin} min` : '—'}
                      </td>
                    </tr>
                  ))}
                  {clusterTable.length > 0 && (
                    <tr className="border-t-2 border-slate-200 font-semibold">
                      <td className="py-2 pr-4 text-slate-700">Gesamt</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{kpi.tickets}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{fmtHours(kpi.hours)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-emerald-700 bg-emerald-50/50 px-3">{fmtEur(kpi.cost)}</td>
                      <td className="py-2" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
