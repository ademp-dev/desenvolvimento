"use client";

import { useActionState, useState } from "react";
import { deleteUserAction, type AdminFormState } from "./actions";

interface Props {
  user: { id: string; name: string; email: string };
  /** Tarefas abertas sob responsabilidade dele: precisam de outro responsável. */
  openTasks: number;
  /** Quem pode receber as tarefas abertas (usuários ativos, menos ele). */
  others: { id: string; name: string; email: string }[];
}

/** "Excluir": confirma e, se o usuário tiver tarefas abertas, pede para quem passá-las. */
export function DeleteUserButton({ user, openTasks, others }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminFormState, FormData>(deleteUserAction, {});

  if (!open) {
    return (
      <button type="button" className="icon-btn text-[#b3261e]" title="Excluir usuário" aria-label={`Excluir ${user.name}`} onClick={() => setOpen(true)}>
        <span className="msi">delete</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-labelledby={`del-${user.id}`}>
      <form action={action} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <input type="hidden" name="id" value={user.id} />
        <h2 id={`del-${user.id}`} className="text-base font-medium text-ink">
          Excluir {user.name}?
        </h2>
        <p className="text-sm text-ink-2">
          {user.email} deixa de entrar no sistema e some de todas as listas (sistema, extensão do Chrome e complemento do Gmail). Se já trabalhou
          em tarefas, o nome continua no histórico delas.
        </p>
        {openTasks > 0 && (
          <div>
            <label className="label" htmlFor={`to-${user.id}`}>
              Passar as {openTasks} tarefa(s) aberta(s) para *
            </label>
            <select id={`to-${user.id}`} name="transferTo" required defaultValue="" className="input">
              <option value="" disabled>
                Escolha a pessoa…
              </option>
              {others.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        )}
        {state.error && <p className="rounded-lg bg-[#fce8e6] p-2 text-sm text-[#b3261e]">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Voltar
          </button>
          <button type="submit" className="btn-danger" disabled={pending}>
            {pending ? "Excluindo…" : "Excluir usuário"}
          </button>
        </div>
      </form>
    </div>
  );
}
