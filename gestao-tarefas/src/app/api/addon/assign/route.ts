import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AddonAuthError, authenticateAddon } from "@/lib/addon-auth";
import { appBaseUrl } from "@/lib/config";
import { runAssign } from "@/lib/email-api";
import { ServiceError } from "@/lib/task-service";

export const dynamic = "force-dynamic";

/**
 * Complemento do Gmail:
 * - "Encaminhar e atribuir" (janela de escrever): a tarefa passa para o colega e fica "Aberta";
 * - "Atribuir" (painel lateral, `reopen: false`): só troca o responsável.
 */
export async function POST(req: Request) {
  try {
    const user = await authenticateAddon(req);
    const body = (await req.json()) as { reopen?: boolean };
    const result = await runAssign(user, body, appBaseUrl(req), body.reopen !== false);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AddonAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
