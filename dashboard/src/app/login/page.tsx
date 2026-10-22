"use client";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Glowlab Dashboard</h1>
          <p className="text-sm text-muted">Masuk untuk melanjutkan</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="username" defaultValue={state?.email} key={state?.email} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button className="btn-primary w-full justify-center" disabled={pending}>{pending ? "Memproses…" : "Masuk"}</button>
      </form>
    </main>
  );
}
