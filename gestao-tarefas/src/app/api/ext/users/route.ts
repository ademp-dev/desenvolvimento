import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/config";
import { ExtAuthError, authenticateExtension } from "@/lib/ext-auth";
import { assignableUsers } from "@/lib/task-service";

export const dynamic = "force-dynamic";

/** Extensão do Chrome: usuários ativos cadastrados (para o botão "Atribuir"). */
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  try {
    await authenticateExtension(req, new URL(req.url).searchParams.get("mailbox"));
    return NextResponse.json({ users: await assignableUsers() });
  } catch (e) {
    if (e instanceof ExtAuthError) return NextResponse.json({ error: e.message, code: e.code, loginUrl: `${base}/login` }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
