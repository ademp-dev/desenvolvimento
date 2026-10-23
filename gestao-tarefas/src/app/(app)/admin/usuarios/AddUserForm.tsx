"use client";

import { useActionState } from "react";
import { addUserAction, type AdminFormState } from "./actions";

export function AddUserForm({ domain }: { domain: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(addUserAction, {});
  return (
    <form action={action} className="card flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor="name">
          Nome
        </label>
        <input id="name" name="name" required className="input" />
      </div>
      <div className="min-w-64 flex-1">
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input id="email" name="email" type="email" required placeholder={domain ? `nome@${domain}` : ""} className="input" />
      </div>
      <button className="btn-primary" type="submit" disabled={pending}>
        Pré-cadastrar
      </button>
      {state.error && <p className="w-full text-sm text-[#d93025]">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
