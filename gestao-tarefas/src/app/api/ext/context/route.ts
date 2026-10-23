import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/config";
import { emailTaskSummary } from "@/lib/email-task";
import { ExtAuthError, authenticateExtension } from "@/lib/ext-auth";

export const dynamic = "force-dynamic";

/** Extensão do Chrome: status da tarefa ligada à mensagem (`task: null` = "Nova"). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = appBaseUrl(req);
  try {
    const user = await authenticateExtension(req, url.searchParams.get("mailbox"));
    const messageId = url.searchParams.get("messageId") ?? "";
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(messageId)) return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });
    const task = await emailTaskSummary(user, messageId, base);
    return NextResponse.json({ user: { name: user.name, email: user.email }, task, appUrl: base });
  } catch (e) {
    if (e instanceof ExtAuthError) return NextResponse.json({ error: e.message, code: e.code, loginUrl: `${base}/login` }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
