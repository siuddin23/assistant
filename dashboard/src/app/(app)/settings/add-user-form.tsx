"use client";
import { useState, useTransition } from "react";
import { addUser } from "./actions";

export function AddUserForm() {
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    start(async () => {
      const r = await addUser(null, new FormData(formEl));
      setState(r);
      if (r.ok) formEl.reset();
    });
  };
  return (
    <form onSubmit={onSubmit} className="grid gap-2 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-6">
      <input className="input" name="name" placeholder="Nama" required />
      <input className="input" name="email" type="email" placeholder="Email" required />
      <input className="input" name="password" type="password" placeholder="Password (min. 8)" required minLength={8} />
      <select className="input" name="role" defaultValue="cs"><option value="cs">CS</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select>
      <input className="input" name="csCode" placeholder="Kode CS (mis. FTRH)" />
      <button className="btn-primary justify-center" disabled={pending}>Tambah user</button>
      {state.error && <p className="text-sm text-danger sm:col-span-6">{state.error}</p>}
      {state.ok && <p className="text-sm text-accent sm:col-span-6">{state.ok}</p>}
    </form>
  );
}
