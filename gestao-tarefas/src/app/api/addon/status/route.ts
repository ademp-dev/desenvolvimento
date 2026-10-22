import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AddonAuthError, authenticateAddon } from "@/lib/addon-auth";
import { appBaseUrl } from "@/lib/config";
import { BadRequest, runEmailStatus } from "@/lib/email-api";
import { ServiceError } from "@/lib/task-service";

export const dynamic = "force-dynamic";

/** Botões do Gmail: Abrir tarefa (Aberta), Play (Em andamento), Concluir, Cancelar. */
export async function POST(req: Request) {
  try {
    const user = await authenticateAddon(req);
    const task = await runEmailStatus(user, await req.json(), appBaseUrl(req));
    return NextResponse.json({ task });
  } catch (e) {
    if (e instanceof AddonAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
    if (e instanceof ServiceError || e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
