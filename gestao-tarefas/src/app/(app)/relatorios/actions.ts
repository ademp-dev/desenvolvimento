"use server";

import { z } from "zod";
import { signIn } from "@/auth";
import { allowedDomain, GMAIL_SEND_SCOPE } from "@/lib/config";
import { requireAdmin } from "@/lib/current-user";
import { describeFilters, parseFilters } from "@/lib/filters";
import { GmailNotAuthorizedError, sendGmail } from "@/lib/gmail";
import { buildReportPdf } from "@/lib/report";
import { formatDateTime } from "@/lib/time";

export interface SendReportState {
  ok?: string;
  error?: string;
  /** O Google ainda não autorizou o envio pela caixa do usuário. */
  needsAuth?: boolean;
}

const MAX_RECIPIENTS = 20;
const emailSchema = z.string().email();

/** Lê a query string dos filtros que veio do formulário. */
function filtersFrom(qs: string) {
  const sp = new URLSearchParams(qs);
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    params[key] = all.length > 1 ? all : all[0];
  }
  return parseFilters(params);
}

/** Envia o relatório geral (com os filtros da tela) em PDF, pelo Gmail do próprio administrador. */
export async function sendReportAction(_prev: SendReportState, fd: FormData): Promise<SendReportState> {
  const admin = await requireAdmin();
  const to = [
    ...new Set(
      String(fd.get("to") ?? "")
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (to.length === 0) return { error: "Informe ao menos um destinatário." };
  if (to.length > MAX_RECIPIENTS) return { error: `No máximo ${MAX_RECIPIENTS} destinatários.` };
  const invalid = to.filter((e) => !emailSchema.safeParse(e).success);
  if (invalid.length) return { error: `E-mail inválido: ${invalid.join(", ")}` };

  const now = new Date();
  const filters = filtersFrom(String(fd.get("qs") ?? ""));
  const subject = String(fd.get("subject") ?? "").trim().slice(0, 200) || `Relatório geral de tarefas — ${formatDateTime(now)}`;
  const message = String(fd.get("message") ?? "").trim().slice(0, 5000);

  try {
    const { pdf, filename, count } = await buildReportPdf(admin, filters, now);
    const text = [
      ...(message ? [message, ""] : []),
      `Segue em anexo o relatório geral de tarefas da ADEMP (${count} tarefa(s)).`,
      `Filtros: ${describeFilters(filters)}`,
      `Gerado em ${formatDateTime(now)} por ${admin.name}.`,
      "",
      "— Tarefas ADEMP",
    ].join("\n");
    await sendGmail(admin.id, {
      from: { name: admin.name, email: admin.email },
      to,
      subject,
      text,
      attachment: { filename, contentType: "application/pdf", data: pdf },
    });
    return { ok: `Relatório enviado para ${to.join(", ")}. A mensagem está na sua pasta Enviados.` };
  } catch (e) {
    if (e instanceof GmailNotAuthorizedError) return { needsAuth: true, error: "Autorize o envio pelo Gmail para continuar." };
    console.error(e);
    return { error: "Não foi possível enviar o e-mail. Tente novamente." };
  }
}

/**
 * Autorização incremental: pede ao Google só a permissão de ENVIAR e-mail,
 * e só para quem usa este recurso. Volta para o relatório com os mesmos filtros.
 */
export async function authorizeGmailSendAction(fd: FormData) {
  const admin = await requireAdmin();
  const qs = String(fd.get("qs") ?? "");
  await signIn(
    "google",
    { redirectTo: `/relatorios?${qs ? `${qs}&` : ""}enviar=1` },
    {
      scope: `openid email profile ${GMAIL_SEND_SCOPE}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      login_hint: admin.email,
      hd: allowedDomain(),
    },
  );
}
