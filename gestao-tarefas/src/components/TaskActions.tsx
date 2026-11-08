"use client";

import { useActionState, useRef, useState } from "react";
import { addNoteAction, changeStatusAction, deleteTaskAction, handoffAction, type FormState } from "@/app/(app)/tarefas/actions";
import { isBackward, STATUS_LABEL } from "@/lib/status";
import { isOpen, toLocalInputValue, type TaskStatusValue } from "@/lib/time";

const BUTTON_LABEL: Record<TaskStatusValue, string> = {
  CRIADO: "Nova",
  ABERTA: "Abrir",
  EM_ANDAMENTO: "▶ Iniciar",
  PAUSADA: "⏸ Pausar",
  CONCLUIDO: "Concluir",
  CANCELADO: "Cancelar tarefa",
};

function buttonLabel(current: TaskStatusValue, to: TaskStatusValue) {
  if (isBackward(current, to)) return `${isOpen(current) ? "Voltar para" : "Reabrir como"} “${STATUS_LABEL[to]}”`;
  if (current === "PAUSADA" && to === "EM_ANDAMENTO") return "▶ Retomar";
  return BUTTON_LABEL[to];
}

/** Play e Pause são instantâneos (sem formulário de observação), como o relógio de um cronômetro. */
const isQuick = (current: TaskStatusValue, to: TaskStatusValue) => (to === "EM_ANDAMENTO" || to === "PAUSADA") && !isBackward(current, to);

interface StatusActionsProps {
  id: number;
  current: TaskStatusValue;
  allowed: TaskStatusValue[];
  /** Quando a tarefa foi iniciada (ISO), para sugerir o início ao concluir. */
  startedAt?: string | null;
}

export function StatusActions({ id, current, allowed, startedAt }: StatusActionsProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeStatusAction, {});
  const [target, setTarget] = useState<TaskStatusValue | null>(null);
  // Sugestão ao concluir: início = quando foi iniciada (ou agora); fim = agora. Ambos editáveis.
  const [period, setPeriod] = useState({ start: "", end: "" });

  function choose(s: TaskStatusValue) {
    if (s === "CONCLUIDO") {
      const now = toLocalInputValue(new Date());
      setPeriod({ start: toLocalInputValue(startedAt) || now, end: now });
    }
    setTarget(s);
  }

  if (allowed.length === 0) {
    return <p className="text-sm text-ink-3">Tarefa encerrada ({STATUS_LABEL[current]}). Somente um administrador pode reabri-la.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allowed.map((s) => {
          const className =
            s === "CANCELADO"
              ? "btn-danger"
              : isBackward(current, s)
                ? "btn-secondary"
                : s === "CONCLUIDO"
                  ? "btn bg-green-700 text-white hover:bg-green-800"
                  : s === "PAUSADA"
                    ? "btn bg-[#fde7c8] text-[#8a4b00] hover:bg-[#fbd9a8]"
                    : "btn-primary";
          return isQuick(current, s) ? (
            <form key={s} action={action}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value={s} />
              <button type="submit" className={className} disabled={pending}>
                {buttonLabel(current, s)}
              </button>
            </form>
          ) : (
            <button key={s} type="button" onClick={() => choose(s)} className={className}>
              {buttonLabel(current, s)}
            </button>
          );
        })}
      </div>
      {target && (
        <form action={action} className="space-y-2 rounded-lg border border-line bg-[#f2f6fc] p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={target} />
          {target === "CONCLUIDO" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="status-start">
                  Data-hora inicial *
                </label>
                <input
                  id="status-start"
                  name="startedAt"
                  type="datetime-local"
                  required
                  max={period.end}
                  value={period.start}
                  onChange={(e) => setPeriod({ ...period, start: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="status-end">
                  Data-hora final *
                </label>
                <input
                  id="status-end"
                  name="completedAt"
                  type="datetime-local"
                  required
                  min={period.start}
                  value={period.end}
                  onChange={(e) => setPeriod({ ...period, end: e.target.value })}
                  className="input"
                />
              </div>
            </div>
          )}
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

interface HandoffProps {
  id: number;
  users: { id: string; name: string; email: string }[];
  responsibleId: string;
  responsibleName: string;
}

/**
 * Passar a tarefa para outra pessoa. "Atribuir" redistribui; "Concluir minha
 * etapa e atribuir" registra que a parte de quem sai terminou. Nos dois casos
 * o tempo trabalhado até aqui fica com quem sai.
 */
export function HandoffForm({ id, users, responsibleId, responsibleName }: HandoffProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(handoffAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        👤 Atribuir / passar etapa
      </button>
    );
  }
  return (
    <form action={action} className="space-y-2 rounded-lg border border-line bg-[#f2f6fc] p-3">
      <input type="hidden" name="id" value={id} />
      <label className="label" htmlFor="handoff-user">
        Passar para
      </label>
      <select id="handoff-user" name="responsibleId" required defaultValue="" className="input">
        <option value="" disabled>
          Escolha a pessoa…
        </option>
        {users
          .filter((u) => u.id !== responsibleId)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
      </select>
      <textarea name="note" rows={2} maxLength={5000} className="input" placeholder="Recado (opcional)" aria-label="Recado" />
      <p className="text-xs text-ink-3">
        O tempo trabalhado por {responsibleName} fica registrado. A tarefa fica <b>Aberta</b> até a outra pessoa dar o Play.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="mode" value="etapa" className="btn bg-green-700 text-white hover:bg-green-800" disabled={pending}>
          ✔ Concluir minha etapa e atribuir
        </button>
        <button type="submit" name="mode" value="atribuir" className="btn-primary" disabled={pending}>
          Só atribuir
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Voltar
        </button>
      </div>
      {state.error && <p className="text-sm text-[#d93025]">{state.error}</p>}
    </form>
  );
}

/** "Excluir" tarefa encerrada (só administrador), com confirmação. */
export function DeleteTaskButton({ id, title }: { id: number; title: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(deleteTaskAction, {});
  return (
    <>
      <button type="button" className="icon-btn text-[#b3261e]" title="Excluir tarefa" aria-label="Excluir tarefa" onClick={() => setOpen(true)}>
        <span className="msi">delete</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-labelledby="del-task">
          <form action={action} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <input type="hidden" name="id" value={id} />
            <h2 id="del-task" className="text-base font-medium text-ink">
              Excluir a tarefa #{id}?
            </h2>
            <p className="text-sm break-words text-ink-2">
              “{title}” será apagada de vez, com observações, histórico e tempo trabalhado. <b>Não dá para desfazer.</b>
            </p>
            <p className="text-xs text-ink-3">Se veio de um e-mail, o e-mail volta a aparecer como “Nova” na extensão e no complemento do Gmail.</p>
            {state.error && <p className="rounded-lg bg-[#fce8e6] p-2 text-sm text-[#b3261e]">{state.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Voltar
              </button>
              <button type="submit" className="btn-danger" disabled={pending}>
                {pending ? "Excluindo…" : "Excluir tarefa"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
