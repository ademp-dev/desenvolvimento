// Testes de integração com PostgreSQL real.
// Rodam somente com RUN_DB_TESTS=1 e um DATABASE_URL de um banco DESCARTÁVEL
// já migrado (npx prisma migrate deploy). Os dados são apagados no início.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addNote, changeStatus, createTask, getTaskForUser, updateTask, ServiceError } from "@/lib/task-service";
import { findTasks } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";
import { reportRows, toXlsx } from "@/lib/export";
import { statsByUser } from "@/lib/stats";
import { applyEmailAction, assignEmailTask, emailTaskSummary } from "@/lib/email-task";

const run = process.env.RUN_DB_TESTS === "1";

describe.runIf(run)("integração com o banco", () => {
  let ana: Awaited<ReturnType<typeof prisma.user.create>>;
  let bia: typeof ana;
  let carla: typeof ana;
  let chefe: typeof ana;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "TaskHistory","TaskNote","EmailSource","Task","GoogleToken","User" RESTART IDENTITY CASCADE');
    ana = await prisma.user.create({ data: { email: "ana@ex.org", name: "Ana" } });
    bia = await prisma.user.create({ data: { email: "bia@ex.org", name: "Bia" } });
    carla = await prisma.user.create({ data: { email: "carla@ex.org", name: "Carla" } });
    chefe = await prisma.user.create({ data: { email: "chefe@ex.org", name: "Chefe", role: "ADMIN" } });
  });

  const nova = (requesterEmail = "fulano@x.gov.br") => ({ requesterEmail, createdAt: new Date(), status: "CRIADO" as const, completedAt: null });

  it("cria tarefa manual e a partir de e-mail, com histórico", async () => {
    const t1 = await createTask(bia, { ...nova("bia@ex.org"), title: "Revisar contrato", description: "Cláusula 4", responsibleId: ana.id, dueAt: new Date(Date.now() - 3_600_000) });
    const t2 = await createTask(
      ana,
      { ...nova(), title: "Responder ofício", description: "", responsibleId: ana.id, dueAt: null },
      {
        gmailMessageId: "18c0ffee1234abcd",
        threadId: "18c0ffee1234abcd",
        subject: "Ofício 123",
        sender: "Fulano <fulano@x.gov.br>",
        recipients: ["ana@ex.org"],
        emailDate: new Date(),
        link: "https://mail.google.com/mail/?authuser=ana%40ex.org#all/18c0ffee1234abcd",
        mailbox: "ana@ex.org",
        direction: "RECEBIDO",
      },
    );
    expect(t1.origin).toBe("MANUAL");
    expect(t2.origin).toBe("EMAIL");
    const full = await getTaskForUser(ana, t2.id);
    expect(full?.email?.subject).toBe("Ofício 123");
    expect(full?.history.map((h) => h.action)).toEqual(["CRIACAO"]);
    // Solicitante externo: só e-mail; solicitante cadastrado: e-mail + nome.
    expect(full?.requester).toEqual({ email: "fulano@x.gov.br", name: null });
    expect((await getTaskForUser(bia, t1.id))?.requester).toEqual({ email: "bia@ex.org", name: "Bia" });
  });

  it("aplica visibilidade: terceiros não veem; admin vê tudo", async () => {
    expect(await getTaskForUser(carla, 1)).toBeNull();
    expect(await getTaskForUser(chefe, 1)).not.toBeNull();
    expect((await findTasks(carla, parseFilters({}))).length).toBe(0);
    expect((await findTasks(bia, parseFilters({}))).map((t) => t.id)).toEqual([1]);
    expect((await findTasks(chefe, parseFilters({}))).length).toBe(2);
    await expect(changeStatus(carla, 1, "EM_ANDAMENTO")).rejects.toBeInstanceOf(ServiceError);
  });

  it("filtra vencidas, origem e texto", async () => {
    expect((await findTasks(chefe, parseFilters({ vencidas: "1" }))).map((t) => t.id)).toEqual([1]);
    expect((await findTasks(chefe, parseFilters({ origem: "EMAIL" }))).map((t) => t.id)).toEqual([2]);
    expect((await findTasks(chefe, parseFilters({ q: "ofício" }))).map((t) => t.id)).toEqual([2]);
    expect((await findTasks(chefe, parseFilters({ q: "#1" }))).map((t) => t.id)).toEqual([1]);
  });

  it("muda status com datas e auditoria; encerradas só reabrem com admin", async () => {
    await changeStatus(ana, 1, "EM_ANDAMENTO");
    await changeStatus(ana, 1, "CONCLUIDO", "Feito");
    const t = await getTaskForUser(ana, 1);
    expect(t?.status).toBe("CONCLUIDO");
    expect(t?.startedAt).toBeInstanceOf(Date);
    expect(t?.completedAt).toBeInstanceOf(Date);
    expect(t?.notes[0].text).toBe("Feito");
    expect(t?.history.filter((h) => h.action === "STATUS").map((h) => h.newValue)).toEqual(["Concluída", "Em andamento"]);

    await expect(changeStatus(ana, 1, "EM_ANDAMENTO")).rejects.toThrow(/Não é permitido/);
    await expect(
      updateTask(ana, 1, { title: "x x x", description: "", responsibleId: ana.id, requesterEmail: "a@b.org", createdAt: new Date(), dueAt: null }),
    ).rejects.toThrow(/encerradas/);
    await changeStatus(chefe, 1, "EM_ANDAMENTO");
    const reopened = await getTaskForUser(chefe, 1);
    expect(reopened?.completedAt).toBeNull();
  });

  it("edição registra cada campo alterado, inclusive reatribuição", async () => {
    const before = await getTaskForUser(ana, 2);
    await updateTask(ana, 2, {
      title: "Responder ofício 123",
      description: "Urgente",
      responsibleId: bia.id,
      requesterEmail: "ana@ex.org",
      createdAt: before!.createdAt,
      dueAt: null,
    });
    const t = await getTaskForUser(bia, 2);
    expect(t?.responsibleId).toBe(bia.id);
    expect(t?.requester).toEqual({ email: "ana@ex.org", name: "Ana" });
    const fields = t?.history.filter((h) => h.action !== "CRIACAO").map((h) => h.field).sort();
    expect(fields).toEqual(["Descrição", "Responsável", "Solicitante", "Título"]);
    await addNote(bia, 2, "Aguardando retorno");
    expect((await getTaskForUser(ana, 2))?.notes.length).toBe(1); // criadora ainda vê
  });

  it("não atribui a usuário inativo", async () => {
    await prisma.user.update({ where: { id: carla.id }, data: { active: false } });
    await expect(createTask(ana, { ...nova(), title: "Teste", description: "", responsibleId: carla.id, dueAt: null })).rejects.toThrow(/inativo/);
  });

  it("aceita data de criação retroativa e status inicial; rejeita data futura", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3_600_000);
    const t = await createTask(ana, { ...nova(), createdAt: twoDaysAgo, status: "ABERTA", title: "Retroativa", description: "", responsibleId: ana.id, dueAt: null });
    expect(t.status).toBe("ABERTA");
    expect(t.createdAt.getTime()).toBe(twoDaysAgo.getTime());
    const h = await prisma.taskHistory.findFirst({ where: { taskId: t.id } });
    expect(h?.newValue).toMatch(/data de criação informada/);

    const done = await createTask(ana, {
      ...nova(),
      createdAt: twoDaysAgo,
      status: "CONCLUIDO",
      completedAt: new Date(twoDaysAgo.getTime() + 3_600_000),
      title: "Já concluída",
      description: "",
      responsibleId: ana.id,
      dueAt: null,
    });
    expect(done.completedAt?.getTime()).toBe(twoDaysAgo.getTime() + 3_600_000);

    const future = new Date(Date.now() + 24 * 3_600_000);
    await expect(createTask(ana, { ...nova(), createdAt: future, title: "Futura", description: "", responsibleId: ana.id, dueAt: null })).rejects.toThrow(/futuro/);
    await expect(
      createTask(ana, { ...nova(), status: "CONCLUIDO", completedAt: new Date(twoDaysAgo.getTime() - 1), createdAt: twoDaysAgo, title: "Errada", description: "", responsibleId: ana.id, dueAt: null }),
    ).rejects.toThrow(/anterior/);
  });

  it("botões do Gmail: e-mail é Nova até o 1º clique; depois só avança", async () => {
    const arrived = new Date(Date.now() - 5 * 3_600_000);
    const email = {
      gmailMessageId: "19abcdef00112233",
      threadId: "19abcdef00112233",
      subject: "Pedido de parecer",
      sender: "Associado <associado@gmail.com>",
      recipients: ["ana@ex.org"],
      emailDate: arrived,
      link: "https://mail.google.com/mail/?authuser=ana%40ex.org#all/19abcdef00112233",
      mailbox: "ana@ex.org",
      direction: "RECEBIDO" as const,
    };
    expect(await emailTaskSummary(ana, email.gmailMessageId, "http://x")).toBeNull(); // "Nova"

    const id = await applyEmailAction(ana, { to: "ABERTA", email });
    let s = await emailTaskSummary(ana, email.gmailMessageId, "http://x");
    expect(s?.status).toBe("ABERTA");
    expect(s?.allowed).toEqual(["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]);
    const t = await getTaskForUser(ana, id);
    expect(t?.createdAt.getTime()).toBe(arrived.getTime()); // conta desde a chegada do e-mail
    expect(t?.requester?.email).toBe("associado@gmail.com");
    expect(t?.title).toBe("Pedido de parecer");

    expect(await applyEmailAction(ana, { to: "EM_ANDAMENTO", email })).toBe(id); // mesma tarefa
    await expect(applyEmailAction(ana, { to: "CANCELADO", email })).rejects.toThrow(/motivo/);
    await applyEmailAction(ana, { to: "CONCLUIDO", email });
    s = await emailTaskSummary(ana, email.gmailMessageId, "http://x");
    expect(s?.status).toBe("CONCLUIDO");
    expect(s?.allowed).toEqual([]);
    const statuses = (await getTaskForUser(ana, id))?.history.filter((h) => h.action === "STATUS").map((h) => h.newValue);
    expect(statuses).toEqual(["Concluída", "Em andamento", "Aberta"]);

    // Outro e-mail: Play direto cria e já inicia; Cancelar com motivo.
    const e2 = { ...email, gmailMessageId: "19abcdef00445566" };
    const id2 = await applyEmailAction(ana, { to: "EM_ANDAMENTO", email: e2 });
    expect((await getTaskForUser(ana, id2))?.startedAt).toBeInstanceOf(Date);
    await applyEmailAction(ana, { to: "CANCELADO", note: "Duplicado", email: e2 });
    expect((await getTaskForUser(ana, id2))?.notes[0].text).toBe("Duplicado");
  });

  it("atribuir e encaminhar-e-atribuir passam a tarefa adiante", async () => {
    const base = {
      threadId: "19fedcba00998877",
      subject: "Ofício urgente",
      sender: "Órgão <orgao@gov.br>",
      recipients: ["ana@ex.org"],
      emailDate: new Date(Date.now() - 3_600_000),
      mailbox: "ana@ex.org",
      direction: "RECEBIDO" as const,
    };
    const e1 = { ...base, gmailMessageId: "19fedcba00998877", link: "https://mail.google.com/mail/?authuser=ana%40ex.org#all/19fedcba00998877" };

    // E-mail "Nova" atribuído pela extensão: cria a tarefa já Aberta para o colega.
    const id = await assignEmailTask(ana, { responsibleId: bia.id, email: e1, reopen: false });
    let t = await getTaskForUser(ana, id);
    expect(t?.status).toBe("ABERTA");
    expect(t?.responsibleId).toBe(bia.id);
    expect(t?.createdById).toBe(ana.id); // quem atribuiu continua vendo

    // Bia inicia; Ana reatribui pela extensão (sem reabrir): status continua Em andamento.
    await changeStatus(bia, id, "EM_ANDAMENTO");
    await assignEmailTask(ana, { responsibleId: chefe.id, messageId: e1.gmailMessageId, reopen: false });
    t = await getTaskForUser(ana, id);
    expect([t?.status, t?.responsibleId]).toEqual(["EM_ANDAMENTO", chefe.id]);

    // "Encaminhar e atribuir" achando a tarefa só pela conversa (thread): volta a Aberta para o novo responsável.
    await assignEmailTask(ana, { responsibleId: bia.id, threadId: base.threadId, reopen: true, note: "Por favor, verifique" });
    t = await getTaskForUser(ana, id);
    expect([t?.status, t?.responsibleId]).toEqual(["ABERTA", bia.id]);
    expect(t?.notes[0].text).toBe("Por favor, verifique");
    expect(t?.history.filter((h) => h.action === "ATRIBUICAO").length).toBe(2);

    // Sem tarefa e sem metadados do e-mail: mensagem clara.
    await expect(assignEmailTask(ana, { responsibleId: bia.id, threadId: "19aaaaaaaaaaaaaa", reopen: true })).rejects.toThrow(/Abrir tarefa/);

    // Tarefa encerrada não é atribuída.
    await changeStatus(bia, id, "CONCLUIDO");
    await expect(assignEmailTask(ana, { responsibleId: chefe.id, messageId: e1.gmailMessageId, reopen: true })).rejects.toThrow(/encerrada/);
  });

  it("usuário avança Nova → Aberta → Em andamento; não volta", async () => {
    const t = await createTask(ana, { ...nova(), title: "Fluxo", description: "", responsibleId: ana.id, dueAt: null });
    await changeStatus(ana, t.id, "ABERTA");
    await changeStatus(ana, t.id, "EM_ANDAMENTO");
    await expect(changeStatus(ana, t.id, "ABERTA")).rejects.toThrow(/Não é permitido/);
    await changeStatus(chefe, t.id, "ABERTA"); // admin pode voltar
    await changeStatus(ana, t.id, "CANCELADO");
    expect((await getTaskForUser(ana, t.id))?.canceledAt).toBeInstanceOf(Date);
  });

  it("gera relatório e planilha", async () => {
    const tasks = await findTasks(chefe, parseFilters({ ordem: "tempo" }));
    const rows = reportRows(tasks);
    expect(rows[0]).toHaveProperty("E-mail do responsável");
    const xlsx = await toXlsx(rows, statsByUser(tasks));
    expect(xlsx.subarray(0, 2).toString()).toBe("PK"); // arquivo ZIP/XLSX válido
  });
});
