import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AddonAuthError, authenticateAddon } from "@/lib/addon-auth";
import { extractEmail } from "@/lib/address";
import { gmailLink } from "@/lib/gmail";
import { createTask, ServiceError } from "@/lib/task-service";
import { parseLocalDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  responsibleId: z.string(),
  requesterEmail: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(), // "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm" (horário de Brasília)
  email: z.object({
    gmailMessageId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
    threadId: z.string().nullable().optional(),
    subject: z.string().max(1000),
    sender: z.string().max(1000),
    recipients: z.array(z.string().max(1000)).max(500),
    emailDate: z.string().nullable().optional(),
    direction: z.enum(["RECEBIDO", "ENVIADO"]),
  }),
});

/** Cria tarefa a partir da mensagem aberta no Gmail (complemento). */
export async function POST(req: Request) {
  try {
    const user = await authenticateAddon(req);
    const body = bodySchema.parse(await req.json());
    const dueAt = body.dueAt ? parseLocalDateTime(body.dueAt) : null;
    if (body.dueAt && !dueAt) return NextResponse.json({ error: "Prazo inválido" }, { status: 400 });
    const emailDate = body.email.emailDate ? new Date(body.email.emailDate) : null;

    const task = await createTask(
      user,
      {
        title: body.title,
        description: body.description,
        responsibleId: body.responsibleId,
        // Sem solicitante informado, usa o remetente do e-mail.
        requesterEmail: body.requesterEmail?.trim() || extractEmail(body.email.sender) || "",
        createdAt: new Date(),
        status: "CRIADO",
        completedAt: null,
        dueAt,
      },
      {
        gmailMessageId: body.email.gmailMessageId,
        threadId: body.email.threadId ?? null,
        subject: body.email.subject,
        sender: body.email.sender,
        recipients: body.email.recipients,
        emailDate: emailDate && !Number.isNaN(emailDate.getTime()) ? emailDate : null,
        direction: body.email.direction,
        // A caixa é sempre a do usuário autenticado; o link é montado aqui.
        mailbox: user.email,
        link: gmailLink(user.email, body.email.gmailMessageId),
      },
    );
    const base = process.env.AUTH_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
    return NextResponse.json({ id: task.id, url: `${base}/tarefas/${task.id}` }, { status: 201 });
  } catch (e) {
    if (e instanceof AddonAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
