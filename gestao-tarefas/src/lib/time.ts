// Regras de contagem de tempo. Funções puras (sem acesso a banco), usadas
// tanto no servidor quanto no navegador.

export type TaskStatusValue = "CRIADO" | "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";

export interface TimedTask {
  status: TaskStatusValue;
  createdAt: Date | string;
  completedAt?: Date | string | null;
  canceledAt?: Date | string | null;
  dueAt?: Date | string | null;
}

export const APP_TIMEZONE = "America/Sao_Paulo";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function toMs(d: Date | string | null | undefined): number | null {
  if (d === null || d === undefined) return null;
  const ms = typeof d === "string" ? Date.parse(d) : d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export const OPEN_STATUSES: TaskStatusValue[] = ["CRIADO", "ABERTA", "EM_ANDAMENTO"];

export function isOpen(status: TaskStatusValue): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Momento em que a contagem para: agora (abertas), conclusão ou cancelamento. */
export function endOfCount(task: TimedTask, now: Date = new Date()): number {
  if (task.status === "CONCLUIDO") return toMs(task.completedAt) ?? now.getTime();
  if (task.status === "CANCELADO") return toMs(task.canceledAt) ?? now.getTime();
  return now.getTime();
}

/** Tempo decorrido (ms) segundo as regras de status. */
export function elapsedMs(task: TimedTask, now: Date = new Date()): number {
  const start = toMs(task.createdAt) ?? now.getTime();
  return Math.max(0, endOfCount(task, now) - start);
}

/**
 * Atraso (ms) em relação ao prazo. 0 quando não há prazo, quando está no
 * prazo ou quando a tarefa foi cancelada (cancelamento não gera atraso).
 * Concluídas: atraso = conclusão − prazo. Abertas: agora − prazo.
 */
export function overdueMs(task: TimedTask, now: Date = new Date()): number {
  const due = toMs(task.dueAt);
  if (due === null || task.status === "CANCELADO") return 0;
  return Math.max(0, endOfCount(task, now) - due);
}

/** Tarefa aberta com prazo já vencido. */
export function isOverdue(task: TimedTask, now: Date = new Date()): boolean {
  return isOpen(task.status) && overdueMs(task, now) > 0;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Formata em dias e horas: "2 dias e 5 horas", "1 dia", "3 horas", "menos de 1 hora". */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  if (days === 0 && hours === 0) return "menos de 1 hora";
  if (days === 0) return plural(hours, "hora", "horas");
  if (hours === 0) return plural(days, "dia", "dias");
  return `${plural(days, "dia", "dias")} e ${plural(hours, "hora", "horas")}`;
}

/** Duração em horas decimais (para exportação). */
export function msToHours(ms: number): number {
  return Math.round((ms / HOUR) * 100) / 100;
}

export function formatDateTime(d: Date | string | null | undefined): string {
  const ms = toMs(d);
  if (ms === null) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/** Data curta como na caixa de entrada do Gmail: "14:05" (hoje), "21 de out." (este ano) ou "21/10/25". */
export function formatShortDate(d: Date | string | null | undefined, now: Date = new Date()): string {
  const ms = toMs(d);
  if (ms === null) return "";
  const key = (x: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIMEZONE, ...o }).format(new Date(x));
  const ymd = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  if (key(ms, ymd) === key(now.getTime(), ymd)) return key(ms, { hour: "2-digit", minute: "2-digit" });
  if (key(ms, { year: "numeric" }) === key(now.getTime(), { year: "numeric" })) return key(ms, { day: "numeric", month: "short" });
  return key(ms, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Diferença (ms) entre o horário local do fuso e UTC em um instante. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

/**
 * Converte "YYYY-MM-DDTHH:mm" ou "YYYY-MM-DD" (horário de parede no fuso do
 * app, como vem de <input type="datetime-local">) para um Date UTC.
 * Datas sem hora viram o início (endOfDay=false) ou o fim do dia (23:59:59).
 */
export function parseLocalDateTime(value: string | null | undefined, endOfDay = true, timeZone = APP_TIMEZONE): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const hasTime = h !== undefined;
  const hour = hasTime ? Number(h) : endOfDay ? 23 : 0;
  const minute = hasTime ? Number(mi) : endOfDay ? 59 : 0;
  const second = !hasTime && endOfDay ? 59 : 0;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, minute, second);
  // Duas iterações resolvem corretamente fusos com horário de verão.
  let utc = wall - tzOffsetMs(wall, timeZone);
  utc = wall - tzOffsetMs(utc, timeZone);
  return new Date(utc);
}

/** Formata um Date como "YYYY-MM-DDTHH:mm" no fuso do app (para inputs). */
export function toLocalInputValue(d: Date | string | null | undefined, timeZone = APP_TIMEZONE): string {
  const ms = toMs(d);
  if (ms === null) return "";
  const local = new Date(ms + tzOffsetMs(ms, timeZone));
  return local.toISOString().slice(0, 16);
}
