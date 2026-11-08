import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { describeFilters, parseFilters } from "@/lib/filters";
import { reportPdf } from "@/lib/report-pdf";
import { computeStats, statsByUser } from "@/lib/stats";
import type { TaskRow } from "@/lib/task-service";
import type { TaskStatusValue } from "@/lib/time";

const now = new Date("2026-11-02T15:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
const ana = { id: "ana", name: "Ana Conceição", email: "ana@ademp.org.br" };
const bia = { id: "bia", name: "Bia Simões", email: "bia@ademp.org.br" };
const statuses: TaskStatusValue[] = ["CRIADO", "ABERTA", "EM_ANDAMENTO", "PAUSADA", "CONCLUIDO", "CANCELADO"];

function fakeTask(i: number): TaskRow {
  const status = statuses[i % statuses.length];
  const responsible = i % 2 ? ana : bia;
  return {
    id: i + 1,
    title: i === 0 ? "Título muito longo ".repeat(12) + "🚀 com emoji → seta" : `Pendências contábeis nº ${i} — ação revisional`,
    description: "",
    origin: "EMAIL",
    status,
    responsibleId: responsible.id,
    responsible,
    createdById: ana.id,
    createdBy: ana,
    requesterEmail: "fulano@x.org",
    requester: { email: "fulano@x.org", name: null },
    dueAt: i % 3 === 0 ? h(2) : null,
    createdAt: h(50 + i),
    updatedAt: now,
    startedAt: h(40),
    completedAt: status === "CONCLUIDO" ? h(10) : null,
    canceledAt: status === "CANCELADO" ? h(10) : null,
    email: null,
    workSessions: [
      { id: 1, userId: bia.id, startedAt: h(40), endedAt: h(38), user: bia },
      { id: 2, userId: responsible.id, startedAt: h(20), endedAt: status === "EM_ANDAMENTO" ? null : h(19), user: responsible },
    ],
  } as unknown as TaskRow;
}

describe("relatório em PDF", () => {
  it("gera um PDF válido com várias páginas, acentos e caracteres especiais", async () => {
    const tasks = Array.from({ length: 80 }, (_, i) => fakeTask(i));
    const filters = parseFilters({ status: "CONCLUIDO,PAUSADA", criadoDe: "2026-10-01" });
    const bytes = await reportPdf({
      tasks,
      stats: computeStats(tasks, now),
      perUser: statsByUser(tasks, now),
      filters: describeFilters(filters),
      generatedBy: "Renato (administrativo@ademp.org.br)",
      now,
    });
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("descreve os filtros em português", () => {
    expect(describeFilters(parseFilters({}))).toBe("nenhum (todas as tarefas)");
    expect(describeFilters(parseFilters({ status: "PAUSADA", vencidas: "1", criadoDe: "2026-10-01", criadoAte: "2026-10-31" }), null)).toBe(
      "status: Pausada · criadas de 01/10/2026 até 31/10/2026 · somente vencidas",
    );
  });

  it("tempo trabalhado por pessoa vai para quem trabalhou", () => {
    const tasks = [fakeTask(4)]; // concluída, responsável Bia (índice par)
    const u = statsByUser(tasks, now);
    // Bia: 2h (1º período) + 1h (2º período)
    expect(u.find((x) => x.userId === "bia")?.workedMs).toBe(3 * 3_600_000);
  });
});
