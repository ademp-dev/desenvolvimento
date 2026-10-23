"use client";

import { useActionState, useRef, useState } from "react";
import { addNoteAction, changeStatusAction, type FormState } from "@/app/(app)/tarefas/actions";
import { isBackward, STATUS_LABEL } from "@/lib/status";
import { isOpen, type TaskStatusValue } from "@/lib/time";

const BUTTON_LABEL: Record<TaskStatusValue, string> = {
  CRIADO: "Nova",
  ABERTA: "Abrir",
  EM_ANDAMENTO: "Iniciar",
  CONCLUIDO: "Concluir",
  CANCELADO: "Cancelar tarefa",
};

function buttonLabel(current: TaskStatusValue, to: TaskStatusValue) {
  if (isBackward(current, to)) return `${isOpen(current) ? "Voltar para" : "Reabrir como"} “${STATUS_LABEL[to]}”`;
  return BUTTON_LABEL[to];
}

export function StatusActions({ id, current, allowed }: { id: number; current: TaskStatusValue; allowed: TaskStatusValue[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeStatusAction, {});
  const [target, setTarget] = useState<TaskStatusValue | null>(null);

  if (allowed.length === 0) {
    return <p className="text-sm text-ink-3">Tarefa encerrada ({STATUS_LABEL[current]}). Somente um administrador pode reabri-la.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allowed.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTarget(s)}
            className={
              s === "CANCELADO"
                ? "btn-danger"
                : isBackward(current, s)
                  ? "btn-secondary"
                  : s === "CONCLUIDO"
                    ? "btn bg-green-700 text-white hover:bg-green-800"
                    : "btn-primary"
            }
          >
            {buttonLabel(current, s)}
          </button>
        ))}
      </div>
      {target && (
        <form action={action} className="space-y-2 rounded-lg border border-line bg-[#f2f6fc] p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={target} />
          <label className="label" htmlFor="status-note">
            Mudar para “{STATUS_LABEL[target]}” — observação {target === "CANCELADO" ? "(motivo)" : "(opcional)"}
          </label>
          <textarea id="status-note" name="note" rows={2} className="input" required={target === "CANCELADO"} maxLength={5000} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Salvando…" : "Confirmar"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setTarget(null)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {state.error && <p className="rounded-lg bg-[#fce8e6] p-2 text-sm text-[#b3261e]">{state.error}</p>}
    </div>
  );
}

export function NoteForm({ id }: { id: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const res = await addNoteAction(prev, fd);
    if (!res.error) formRef.current?.reset();
    return res;
  }, {});
  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea name="text" rows={3} required maxLength={5000} className="input" placeholder="Adicionar observação…" aria-label="Nova observação" />
      {state.error && <p className="text-sm text-[#d93025]">{state.error}</p>}
      <button className="btn-secondary" type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Adicionar observação"}
      </button>
    </form>
  );
}
