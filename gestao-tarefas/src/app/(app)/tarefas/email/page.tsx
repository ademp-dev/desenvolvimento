import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { GmailNotAuthorizedError, hasGmailAccess, searchMessages, type EmailMetadata } from "@/lib/gmail";
import { formatDateTime } from "@/lib/time";
import { prisma } from "@/lib/db";
import { canViewTask } from "@/lib/permissions";
import { authorizeGmailAction, disconnectGmailAction } from "./actions";

const DEFAULT_QUERY = "newer_than:14d -in:chats";

export default async function FromEmailPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireUser();
  const { q = DEFAULT_QUERY, page } = await searchParams;

  if (!(await hasGmailAccess(user.id))) return <AuthorizeGmail />;

  let result: { messages: EmailMetadata[]; nextPageToken?: string };
  try {
    result = await searchMessages(user.id, user.email, q.slice(0, 500), page);
  } catch (e) {
    if (e instanceof GmailNotAuthorizedError) return <AuthorizeGmail expired />;
    throw e;
  }

  // Marca e-mails que já viraram tarefa (visíveis a este usuário).
  const linked = await prisma.task.findMany({
    where: { email: { gmailMessageId: { in: result.messages.map((m) => m.gmailMessageId) } } },
    select: { id: true, responsibleId: true, createdById: true, email: { select: { gmailMessageId: true } } },
  });
  const taskByMessage = new Map<string, number>();
  for (const t of linked) if (canViewTask(user, t) && t.email) taskByMessage.set(t.email.gmailMessageId, t.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[22px] text-ink">Criar tarefa a partir do Gmail</h1>
          <p className="text-sm text-ink-3">Sua caixa: {user.email}. Apenas você vê os seus e-mails.</p>
        </div>
        <form action={disconnectGmailAction}>
          <button className="btn-secondary text-xs" type="submit">
            Desconectar Gmail
          </button>
        </form>
      </div>

      <form method="get" className="card flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          className="input flex-1"
          aria-label="Pesquisa no Gmail"
          placeholder='Busca do Gmail. Ex.: from:fulano@x.com, subject:contrato, in:sent, newer_than:7d'
        />
        <button className="btn-primary" type="submit">
          Pesquisar
        </button>
        <div className="flex w-full flex-wrap gap-2 text-xs">
          {[
            ["Recebidos (14 dias)", "in:inbox newer_than:14d"],
            ["Enviados (14 dias)", "in:sent newer_than:14d"],
            ["Com estrela", "is:starred"],
            ["Não lidos", "is:unread in:inbox"],
          ].map(([label, query]) => (
            <Link key={query} href={`/tarefas/email?q=${encodeURIComponent(query)}`} className="rounded-full bg-[#f2f6fc] px-2.5 py-1 hover:bg-nav-active">
              {label}
            </Link>
          ))}
        </div>
      </form>

      {result.messages.length === 0 ? (
        <div className="card text-center text-sm text-ink-3">Nenhum e-mail encontrado.</div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {result.messages.map((m) => {
            const taskId = taskByMessage.get(m.gmailMessageId);
            return (
              <li key={m.gmailMessageId} className="flex flex-wrap items-start gap-3 p-3 hover:bg-nav-hover/50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 text-[10px] font-semibold uppercase ${m.direction === "ENVIADO" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>
                      {m.direction === "ENVIADO" ? "Enviado" : "Recebido"}
                    </span>
                    <span className="truncate font-medium">{m.subject}</span>
                  </div>
                  <div className="truncate text-xs text-ink-3">
                    {m.direction === "ENVIADO" ? `Para: ${m.recipients.join(", ")}` : `De: ${m.sender}`} · {formatDateTime(m.emailDate)}
                  </div>
                  <div className="truncate text-xs text-ink-3">{m.snippet}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <a href={m.link} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
                    Abrir ↗
                  </a>
                  {taskId && (
                    <Link href={`/tarefas/${taskId}`} className="btn-secondary text-xs">
                      Tarefa #{taskId}
                    </Link>
                  )}
                  <Link href={`/tarefas/nova?gmail=${encodeURIComponent(m.gmailMessageId)}`} className="btn-primary text-xs">
                    Criar tarefa
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {result.nextPageToken && (
        <Link className="btn-secondary" href={`/tarefas/email?q=${encodeURIComponent(q)}&page=${encodeURIComponent(result.nextPageToken)}`}>
          Mais antigos →
        </Link>
      )}
    </div>
  );
}

function AuthorizeGmail({ expired = false }: { expired?: boolean }) {
  return (
    <div className="card mx-auto max-w-xl space-y-3 p-6">
      <h1 className="text-xl font-bold">Conectar ao Gmail</h1>
      {expired && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">A autorização expirou ou foi revogada.</p>}
      <p className="text-sm text-ink-2">
        Para escolher e-mails e transformá-los em tarefas aqui no app, autorize a <strong>leitura</strong> da sua caixa do Gmail. O app:
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
        <li>só lê a sua própria caixa, quando você pesquisa nesta tela;</li>
        <li>não envia, apaga nem altera e-mails;</li>
        <li>guarda apenas assunto, remetente, destinatários, data e link dos e-mails que viram tarefa.</li>
      </ul>
      <p className="text-sm text-ink-3">Você pode desconectar a qualquer momento. Alternativa: use o complemento no painel lateral do Gmail.</p>
      <form action={authorizeGmailAction}>
        <button className="btn-primary" type="submit">
          Autorizar leitura do Gmail
        </button>
      </form>
    </div>
  );
}
