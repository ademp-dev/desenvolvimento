"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveTaskAction, type FormState } from "@/app/(app)/tarefas/actions";
import { INITIAL_STATUSES, STATUS_LABEL } from "@/lib/status";
import type { TaskStatusValue } from "@/lib/time";
import { Icon } from "./Icon";

interface Props {
  users: { id: string; name: string; email: string }[];
  initial: {
    id?: number;
    title: string;
    description: string;
    responsibleId: string;
    requesterEmail: string;
    createdAt: string; // "YYYY-MM-DDTHH:mm" no fuso do app
    dueAt: string;
  };
  /** Momento atual no fuso do app ("YYYY-MM-DDTHH:mm"), limite máximo das datas. */
  nowLocal: string;
  gmailMessageId?: string;
  cancelHref: string;
  heading: string;
}

export function TaskForm({ users, initial, nowLocal, gmailMessageId, cancelHref, heading }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTaskAction, {});
  const isNew = !initial.id;
  const [status, setStatus] = useState<TaskStatusValue>("CRIADO");
  const [requester, setRequester] = useState(initial.requesterEmail);
  const requesterUser = users.find((u) => u.email.toLowerCase() === requester.trim().toLowerCase());

  return (
    <form
      action={action}
      className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_10px_1px_rgba(0,0,0,.14),0_3px_14px_2px_rgba(0,0,0,.12),0_5px_5px_-3px_rgba(0,0,0,.2)]"
    >
      <div className="flex items-center justify-between bg-[#f2f6fc] px-4 py-2.5">
        <span className="text-sm font-medium text-ink">{heading}</span>
        <Link href={cancelHref} className="icon-btn h-7 w-7" aria-label="Fechar" title="Fechar">
          <Icon name="close" size={18} />
        </Link>
      </div>
      <div className="space-y-4 p-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {gmailMessageId && <input type="hidden" name="gmailMessageId" value={gmailMessageId} />}

      <div>
        <label className="label" htmlFor="title">
          Título *
        </label>
        <input id="title" name="title" required minLength={3} maxLength={200} defaultValue={initial.title} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Descrição
        </label>
        <textarea id="description" name="description" rows={6} maxLength={10000} defaultValue={initial.description} className="input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="requesterEmail">
            Solicitante (e-mail) *
          </label>
          <input
            id="requesterEmail"
            name="requesterEmail"
            type="email"
            required
            list="users-emails"
            value={requester}
            onChange={(e) => setRequester(e.target.value)}
            placeholder="email@exemplo.com"
            className="input"
            autoComplete="off"
          />
          <datalist id="users-emails">
            {users.map((u) => (
              <option key={u.id} value={u.email}>
                {u.name}
              </option>
            ))}
          </datalist>
          <p className="mt-1 h-5 text-xs">
            {requesterUser ? (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-800 ring-1 ring-indigo-200 ring-inset">
                👤 {requesterUser.name}
              </span>
            ) : (
              <span className="text-ink-3">Digite o e-mail ou escolha um colega da lista.</span>
            )}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="responsibleId">
            Responsável *
          </label>
          <select id="responsibleId" name="responsibleId" required defaultValue={initial.responsibleId} className="input">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="createdAt">
            Data da criação *
          </label>
          <input id="createdAt" name="createdAt" type="datetime-local" required max={nowLocal} defaultValue={initial.createdAt} className="input" />
          <p className="mt-1 text-xs text-ink-3">Pode ser uma data passada. A contagem de tempo começa aqui.</p>
        </div>
        <div>
          <label className="label" htmlFor="dueAt">
            Prazo para conclusão
          </label>
          <input id="dueAt" name="dueAt" type="datetime-local" defaultValue={initial.dueAt} className="input" />
          <p className="mt-1 text-xs text-ink-3">Opcional. Horário de Brasília.</p>
        </div>
      </div>

      {isNew && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="status">
              Status da tarefa *
            </label>
            <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatusValue)} className="input">
              {INITIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {status === "CONCLUIDO" && (
            <>
              <div>
                <label className="label" htmlFor="startedAt">
                  Data-hora inicial *
                </label>
                <input id="startedAt" name="startedAt" type="datetime-local" required max={nowLocal} defaultValue={initial.createdAt} className="input" />
                <p className="mt-1 text-xs text-ink-3">Quando a execução começou.</p>
              </div>
              <div>
                <label className="label" htmlFor="completedAt">
                  Data-hora final *
                </label>
                <input id="completedAt" name="completedAt" type="datetime-local" required max={nowLocal} defaultValue={nowLocal} className="input" />
              </div>
            </>
          )}
        </div>
      )}

      {state.error && <p className="rounded-lg bg-[#fce8e6] p-3 text-sm text-[#b3261e]">{state.error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" className="btn-primary px-6" disabled={pending}>
          {pending ? "Salvando…" : isNew ? "Criar tarefa" : "Salvar"}
        </button>
        <Link href={cancelHref} className="btn-text">
          Cancelar
        </Link>
      </div>
      </div>
    </form>
  );
}
