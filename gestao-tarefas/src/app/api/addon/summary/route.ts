import { NextResponse } from "next/server";
import { AddonAuthError, authenticateAddon } from "@/lib/addon-auth";
import { appBaseUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/status";
import { elapsedMs, formatDateTime, formatDuration, isOverdue, OPEN_STATUSES, type TaskStatusValue } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Resumo para o modal do complemento (janela de escrever): números e as
 * tarefas abertas sob responsabilidade do usuário, das mais urgentes às demais.
 */
export async function GET(req: Request) {
  try {
    const user = await authenticateAddon(req);
    const base = appBaseUrl(req);
    const now = new Date();
    const open = await prisma.task.findMany({
      where: { responsibleId: user.id, status: { in: OPEN_STATUSES } },
      select: { id: true, title: true, status: true, createdAt: true, dueAt: true, completedAt: true, canceledAt: true },
    });

    const counts = { CRIADO: 0, ABERTA: 0, EM_ANDAMENTO: 0, overdue: 0 };
    for (const t of open) {
      counts[t.status as "CRIADO" | "ABERTA" | "EM_ANDAMENTO"]++;
      if (isOverdue(t, now)) counts.overdue++;
    }

    // Vencidas primeiro, depois prazo mais próximo, depois sem prazo (mais antigas primeiro).
    const sorted = [...open].sort((a, b) => {
      const da = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db || a.createdAt.getTime() - b.createdAt.getTime();
    });

    return NextResponse.json({
      user: { name: user.name, email: user.email },
      appUrl: base,
      counts,
      total: open.length,
      tasks: sorted.slice(0, 10).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        statusLabel: STATUS_LABEL[t.status as TaskStatusValue],
        elapsed: formatDuration(elapsedMs(t, now)),
        overdue: isOverdue(t, now),
        due: t.dueAt ? formatDateTime(t.dueAt) : null,
        url: `${base}/tarefas/${t.id}`,
      })),
    });
  } catch (e) {
    if (e instanceof AddonAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
