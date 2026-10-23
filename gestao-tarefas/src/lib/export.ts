import ExcelJS from "exceljs";
import { STATUS_LABEL, ORIGIN_LABEL } from "./status";
import type { TaskRow } from "./task-service";
import type { UserStats } from "./stats";
import { elapsedMs, formatDateTime, formatDuration, msToHours, overdueMs, type TaskStatusValue } from "./time";

// Exportação do relatório geral para CSV (padrão Excel pt-BR: ";" e BOM) e XLSX.

export function reportRows(tasks: TaskRow[], now = new Date()) {
  return tasks.map((t) => {
    const status = t.status as TaskStatusValue;
    const elapsed = elapsedMs(t, now);
    const late = overdueMs(t, now);
    return {
      "Nº": t.id,
      Título: t.title,
      Descrição: t.description,
      Responsável: t.responsible.name,
      "E-mail do responsável": t.responsible.email,
      "Solicitante (e-mail)": t.requester?.email ?? "",
      "Solicitante (usuário)": t.requester?.name ?? "",
      Origem: ORIGIN_LABEL[t.origin],
      "Assunto do e-mail": t.email?.subject ?? "",
      "Remetente do e-mail": t.email?.sender ?? "",
      "Link do e-mail": t.email?.link ?? "",
      "Criada em": formatDateTime(t.createdAt),
      Prazo: t.dueAt ? formatDateTime(t.dueAt) : "",
      Status: STATUS_LABEL[status],
      "Tempo decorrido": formatDuration(elapsed),
      "Tempo decorrido (horas)": msToHours(elapsed),
      "Concluída/cancelada em": t.completedAt || t.canceledAt ? formatDateTime(t.completedAt ?? t.canceledAt) : "",
      "Em atraso": late > 0 ? "Sim" : t.dueAt ? "Não" : "",
      Atraso: late > 0 ? formatDuration(late) : "",
      "Criada por": t.createdBy.email,
    };
  });
}

function csvCell(v: unknown): string {
  let s = String(v ?? "");
  // Evita injeção de fórmulas ao abrir no Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "﻿";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(";"), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(rows: Record<string, unknown>[], perUser: UserStats[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ws = wb.addWorksheet("Tarefas", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = rows.length ? Object.keys(rows[0]) : ["Sem dados"];
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(60, Math.max(12, h.length + 2)) }));
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const us = wb.addWorksheet("Por usuário", { views: [{ state: "frozen", ySplit: 1 }] });
  us.columns = [
    { header: "Responsável", key: "name", width: 30 },
    { header: "E-mail", key: "email", width: 32 },
    { header: "Total", key: "total", width: 8 },
    { header: "Novas", key: "c", width: 9 },
    { header: "Abertas", key: "o", width: 9 },
    { header: "Em andamento", key: "a", width: 14 },
    { header: "Concluídas", key: "k", width: 11 },
    { header: "Canceladas", key: "x", width: 11 },
    { header: "Vencidas", key: "v", width: 10 },
    { header: "Concluídas c/ atraso", key: "l", width: 18 },
    { header: "Tempo médio de conclusão", key: "avg", width: 24 },
  ];
  for (const u of perUser) {
    us.addRow({
      name: u.name,
      email: u.email,
      total: u.total,
      c: u.byStatus.CRIADO,
      o: u.byStatus.ABERTA,
      a: u.byStatus.EM_ANDAMENTO,
      k: u.byStatus.CONCLUIDO,
      x: u.byStatus.CANCELADO,
      v: u.overdue,
      l: u.completedLate,
      avg: u.avgCompletionMs === null ? "" : formatDuration(u.avgCompletionMs),
    });
  }
  us.getRow(1).font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
