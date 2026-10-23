import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Brand";
import { DueInfo, Elapsed } from "@/components/Elapsed";
import { EmailCard } from "@/components/EmailCard";
import { Icon } from "@/components/Icon";
import { OriginBadge, StatusBadge } from "@/components/StatusBadge";
import { NoteForm, StatusActions } from "@/components/TaskActions";
import { requireUser } from "@/lib/current-user";
import { canEditTask, isAdmin } from "@/lib/permissions";
import { allowedTransitions } from "@/lib/status";
import { getTaskForUser } from "@/lib/task-service";
import { formatDateTime, isOpen, type TaskStatusValue } from "@/lib/time";

const ACTION_LABEL: Record<string, string> = {
  CRIACAO: "Criação",
  STATUS: "Status",
  EDICAO: "Edição",
  ATRIBUICAO: "Atribuição",
  OBSERVACAO: "Observação",
};

const ACTION_ICON: Record<string, string> = {
  CRIACAO: "add_circle",
  STATUS: "swap_horiz",
  EDICAO: "edit",
  ATRIBUICAO: "person",
  OBSERVACAO: "chat",
};

/** Tela da tarefa no formato de um e-mail aberto no Gmail. */
export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const task = await getTaskForUser(user, Number(id));
  if (!task) notFound();

  const status = task.status as TaskStatusValue;
  const editable = canEditTask(user, task);
  const closed = !isOpen(status);
  const timer = {
    status,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    canceledAt: task.canceledAt?.toISOString(),
    dueAt: task.dueAt?.toISOString(),
  };
  const requesterEmail = task.requester?.email ?? "";

  return (
    <div className="space-y-2">
      {/* Barra de ferramentas, como a do e-mail aberto */}
      <div className="-mt-2 flex items-center gap-1 border-b border-line pb-1">
        <Link href="/tarefas" className="icon-btn" title="Voltar" aria-label="Voltar">
          <Icon name="arrow_back" />
        </Link>
        {editable && !closed && (
          <Link href={`/tarefas/${task.id}/editar`} className="icon-btn" title="Editar" aria-label="Editar">
            <Icon name="edit" />
          </Link>
        )}
        {task.email && (
          <a href={task.email.link} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Abrir e-mail original" aria-label="Abrir e-mail original">
            <Icon name="open_in_new" />
          </a>
        )}
        <span className="ml-auto px-2 text-xs text-ink-3">Tarefa #{task.id}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <article className="min-w-0">
          {/* Assunto */}
          <div className="flex flex-wrap items-center gap-3 py-3 pl-2 md:pl-14">
            <h1 className="text-[22px] break-words text-ink">{task.title}</h1>
            <StatusBadge status={status} />
            <OriginBadge origin={task.origin} />
          </div>

          {/* Cabeçalho como o remetente do e-mail */}
          <div className="flex gap-3 px-2">
            <span className="hidden md:block">
              <Avatar name={task.requester?.name} email={requesterEmail || "?"} size={40} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <div className="min-w-0 text-sm">
                  <span className="font-bold text-ink">{task.requester?.name ?? (requesterEmail || "Sem solicitante")}</span>{" "}
                  {task.requester?.name && <span className="text-xs text-ink-3">&lt;{requesterEmail}&gt;</span>}
                  <div className="text-xs text-ink-3">
                    para <span className="text-ink-2">{task.responsible.name}</span> · criada por {task.createdBy.name}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-3">
                  <span title="Data da criação">{formatDateTime(task.createdAt)}</span>
                  <span className="rounded-full bg-[#f2f6fc] px-2 py-0.5 text-ink-2" title="Tempo decorrido">
                    <Elapsed {...timer} showOverdue={false} />
                  </span>
                </div>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <DueInfo {...timer} />
              </div>

              {/* Corpo */}
              <div className="mt-5 text-sm leading-relaxed text-ink">
                {task.description ? <p className="whitespace-pre-wrap">{task.description}</p> : <p className="text-ink-3 italic">Sem descrição.</p>}
              </div>
              {task.email && (
                <div className="mt-5">
                  <EmailCard {...task.email} />
                </div>
              )}

              {/* Ações de status, como os botões Responder/Encaminhar */}
              {editable && (
                <div className="mt-6">
                  <StatusActions key={status} id={task.id} current={status} allowed={allowedTransitions(status, isAdmin(user))} />
                </div>
              )}

              {/* Observações, como as respostas de uma conversa */}
              <div className="mt-8 space-y-3">
                <h2 className="text-sm font-medium text-ink-2">Observações ({task.notes.length})</h2>
                {task.notes.map((n) => (
                  <div key={n.id} className="flex gap-3 rounded-2xl border border-line p-3">
                    <Avatar name={n.author.name} email={n.author.email} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="font-bold text-ink">{n.author.name}</span>
                        <span className="text-ink-3">{formatDateTime(n.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{n.text}</p>
                    </div>
                  </div>
                ))}
                {editable && <NoteForm id={task.id} />}
              </div>
            </div>
          </div>
        </article>

        {/* Painel lateral de detalhes e histórico */}
        <aside className="space-y-4">
          <div className="rounded-2xl bg-[#f2f6fc] p-4">
            <h2 className="mb-3 text-sm font-medium text-ink">Detalhes</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-ink-3">Tempo</dt>
              <dd className="font-medium">
                <Elapsed {...timer} />
              </dd>
              <dt className="text-ink-3">Solicitante</dt>
              <dd className="break-all">{requesterEmail || "—"}</dd>
              <dt className="text-ink-3">Responsável</dt>
              <dd>
                {task.responsible.name}
                <div className="text-xs break-all text-ink-3">{task.responsible.email}</div>
              </dd>
              <dt className="text-ink-3">Criada em</dt>
              <dd className="tabular-nums">{formatDateTime(task.createdAt)}</dd>
              <dt className="text-ink-3">Prazo</dt>
              <dd className="tabular-nums">{formatDateTime(task.dueAt)}</dd>
              <dt className="text-ink-3">Iniciada em</dt>
              <dd className="tabular-nums">{formatDateTime(task.startedAt)}</dd>
              {task.completedAt && (
                <>
                  <dt className="text-ink-3">Concluída em</dt>
                  <dd className="tabular-nums">{formatDateTime(task.completedAt)}</dd>
                </>
              )}
              {task.canceledAt && (
                <>
                  <dt className="text-ink-3">Cancelada em</dt>
                  <dd className="tabular-nums">{formatDateTime(task.canceledAt)}</dd>
                </>
              )}
              <dt className="text-ink-3">Atualizada</dt>
              <dd className="tabular-nums">{formatDateTime(task.updatedAt)}</dd>
            </dl>
          </div>

          <div className="rounded-2xl border border-line p-4">
            <h2 className="mb-3 text-sm font-medium text-ink">Histórico de alterações</h2>
            <ol className="space-y-3">
              {task.history.map((h) => (
                <li key={h.id} className="flex gap-2 text-sm">
                  <Icon name={ACTION_ICON[h.action] ?? "history"} size={18} className="mt-0.5 text-ink-3" />
                  <div className="min-w-0">
                    <div className="text-xs text-ink-3">
                      {formatDateTime(h.createdAt)} · {h.author.name}
                    </div>
                    <div className="text-ink">
                      {ACTION_LABEL[h.action] ?? h.action}
                      {h.field && h.action !== "STATUS" && <span className="text-ink-2"> · {h.field}</span>}
                    </div>
                    {h.oldValue !== null || h.action === "STATUS" ? (
                      <div className="text-xs break-words text-ink-2">
                        <span className="text-ink-3 line-through">{(h.oldValue ?? "—").slice(0, 300)}</span> → {(h.newValue ?? "—").slice(0, 300)}
                      </div>
                    ) : (
                      h.newValue && <div className="text-xs break-words text-ink-2">{h.newValue.slice(0, 300)}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
