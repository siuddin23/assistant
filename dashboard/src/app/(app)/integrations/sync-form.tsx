"use client";
import { useActionState } from "react";
import { syncNow } from "./actions";

export function SyncForm({ tabs, defaults, configured }: { tabs: string[]; defaults: string[]; configured: boolean }) {
  const [state, action, pending] = useActionState(syncNow, {});
  return (
    <form action={action} className="space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <label key={t} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs">
            <input type="checkbox" name="tab" value={t} defaultChecked={defaults.includes(t)} /> {t}
          </label>
        ))}
      </div>
      <button className="btn-primary" disabled={pending || !configured}>{pending ? "Menyinkron… (bisa 1–2 menit)" : "Sinkron sekarang"}</button>
      {!configured && <p className="text-xs text-danger">Isi GOOGLE_SERVICE_ACCOUNT_JSON dan SPREADSHEET_ID di environment, lalu share spreadsheet ke email service account.</p>}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && (
        <ul className="text-sm">
          {state.ok.map((s) => (
            <li key={s.tab}><b>{s.tab}</b>: {s.total} baris · {s.inserted} baru · {s.updated} diperbarui · {s.unchanged} tetap{s.warnings.length ? ` · ${s.warnings.length} catatan` : ""}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
