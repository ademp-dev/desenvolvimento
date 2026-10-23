import { describe, expect, it } from "vitest";
import { elapsedMs, formatDuration, isOverdue, overdueMs, parseLocalDateTime, toLocalInputValue } from "@/lib/time";

const H = 3_600_000;
const D = 24 * H;
const created = new Date("2026-10-01T12:00:00Z");
const now = new Date(created.getTime() + 2 * D + 5 * H);

describe("formatDuration", () => {
  it("formata dias e horas", () => {
    expect(formatDuration(2 * D + 5 * H)).toBe("2 dias e 5 horas");
    expect(formatDuration(1 * D + 1 * H)).toBe("1 dia e 1 hora");
    expect(formatDuration(3 * D)).toBe("3 dias");
    expect(formatDuration(7 * H + 59 * 60_000)).toBe("7 horas");
    expect(formatDuration(30 * 60_000)).toBe("menos de 1 hora");
    expect(formatDuration(-5)).toBe("menos de 1 hora");
  });
});

describe("elapsedMs", () => {
  it("abertas contam até agora", () => {
    expect(elapsedMs({ status: "CRIADO", createdAt: created }, now)).toBe(2 * D + 5 * H);
    expect(elapsedMs({ status: "EM_ANDAMENTO", createdAt: created }, now)).toBe(2 * D + 5 * H);
  });
  it("concluídas contam até a conclusão", () => {
    const completedAt = new Date(created.getTime() + 1 * D);
    expect(elapsedMs({ status: "CONCLUIDO", createdAt: created, completedAt }, now)).toBe(1 * D);
  });
  it("canceladas contam até o cancelamento", () => {
    const canceledAt = new Date(created.getTime() + 3 * H);
    expect(elapsedMs({ status: "CANCELADO", createdAt: created, canceledAt }, now)).toBe(3 * H);
  });
  it("aceita strings ISO (componentes do navegador)", () => {
    expect(elapsedMs({ status: "CRIADO", createdAt: created.toISOString() }, now)).toBe(2 * D + 5 * H);
  });
});

describe("atraso", () => {
  const dueAt = new Date(created.getTime() + 1 * D);
  it("aberta após o prazo está vencida", () => {
    const t = { status: "EM_ANDAMENTO" as const, createdAt: created, dueAt };
    expect(isOverdue(t, now)).toBe(true);
    expect(formatDuration(overdueMs(t, now))).toBe("1 dia e 5 horas");
  });
  it("aberta dentro do prazo não está vencida", () => {
    expect(isOverdue({ status: "CRIADO", createdAt: created, dueAt: new Date(now.getTime() + H) }, now)).toBe(false);
  });
  it("concluída com atraso registra o atraso mas não conta como vencida", () => {
    const t = { status: "CONCLUIDO" as const, createdAt: created, dueAt, completedAt: new Date(dueAt.getTime() + 2 * H) };
    expect(overdueMs(t, now)).toBe(2 * H);
    expect(isOverdue(t, now)).toBe(false);
  });
  it("cancelada nunca está atrasada", () => {
    expect(overdueMs({ status: "CANCELADO", createdAt: created, dueAt, canceledAt: now }, now)).toBe(0);
  });
  it("sem prazo não há atraso", () => {
    expect(overdueMs({ status: "CRIADO", createdAt: created }, now)).toBe(0);
  });
});

describe("fuso horário (America/Sao_Paulo, UTC-3)", () => {
  it("converte data/hora local para UTC", () => {
    expect(parseLocalDateTime("2026-10-21T09:30")?.toISOString()).toBe("2026-10-21T12:30:00.000Z");
  });
  it("data sem hora vira fim do dia ou início do dia", () => {
    expect(parseLocalDateTime("2026-10-21")?.toISOString()).toBe("2026-10-22T02:59:59.000Z");
    expect(parseLocalDateTime("2026-10-21", false)?.toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });
  it("rejeita formatos inválidos", () => {
    expect(parseLocalDateTime("21/10/2026")).toBeNull();
    expect(parseLocalDateTime("")).toBeNull();
  });
  it("ida e volta para o input datetime-local", () => {
    expect(toLocalInputValue(new Date("2026-10-21T12:30:00Z"))).toBe("2026-10-21T09:30");
  });
});
