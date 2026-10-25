import { NextResponse } from "next/server";
import { allowedDomain, appBaseUrl } from "@/lib/config";
import { prisma } from "@/lib/db";
import { portalKeyOk } from "@/lib/portal-auth";
import { formatDateTime, isOverdue, OPEN_STATUSES } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Resumo das tarefas de um usuário para o painel do portal ADEMP (ademp.app.br),
 * pelo e-mail do usuário logado no portal. Só responde para contas do domínio autorizado.
 */
export async function GET(req: Request) {
  if (!portalKeyOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
  const domain = allowedDomain();
  if (!email || !domain || !email.endsWith(`@${domain}`)) {
    return NextResponse.json({ error: "E-mail fora do domínio autorizado" }, { status: 400 });
  }

  const base = appBaseUrl(req);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    // Ainda não entrou no sistema de tarefas (ou foi desativado): o portal mostra só o botão.
    return NextResponse.json({ found: false, appUrl: base });
  }

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

  // Vencidas e prazo mais próximo primeiro; sem prazo por último.
  const next = [...open]
    .sort((a, b) => {
      const da = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db || a.createdAt.getTime() - b.createdAt.getTime();
    })
    .slice(0, 5)
    .map((t) => ({
      title: t.title,
      due: t.dueAt ? formatDateTime(t.dueAt) : null,
      overdue: isOverdue(t, now),
      url: `${base}/tarefas/${t.id}`,
    }));

  return NextResponse.json({ found: true, appUrl: base, total: open.length, counts, next });
}
