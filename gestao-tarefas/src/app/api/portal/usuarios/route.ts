import { NextResponse } from "next/server";
import { portalKeyOk } from "@/lib/portal-auth";
import { assignableUsers } from "@/lib/task-service";

export const dynamic = "force-dynamic";

/** Usuários que podem receber tarefas: lista de responsáveis no "encaminhamento de serviço" do portal. */
export async function GET(req: Request) {
  if (!portalKeyOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const users = await assignableUsers();
  return NextResponse.json({ users: users.map((u) => ({ name: u.name, email: u.email })) });
}
