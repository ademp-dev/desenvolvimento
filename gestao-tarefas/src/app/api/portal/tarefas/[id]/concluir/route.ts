import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canEditTask } from "@/lib/permissions";
import { portalKeyOk } from "@/lib/portal-auth";
import { changeStatus, ServiceError } from "@/lib/task-service";
import { isOpen, type TaskStatusValue } from "@/lib/time";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  actorEmail: z.string().trim().toLowerCase().email(),
  note: z.string().max(5000).default(""),
  /** Data/hora da conclusão informada no portal (ISO). Futura ou anterior à criação = agora. */
  completedAt: z.string().nullable().optional(),
});

/**
 * Conclui a tarefa quando o serviço é marcado como concluído no portal ADEMP
 * (encaminhamento de serviço do Jurídico). Quem marcou no portal é o autor,
 * se tiver conta e acesso à tarefa; senão, o próprio responsável.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!portalKeyOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Tarefa inválida" }, { status: 400 });

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: { responsible: true, workSessions: { select: { startedAt: true }, orderBy: { startedAt: "asc" } } },
  });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  if (!isOpen(task.status as TaskStatusValue)) {
    // Já concluída ou cancelada no sistema de tarefas: nada a fazer.
    return NextResponse.json({ ok: true, status: task.status, unchanged: true });
  }

  const marcou = await prisma.user.findUnique({ where: { email: body.actorEmail } });
  const actor =
    marcou?.active && canEditTask(marcou, task)
      ? { id: marcou.id, role: marcou.role, active: marcou.active }
      : { id: task.responsible.id, role: task.responsible.role, active: true };

  const now = new Date();
  let completedAt = body.completedAt ? new Date(body.completedAt) : now;
  // Com tempo trabalhado registrado (Play), a conclusão não pode ser antes do último Play.
  const lastPlay = task.workSessions.at(-1)?.startedAt;
  if (Number.isNaN(completedAt.getTime()) || completedAt > now || completedAt < task.createdAt || (lastPlay && completedAt < lastPlay)) {
    completedAt = now;
  }

  try {
    await changeStatus(actor, id, "CONCLUIDO", body.note || "Concluída pelo portal ADEMP (serviço marcado como concluído).", {
      completedAt,
      // Sem Play registrado, o início é o do portal; com Play, vale o primeiro Play.
      startedAt: lastPlay ? undefined : task.startedAt && task.startedAt <= completedAt ? task.startedAt : completedAt,
    });
    return NextResponse.json({ ok: true, status: "CONCLUIDO" });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
