import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { parseFilters } from "@/lib/filters";
import { reportRows, toCsv, toXlsx } from "@/lib/export";
import { canViewGeneralReport } from "@/lib/permissions";
import { findTasks } from "@/lib/queries";
import { statsByUser } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!canViewGeneralReport(user)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    params[key] = all.length > 1 ? all : all[0];
  }
  const now = new Date();
  const tasks = await findTasks(user, parseFilters(params), now);
  const rows = reportRows(tasks, now);
  const stamp = now.toISOString().slice(0, 10);

  if (sp.get("formato") === "csv") {
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="relatorio-tarefas-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const buf = await toXlsx(rows, statsByUser(tasks, now));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-tarefas-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
