import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { Stats, UserStats } from "./stats";
import { STATUS_LABEL } from "./status";
import type { TaskRow } from "./task-service";
import { elapsedMs, formatDateTime, formatDuration, formatWorked, isOverdue, workedMs, type TaskStatusValue } from "./time";

// Relatório geral em PDF (A4 paisagem): cabeçalho com a logo da ADEMP,
// indicadores, tabela por usuário e lista de tarefas, com rodapé paginado.

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const C = {
  brand: hex("#025148"),
  brandSoft: hex("#e6f1ef"),
  accent: hex("#f2b705"),
  ink: hex("#1f1f1f"),
  ink2: hex("#444746"),
  muted: hex("#5f6368"),
  line: hex("#dfe3e8"),
  zebra: hex("#f7f9fb"),
  lateRow: hex("#fdecea"),
  red: hex("#c5221f"),
  white: rgb(1, 1, 1),
};

const STATUS_COLORS: Record<TaskStatusValue, [RGB, RGB]> = {
  CRIADO: [hex("#c2e7ff"), hex("#001d35")],
  ABERTA: [hex("#ffe2a8"), hex("#5c3c00")],
  EM_ANDAMENTO: [hex("#d3e3fd"), hex("#0842a0")],
  PAUSADA: [hex("#fde7c8"), hex("#8a4b00")],
  CONCLUIDO: [hex("#c4eed0"), hex("#0d652d")],
  CANCELADO: [hex("#e3e3e3"), hex("#5f6368")],
};

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const M = 36; // margem
const CONTENT_W = PAGE_W - 2 * M;
const FOOTER_H = 28;

// As fontes padrão do PDF usam a codificação WinAnsi (Latin-1 + alguns
// símbolos). Caracteres fora dela (emojis, setas...) são trocados.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
function pdfText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/→/g, "->")
    .replace(/[^ -~ -ÿ]/g, (ch) => (WIN_ANSI_EXTRA.has(ch) ? ch : ""));
}

/** Quebra o texto em linhas que cabem na largura; corta com "…" além de `maxLines`. */
function wrap(text: string, font: PDFFont, size: number, width: number, maxLines: number): string[] {
  const words = pdfText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
    // Palavra maior que a coluna: corta em pedaços.
    while (!fits(cur) && cur.length > 1) {
      let cut = cur.length - 1;
      while (cut > 1 && !fits(cur.slice(0, cut))) cut--;
      lines.push(cur.slice(0, cut));
      cur = cur.slice(cut);
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines.length ? lines : [""];
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

interface Column<T> {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
  cell: (row: T) => string;
  /** Desenho próprio da célula (ex.: etiqueta de status). */
  draw?: (page: PDFPage, row: T, x: number, yTop: number, width: number) => void;
  bold?: (row: T) => boolean;
  color?: (row: T) => RGB | undefined;
  maxLines?: number;
}

export interface ReportPdfInput {
  tasks: TaskRow[];
  stats: Stats;
  perUser: UserStats[];
  /** Descrição dos filtros aplicados (uma linha). */
  filters: string;
  generatedBy: string;
  now?: Date;
}

export async function reportPdf({ tasks, stats, perUser, filters, generatedBy, now = new Date() }: ReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Relatório geral de tarefas — ADEMP");
  doc.setAuthor(pdfText(generatedBy));
  doc.setCreator("Tarefas ADEMP");
  doc.setCreationDate(now);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  try {
    logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public", "ademp-logo.png")));
  } catch {
    // Sem a logo o relatório sai igual, só sem a imagem.
  }

  const generatedAt = formatDateTime(now);
  let page!: PDFPage;
  let y = 0;

  const text = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = C.ink) =>
    page.drawText(pdfText(s), { x, y: yy, size, font: f, color });
  const textRight = (s: string, xRight: number, yy: number, size: number, f: PDFFont = font, color: RGB = C.ink) =>
    text(s, xRight - f.widthOfTextAtSize(pdfText(s), size), yy, size, f, color);

  /** Retângulo com cantos arredondados (coordenadas do PDF: y para cima). */
  const roundRect = (x: number, yBottom: number, w: number, h: number, r: number, color: RGB) => {
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(path, { x, y: yBottom + h, color, borderWidth: 0 });
  };

  function newPage(first: boolean) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    const top = PAGE_H - M;
    if (first) {
      const size = 48;
      if (logo) page.drawImage(logo, { x: M, y: top - size, width: size, height: size });
      const tx = M + (logo ? size + 12 : 0);
      text("Relatório geral de tarefas", tx, top - 22, 20, bold, C.brand);
      text("ADEMP · Tarefas", tx, top - 40, 10, font, C.muted);
      textRight(`Gerado em ${generatedAt}`, PAGE_W - M, top - 20, 9, font, C.ink2);
      textRight(`por ${generatedBy}`, PAGE_W - M, top - 33, 9, font, C.muted);
      y = top - size - 10;
    } else {
      const size = 22;
      if (logo) page.drawImage(logo, { x: M, y: top - size, width: size, height: size });
      text("Relatório geral de tarefas", M + (logo ? size + 8 : 0), top - 15, 11, bold, C.brand);
      textRight(`Gerado em ${generatedAt}`, PAGE_W - M, top - 15, 8, font, C.muted);
      y = top - size - 8;
    }
    // Linha da marca: verde-petróleo com um traço amarelo, como a logo.
    page.drawRectangle({ x: M, y, width: CONTENT_W, height: 1.5, color: C.brand });
    page.drawRectangle({ x: M, y: y - 1, width: 64, height: 3.5, color: C.accent });
    y -= 16;
  }

  const ensure = (h: number) => {
    if (y - h < M + FOOTER_H) {
      newPage(false);
      return true;
    }
    return false;
  };

  function sectionTitle(title: string, note?: string) {
    ensure(40);
    text(title, M, y - 12, 13, bold, C.ink);
    if (note) text(note, M + bold.widthOfTextAtSize(pdfText(title), 13) + 10, y - 12, 9, font, C.muted);
    y -= 22;
  }

  function table<T>(columns: Column<T>[], rows: T[], opts: { size?: number; highlight?: (row: T) => RGB | undefined } = {}) {
    const size = opts.size ?? 8;
    const lineH = size + 2.5;
    const pad = 4;
    const headerH = 18;

    const drawHeader = () => {
      roundRect(M, y - headerH, CONTENT_W, headerH, 3, C.brand);
      let x = M;
      for (const c of columns) {
        const label = pdfText(c.header);
        const w = bold.widthOfTextAtSize(label, 7.5);
        const tx = c.align === "right" ? x + c.width - pad - w : c.align === "center" ? x + (c.width - w) / 2 : x + pad;
        page.drawText(label, { x: tx, y: y - 12, size: 7.5, font: bold, color: C.white });
        x += c.width;
      }
      y -= headerH;
    };

    ensure(headerH + 20);
    drawHeader();
    rows.forEach((row, i) => {
      const cells = columns.map((c) => wrap(c.cell(row), c.bold?.(row) ? bold : font, size, c.width - 2 * pad, c.maxLines ?? 2));
      const rowH = Math.max(...cells.map((l) => l.length)) * lineH + 2 * pad;
      if (ensure(rowH)) drawHeader();
      const bg = opts.highlight?.(row) ?? (i % 2 === 1 ? C.zebra : undefined);
      if (bg) page.drawRectangle({ x: M, y: y - rowH, width: CONTENT_W, height: rowH, color: bg });
      let x = M;
      columns.forEach((c, ci) => {
        if (c.draw) {
          c.draw(page, row, x, y, c.width);
        } else {
          const f = c.bold?.(row) ? bold : font;
          const color = c.color?.(row) ?? C.ink;
          cells[ci].forEach((ln, li) => {
            const w = f.widthOfTextAtSize(ln, size);
            const tx = c.align === "right" ? x + c.width - pad - w : c.align === "center" ? x + (c.width - w) / 2 : x + pad;
            page.drawText(ln, { x: tx, y: y - pad - size - li * lineH + 1.5, size, font: f, color });
          });
        }
        x += c.width;
      });
      y -= rowH;
      page.drawRectangle({ x: M, y, width: CONTENT_W, height: 0.5, color: C.line });
    });
    y -= 14;
  }

  // --- Página 1: filtros e indicadores ----------------------------------------
  newPage(true);
  for (const ln of wrap(`Filtros: ${filters}`, font, 9, CONTENT_W, 3)) {
    text(ln, M, y - 9, 9, font, C.ink2);
    y -= 12;
  }
  y -= 8;

  const cards: { label: string; value: string; color: RGB }[] = [
    { label: "Total de tarefas", value: String(stats.total), color: C.brand },
    { label: "Novas", value: String(stats.byStatus.CRIADO), color: hex("#0b57d0") },
    { label: "Abertas", value: String(stats.byStatus.ABERTA), color: hex("#b06000") },
    { label: "Em andamento", value: String(stats.byStatus.EM_ANDAMENTO), color: hex("#1a73e8") },
    { label: "Pausadas", value: String(stats.byStatus.PAUSADA), color: hex("#e37400") },
    { label: "Concluídas", value: String(stats.byStatus.CONCLUIDO), color: hex("#188038") },
    { label: "Canceladas", value: String(stats.byStatus.CANCELADO), color: C.muted },
    { label: "Vencidas", value: String(stats.overdue), color: C.red },
    { label: "Tempo trabalhado", value: formatWorked(stats.workedMs), color: C.brand },
    { label: "Tempo médio de conclusão", value: stats.avgCompletionMs === null ? "—" : formatDuration(stats.avgCompletionMs), color: hex("#9334e6") },
  ];
  const gap = 8;
  const cardW = (CONTENT_W - 4 * gap) / 5;
  const cardH = 46;
  cards.forEach((card, i) => {
    const col = i % 5;
    const rowTop = y - Math.floor(i / 5) * (cardH + gap);
    const x = M + col * (cardW + gap);
    roundRect(x, rowTop - cardH, cardW, cardH, 6, C.brandSoft);
    page.drawRectangle({ x, y: rowTop - cardH + 6, width: 3, height: cardH - 12, color: card.color });
    text(card.label, x + 12, rowTop - 15, 8, font, C.muted);
    const valueLines = wrap(card.value, bold, 15, cardW - 18, 1);
    text(valueLines[0], x + 12, rowTop - 36, 15, bold, C.ink);
  });
  y -= 2 * cardH + gap + 22;

  // --- Indicadores por usuário --------------------------------------------------
  sectionTitle("Indicadores por usuário", "contagens pelo responsável atual; tempo trabalhado por quem trabalhou");
  const n = (v: number) => String(v);
  table<UserStats>(
    [
      { header: "Responsável", width: 170, cell: (u) => u.name, bold: () => true, maxLines: 1 },
      { header: "Total", width: 46, align: "right", cell: (u) => n(u.total), bold: () => true },
      { header: "Novas", width: 46, align: "right", cell: (u) => n(u.byStatus.CRIADO) },
      { header: "Abertas", width: 46, align: "right", cell: (u) => n(u.byStatus.ABERTA) },
      { header: "Em and.", width: 46, align: "right", cell: (u) => n(u.byStatus.EM_ANDAMENTO) },
      { header: "Pausadas", width: 46, align: "right", cell: (u) => n(u.byStatus.PAUSADA) },
      { header: "Concl.", width: 46, align: "right", cell: (u) => n(u.byStatus.CONCLUIDO) },
      { header: "Canc.", width: 46, align: "right", cell: (u) => n(u.byStatus.CANCELADO) },
      { header: "Vencidas", width: 46, align: "right", cell: (u) => n(u.overdue), color: (u) => (u.overdue ? C.red : undefined), bold: (u) => u.overdue > 0 },
      { header: "C/ atraso", width: 46, align: "right", cell: (u) => n(u.completedLate) },
      { header: "Tempo médio de conclusão", width: 106, cell: (u) => (u.avgCompletionMs === null ? "—" : formatDuration(u.avgCompletionMs)) },
      { header: "Trabalhado", width: 80, align: "right", cell: (u) => formatWorked(u.workedMs), bold: () => true },
    ],
    perUser,
    { size: 8.5 },
  );
  if (perUser.length === 0) {
    text("Sem dados.", M, y, 9, font, C.muted);
    y -= 20;
  }

  // --- Tarefas -----------------------------------------------------------------
  sectionTitle("Tarefas", `${tasks.length} tarefa(s) · linhas em vermelho estão com o prazo vencido`);
  if (tasks.length === 0) {
    text("Nenhuma tarefa encontrada com esses filtros.", M, y, 9, font, C.muted);
  } else {
    table<TaskRow>(
      [
        { header: "Nº", width: 34, cell: (t) => `#${t.id}`, color: () => C.muted },
        { header: "Tarefa", width: 204, cell: (t) => t.title, bold: () => true },
        { header: "Responsável", width: 100, cell: (t) => t.responsible.name },
        {
          header: "Status",
          width: 70,
          cell: (t) => STATUS_LABEL[t.status as TaskStatusValue],
          // Etiqueta colorida, como no app.
          draw: (pg, t, x, yTop) => {
            const st = t.status as TaskStatusValue;
            const label = pdfText(STATUS_LABEL[st]);
            const [bg, fg] = STATUS_COLORS[st];
            roundRect(x + 4, yTop - 16, bold.widthOfTextAtSize(label, 7) + 10, 12, 3, bg);
            pg.drawText(label, { x: x + 9, y: yTop - 12.5, size: 7, font: bold, color: fg });
          },
        },
        { header: "Criada em", width: 78, cell: (t) => formatDateTime(t.createdAt) },
        { header: "Prazo", width: 78, cell: (t) => (t.dueAt ? formatDateTime(t.dueAt) : "—"), color: (t) => (isOverdue(t, now) ? C.red : undefined), bold: (t) => isOverdue(t, now) },
        { header: "Decorrido", width: 70, cell: (t) => formatDuration(elapsedMs(t, now)) },
        { header: "Trabalhado", width: 58, align: "right", cell: (t) => formatWorked(workedMs(t.workSessions, now)) },
        { header: "Encerrada em", width: 78, cell: (t) => (t.completedAt || t.canceledAt ? formatDateTime(t.completedAt ?? t.canceledAt) : "—") },
      ],
      tasks,
      { highlight: (t) => (isOverdue(t, now) ? C.lateRow : undefined) },
    );
  }

  // --- Rodapé em todas as páginas ---------------------------------------------------
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawRectangle({ x: M, y: M + 12, width: CONTENT_W, height: 0.5, color: C.line });
    pg.drawText(pdfText("Tarefas ADEMP · Relatório geral · uso interno"), { x: M, y: M, size: 7.5, font, color: C.muted });
    const label = `Página ${i + 1} de ${pages.length}`;
    pg.drawText(label, { x: PAGE_W - M - font.widthOfTextAtSize(label, 7.5), y: M, size: 7.5, font, color: C.muted });
  });

  return doc.save();
}
