import { describe, expect, it } from "vitest";
import { canEditTask, canViewGeneralReport, canViewTask, visibilityWhere, type Actor } from "@/lib/permissions";
import { allowedTransitions, canTransition, isBackward, statusTimestamps } from "@/lib/status";
import { extractEmail } from "@/lib/address";
import { filtersToQuery, parseFilters, sortTasks } from "@/lib/filters";
import { computeStats, statsByUser } from "@/lib/stats";
import { toCsv } from "@/lib/export";
import { splitAddresses } from "@/lib/gmail";

const ana: Actor = { id: "ana", role: "USER", active: true };
const bia: Actor = { id: "bia", role: "USER", active: true };
const chefe: Actor = { id: "chefe", role: "ADMIN", active: true };
const inativo: Actor = { id: "x", role: "ADMIN", active: false };
const tarefaDaAna = { responsibleId: "ana", createdById: "bia" };

describe("permissões", () => {
  it("responsável e criador veem e editam; terceiros não", () => {
    expect(canViewTask(ana, tarefaDaAna)).toBe(true);
    expect(canViewTask(bia, tarefaDaAna)).toBe(true);
    expect(canEditTask(bia, tarefaDaAna)).toBe(true);
    expect(canViewTask({ id: "carla", role: "USER", active: true }, tarefaDaAna)).toBe(false);
  });
  it("admin vê tudo; inativo não vê nada", () => {
    expect(canViewTask(chefe, tarefaDaAna)).toBe(true);
    expect(canViewTask(inativo, tarefaDaAna)).toBe(false);
  });
  it("relatório geral só para admin", () => {
    expect(canViewGeneralReport(chefe)).toBe(true);
    expect(canViewGeneralReport(ana)).toBe(false);
    expect(canViewGeneralReport(inativo)).toBe(false);
  });
  it("filtro de visibilidade restringe usuário comum", () => {
    expect(visibilityWhere(chefe)).toEqual({});
    expect(visibilityWhere(ana)).toEqual({ OR: [{ responsibleId: "ana" }, { createdById: "ana" }] });
  });
});

describe("transições de status", () => {
  it("usuário só avança no fluxo Nova → Aberta → Em andamento → Concluída, e cancela a qualquer momento", () => {
    expect(allowedTransitions("CRIADO", false)).toEqual(["ABERTA", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]);
    expect(allowedTransitions("ABERTA", false)).toEqual(["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]);
    expect(allowedTransitions("EM_ANDAMENTO", false)).toEqual(["CONCLUIDO", "CANCELADO"]);
    expect(canTransition("EM_ANDAMENTO", "ABERTA", false)).toBe(false);
    expect(canTransition("ABERTA", "CRIADO", false)).toBe(false);
  });
  it("encerradas são finais para o usuário; admin move para qualquer status", () => {
    expect(allowedTransitions("CONCLUIDO", false)).toEqual([]);
    expect(allowedTransitions("CANCELADO", false)).toEqual([]);
    expect(allowedTransitions("CONCLUIDO", true)).toEqual(["CRIADO", "ABERTA", "EM_ANDAMENTO", "CANCELADO"]);
    expect(canTransition("EM_ANDAMENTO", "ABERTA", true)).toBe(true);
  });
  it("identifica volta no fluxo", () => {
    expect(isBackward("EM_ANDAMENTO", "ABERTA")).toBe(true);
    expect(isBackward("CONCLUIDO", "EM_ANDAMENTO")).toBe(true);
    expect(isBackward("CANCELADO", "CRIADO")).toBe(true);
    expect(isBackward("CRIADO", "EM_ANDAMENTO")).toBe(false);
    expect(isBackward("EM_ANDAMENTO", "CANCELADO")).toBe(false);
  });
  it("datas acompanham o status", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    expect(statusTimestamps("ABERTA", now, null)).toEqual({ completedAt: null, canceledAt: null });
    expect(statusTimestamps("EM_ANDAMENTO", now, null)).toEqual({ startedAt: now, completedAt: null, canceledAt: null });
    expect(statusTimestamps("CONCLUIDO", now, now)).toEqual({ completedAt: now, canceledAt: null });
    expect(statusTimestamps("CONCLUIDO", now, null)).toEqual({ startedAt: now, completedAt: now, canceledAt: null });
    expect(statusTimestamps("CANCELADO", now, null)).toEqual({ canceledAt: now, completedAt: null });
  });
});

describe("filtros e ordenação", () => {
  it("lê e reescreve a query string", () => {
    const f = parseFilters({ status: ["CRIADO", "INVALIDO"], origem: "EMAIL", vencidas: "1", ordem: "tempo", dir: "asc" });
    expect(f.status).toEqual(["CRIADO"]);
    expect(f.origin).toBe("EMAIL");
    expect(f.overdue).toBe(true);
    expect(filtersToQuery(f)).toBe("status=CRIADO&origem=EMAIL&vencidas=1&ordem=tempo&dir=asc");
  });
  it("ordena por tempo decorrido", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const tasks = [
      { id: 1, status: "CRIADO" as const, createdAt: new Date("2026-10-20T12:00:00Z") },
      { id: 2, status: "CRIADO" as const, createdAt: new Date("2026-10-10T12:00:00Z") },
      { id: 3, status: "CONCLUIDO" as const, createdAt: new Date("2026-10-01T12:00:00Z"), completedAt: new Date("2026-10-01T13:00:00Z") },
    ];
    expect(sortTasks(tasks, "tempo", "desc", now).map((t) => t.id)).toEqual([2, 1, 3]);
  });
});

describe("indicadores", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const r = (id: string) => ({ id, name: id.toUpperCase(), email: `${id}@x.org` });
  const tasks = [
    { status: "CRIADO" as const, createdAt: new Date("2026-10-20T12:00:00Z"), dueAt: new Date("2026-10-21T00:00:00Z"), responsible: r("ana") },
    { status: "CONCLUIDO" as const, createdAt: new Date("2026-10-19T12:00:00Z"), completedAt: new Date("2026-10-20T12:00:00Z"), responsible: r("ana") },
    { status: "CONCLUIDO" as const, createdAt: new Date("2026-10-19T12:00:00Z"), completedAt: new Date("2026-10-22T12:00:00Z"), responsible: r("bia") },
    { status: "CANCELADO" as const, createdAt: new Date("2026-10-19T12:00:00Z"), canceledAt: now, responsible: r("bia") },
  ];
  it("totaliza por status, vencidas e tempo médio", () => {
    const s = computeStats(tasks, now);
    expect(s.total).toBe(4);
    expect(s.byStatus).toEqual({ CRIADO: 1, ABERTA: 0, EM_ANDAMENTO: 0, CONCLUIDO: 2, CANCELADO: 1 });
    expect(s.overdue).toBe(1);
    expect(s.avgCompletionMs).toBe(2 * 24 * 3_600_000); // (1 dia + 3 dias) / 2
  });
  it("agrupa por usuário", () => {
    const u = statsByUser(tasks, now);
    expect(u.map((x) => [x.name, x.total])).toEqual([
      ["ANA", 2],
      ["BIA", 2],
    ]);
  });
});

describe("utilitários", () => {
  it("CSV com BOM, separador ; e proteção contra fórmulas", () => {
    const csv = toCsv([{ a: "=SOMA(1)", b: 'x;"y"' }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`'=SOMA(1);"x;""y"""`);
  });
  it("extrai o e-mail do solicitante", () => {
    expect(extractEmail('"Silva, Ana" <Ana@X.org>')).toBe("ana@x.org");
    expect(extractEmail("bia@x.org")).toBe("bia@x.org");
    expect(extractEmail("Fulano")).toBeNull();
  });
  it("separa destinatários respeitando aspas", () => {
    expect(splitAddresses('"Silva, Ana" <ana@x.org>, bia@x.org')).toEqual(['"Silva, Ana" <ana@x.org>', "bia@x.org"]);
  });
});
