"use client";
import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import { guessMapping, IMPORT_KINDS, missingRequired, type ImportKind } from "@/lib/import-fields";
import type { ImportResult } from "@/lib/import-apply";
import { runImport } from "./actions";

type Cell = string | number | boolean | Date | null;
type Preset = { kind: string; name: string; mapping: Record<string, string> };

const MONTHS = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const CHUNK = 1500; // baris per request (batas ukuran request di Vercel ±4,5 MB)
const KIND_ORDER: ImportKind[] = ["orders", "everpro_orders", "customers", "sheet", "shipments", "settlements"];

/** Baris judul = baris (dari 10 teratas) dengan sel teks terbanyak. Export Everpro kadang punya baris judul laporan di atasnya. */
function detectHeaderRow(rows: Cell[][]) {
  let best = 0, bestScore = -1;
  rows.slice(0, 10).forEach((r, i) => {
    const score = r.filter((c) => typeof c === "string" && c.trim() && Number.isNaN(Number(c))).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

export function ImportWizard({ presets }: { presets: Preset[] }) {
  const [kind, setKind] = useState<ImportKind>("orders");
  const [source, setSource] = useState("globemerce");
  const [tab, setTab] = useState(MONTHS[new Date().getMonth()]);
  const [progress, setProgress] = useState("");
  const [file, setFile] = useState<string>("");
  const [raw, setRaw] = useState<Cell[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saveAs, setSaveAs] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const headers = useMemo(() => (raw[headerRow] ?? []).map((h, i) => (h == null || String(h).trim() === "" ? `Kolom ${i + 1}` : String(h).trim())), [raw, headerRow]);
  const body = useMemo(() => raw.slice(headerRow + 1), [raw, headerRow]);
  const fields = IMPORT_KINDS[kind].fields;
  const isSheet = kind === "sheet";
  const missing = isSheet ? [] : missingRequired(kind, mapping);

  function applyGuess(k: ImportKind, hs: string[], sample: Cell[][]) {
    const preset = presets.find((p) => p.kind === k && p.name === "default" && Object.values(p.mapping).every((h) => !h || hs.includes(h)));
    setMapping(preset ? preset.mapping : guessMapping(k, hs, sample));
  }

  async function onFile(f: File) {
    setError(""); setResult(null); setFile(f.name);
    try {
      let rows: Cell[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        rows = (await readSheet(f)) as Cell[][];
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        const text = await f.text();
        rows = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data;
      } else {
        throw new Error("Format belum didukung. Simpan file sebagai .xlsx atau .csv (file .xls lama: buka di Excel lalu Save As .xlsx).");
      }
      if (!rows.length) throw new Error("File kosong");
      const h = kind === "sheet" ? 0 : detectHeaderRow(rows);
      setRaw(rows);
      setHeaderRow(h);
      applyGuess(kind, (rows[h] ?? []).map((x, i) => (x == null || String(x).trim() === "" ? `Kolom ${i + 1}` : String(x).trim())), rows.slice(h + 1, h + 101));
    } catch (e) {
      setRaw([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function submit() {
    setError(""); setResult(null);
    start(async () => {
      // Kirim hanya kolom yang dipetakan, dipecah per CHUNK baris.
      const usedHeaders = isSheet ? [] : [...new Set(Object.values(mapping).filter(Boolean))];
      const cols = usedHeaders.map((h) => headers.indexOf(h));
      const data = isSheet ? raw : body.map((r) => cols.map((i) => r[i] ?? null));
      const total: ImportResult = { batchId: 0, total: 0, inserted: 0, updated: 0, skipped: 0, unmatched: 0, errors: [] };
      const step = isSheet ? data.length : CHUNK;
      for (let i = 0; i < data.length; i += step) {
        setProgress(data.length > step ? `Mengimpor ${Math.min(i + step, data.length)} / ${data.length} baris…` : "");
        const res = await runImport(
          { kind, source, filename: file, headers: usedHeaders, rows: data.slice(i, i + step), mapping, sheetTab: isSheet ? tab : undefined },
          saveAs && i === 0 ? "default" : undefined,
        );
        if (!res.ok) { setError(`${res.error}${i ? ` (berhenti di baris ${i + 1}; baris sebelumnya sudah tersimpan)` : ""}`); setProgress(""); return; }
        for (const k of ["total", "inserted", "updated", "skipped", "unmatched"] as const) total[k] += res.result[k];
        total.errors.push(...res.result.errors);
      }
      setProgress("");
      setResult(total);
    });
  }

  const fmt = (v: Cell) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v));

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">1. Jenis data</span>
          <select className="input" value={kind} onChange={(e) => {
            const k = e.target.value as ImportKind;
            setKind(k); setSource(IMPORT_KINDS[k].sources[0]); setResult(null); setRaw([]); setFile("");
          }}>
            {KIND_ORDER.map((k) => <option key={k} value={k}>{IMPORT_KINDS[k].label}</option>)}
          </select>
        </label>
        {isSheet ? (
          <label className="block">
            <span className="label">Tab bulan</span>
            <select className="input" value={tab} onChange={(e) => setTab(e.target.value)}>
              {MONTHS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="label">Sumber</span>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              {IMPORT_KINDS[kind].sources.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label">2. File (.xlsx / .csv)</span>
          <input key={kind} className="input" type="file" accept=".xlsx,.csv,.txt" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <p className="text-xs text-muted sm:col-span-3">{IMPORT_KINDS[kind].description}</p>
      </div>

      {raw.length > 0 && isSheet && (
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <p className="text-sm text-muted">{raw.length} baris dibaca dari file. Data akan diimpor sebagai tab <b>{tab}</b>.</p>
          <button className="btn-primary" disabled={pending} onClick={submit}>{pending ? "Mengimpor…" : `Impor tab ${tab}`}</button>
        </div>
      )}

      {raw.length > 0 && !isSheet && (
        <div className="card space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="label">Baris judul kolom</span>
              <input className="input !w-24" type="number" min={1} max={raw.length} value={headerRow + 1}
                onChange={(e) => { const h = Math.max(0, Number(e.target.value) - 1); setHeaderRow(h); applyGuess(kind, (raw[h] ?? []).map((x, i) => (x == null || String(x).trim() === "" ? `Kolom ${i + 1}` : String(x).trim())), raw.slice(h + 1, h + 101)); }} />
            </label>
            <p className="text-sm text-muted">{body.length} baris data · {headers.length} kolom</p>
          </div>

          <div>
            <div className="label">3. Cocokkan kolom</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="label">{f.label}{f.required && <span className="text-danger"> *</span>}</span>
                  <select className={`input ${f.required && !mapping[f.key] ? "!border-danger" : ""}`} value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                    <option value="">— tidak dipakai —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="label">Pratinjau 5 baris</div>
            <table className="tbl text-xs">
              <thead><tr>{fields.filter((f) => mapping[f.key]).map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
              <tbody>{body.slice(0, 5).map((r, i) => (
                <tr key={i}>{fields.filter((f) => mapping[f.key]).map((f) => <td key={f.key} className="max-w-48 truncate">{fmt(r[headers.indexOf(mapping[f.key])] ?? null)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!saveAs} onChange={(e) => setSaveAs(e.target.checked ? "default" : "")} /> Ingat pemetaan kolom ini untuk impor berikutnya</label>
            <button className="btn-primary" disabled={pending || missing.length > 0} onClick={submit}>{pending ? "Mengimpor…" : `Impor ${body.length} baris`}</button>
            {missing.length > 0 && <span className="text-xs text-danger">Wajib: {missing.join(", ")}</span>}
          </div>
        </div>
      )}

      {progress && <div className="text-sm text-muted">{progress}</div>}
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</div>}
      {result && (
        <div className="card p-4 text-sm">
          <div className="mb-2 font-medium">Impor selesai</div>
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-5">
            <li>Total: <b>{result.total}</b></li><li>Baru: <b>{result.inserted}</b></li><li>Diperbarui: <b>{result.updated}</b></li>
            <li>Dilewati: <b>{result.skipped}</b></li><li>Resi tak cocok: <b>{result.unmatched}</b></li>
          </ul>
          {result.errors.length > 0 && (
            <details className="mt-2"><summary className="cursor-pointer text-xs text-muted">{result.errors.length} catatan</summary>
              <ul className="mt-1 max-h-48 overflow-auto text-xs text-muted">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></details>
          )}
        </div>
      )}
    </div>
  );
}
