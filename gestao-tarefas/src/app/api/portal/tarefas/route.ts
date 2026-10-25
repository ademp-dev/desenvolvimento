import { NextResponse } from "next/server";
import { z } from "zod";
import { appBaseUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { portalKeyOk } from "@/lib/portal-auth";
import { createTask, ServiceError } from "@/lib/task-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  responsibleEmail: z.string().trim().toLowerCase().email(),
  requesterEmail: z.string().trim().toLowerCase().email(),
  dueAt: z.string().nullable().optional(),
});

/**
 * Cria uma tarefa a partir do "encaminhamento de serviço" do portal ADEMP
 * (ex.: pedido de cálculo ou de pagamento de custas num processo do Jurídico).
 * Quem pediu no portal vira o solicitante; se ele também tiver conta aqui, é o autor.
 */
export async function POST(req: Request) {
  if (!portalKeyOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const responsible = await prisma.user.findUnique({ where: { email: body.responsibleEmail } });
  if (!responsible || !responsible.active) {
    return NextResponse.json({ error: "Responsável não encontrado no sistema de tarefas" }, { status: 422 });
  }
  const requester = await prisma.user.findUnique({ where: { email: body.requesterEmail } });
  const author = requester?.active ? requester : responsible;

  const dueAt = body.dueAt ? new Date(body.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "Prazo inválido" }, { status: 400 });

  try {
    const task = await createTask(
      { id: author.id, role: author.role, active: author.active },
      {
        title: body.title,
        description: body.description,
        responsibleId: responsible.id,
        requesterEmail: body.requesterEmail,
        createdAt: new Date(),
        dueAt,
        status: "CRIADO",
        completedAt: null,
      },
    );
    return NextResponse.json({ id: task.id, url: `${appBaseUrl(req)}/tarefas/${task.id}` }, { status: 201 });
  } catch (e) {
    if (e instanceof ServiceError || e instanceof z.ZodError) {
      const message = e instanceof z.ZodError ? e.issues[0]?.message : e.message;
      return NextResponse.json({ error: message }, { status: 422 });
    }
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
