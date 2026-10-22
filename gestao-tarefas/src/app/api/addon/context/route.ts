import { NextResponse } from "next/server";
import { AddonAuthError, authenticateAddon } from "@/lib/addon-auth";
import { appBaseUrl } from "@/lib/config";
import { emailTaskSummary } from "@/lib/email-task";
import { assignableUsers } from "@/lib/task-service";

export const dynamic = "force-dynamic";

/**
 * Dados do cartão do complemento: usuário, responsáveis possíveis e a tarefa
 * ligada à mensagem aberta (`task: null` = e-mail ainda "Nova").
 */
export async function GET(req: Request) {
  try {
    const user = await authenticateAddon(req);
    const messageId = new URL(req.url).searchParams.get("messageId") ?? "";
    const base = appBaseUrl(req);
    const [users, task] = await Promise.all([assignableUsers(), messageId ? emailTaskSummary(user, messageId, base) : Promise.resolve(null)]);
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      users,
      task,
      appUrl: base,
    });
  } catch (e) {
    if (e instanceof AddonAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
