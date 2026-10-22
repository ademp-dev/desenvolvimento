import Link from "next/link";
import { EmailCard } from "@/components/EmailCard";
import { TaskForm } from "@/components/TaskForm";
import { requireUser } from "@/lib/current-user";
import { getMessage, GmailNotAuthorizedError, type EmailMetadata } from "@/lib/gmail";
import { assignableUsers, tasksForMessage } from "@/lib/task-service";
import { STATUS_LABEL } from "@/lib/status";
import { toLocalInputValue, type TaskStatusValue } from "@/lib/time";
import { extractEmail } from "@/lib/address";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const user = await requireUser();
  const { gmail } = await searchParams;
  const users = await assignableUsers();

  let email: EmailMetadata | null = null;
  let emailError: string | null = null;
  if (gmail) {
    try {
      email = await getMessage(user.id, user.email, gmail);
    } catch (e) {
      emailError = e instanceof GmailNotAuthorizedError ? "Autorize o acesso ao Gmail para importar o e-mail." : "Não foi possível ler o e-mail.";
    }
  }
  const existing = email ? await tasksForMessage(user, email.gmailMessageId) : [];
  const nowLocal = toLocalInputValue(new Date());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {emailError && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          {emailError}{" "}
          <Link href="/tarefas/email" className="font-medium underline">
            Ir para o Gmail
          </Link>
        </p>
      )}
      {email && <EmailCard {...email} />}
      {existing.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Já existe tarefa para este e-mail:{" "}
          {existing.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <Link href={`/tarefas/${t.id}`} className="font-medium underline">
                #{t.id} {t.title}
              </Link>{" "}
              ({STATUS_LABEL[t.status as TaskStatusValue]})
            </span>
          ))}
          . Você pode criar outra mesmo assim.
        </div>
      )}
      <TaskForm
        users={users}
        gmailMessageId={email?.gmailMessageId}
        cancelHref={email ? "/tarefas/email" : "/tarefas"}
        nowLocal={nowLocal}
        heading={email ? "Nova tarefa a partir de e-mail" : "Nova tarefa"}
        initial={{
          title: email?.subject.slice(0, 200) ?? "",
          description: email ? `E-mail de ${email.sender}\n\n${email.snippet}` : "",
          responsibleId: user.id,
          // Tarefa vinda de e-mail: o solicitante é o remetente.
          requesterEmail: (email ? extractEmail(email.sender) : null) ?? "",
          createdAt: nowLocal,
          dueAt: "",
        }}
      />
    </div>
  );
}
