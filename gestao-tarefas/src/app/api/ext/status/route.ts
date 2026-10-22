import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { appBaseUrl } from "@/lib/config";
import { BadRequest, runEmailStatus } from "@/lib/email-api";
import { ExtAuthError, authenticateExtension } from "@/lib/ext-auth";
import { ServiceError } from "@/lib/task-service";

export const dynamic = "force-dynamic";

/** Extensão do Chrome: botões Abrir tarefa / Play / Concluir / Cancelar. */
export async function POST(req: Request) {
  const base = appBaseUrl(req);
  try {
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: "Formato inválido" }, { status: 415 });
    }
    const body = (await req.json()) as { mailbox?: string };
    const user = await authenticateExtension(req, body.mailbox);
    const task = await runEmailStatus(user, body, base);
    return NextResponse.json({ task });
  } catch (e) {
    if (e instanceof ExtAuthError) return NextResponse.json({ error: e.message, code: e.code, loginUrl: `${base}/login` }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
    if (e instanceof ServiceError || e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
