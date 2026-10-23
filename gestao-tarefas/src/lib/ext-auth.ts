import { getCurrentUser } from "./current-user";

// Autenticação das chamadas da extensão do Chrome.
// A extensão usa o próprio login do app (cookie de sessão), enviado pelo
// service worker da extensão. Proteções:
// - cabeçalho X-Tarefas-Ext obrigatório: páginas web comuns não conseguem
//   enviá-lo para outro site sem uma pré-verificação CORS, que o app recusa;
// - o cookie de sessão é SameSite=Lax (não vai em POST vindo de outros sites);
// - opcionalmente, EXTENSION_IDS restringe quais extensões podem chamar a API.
// - a caixa do Gmail aberta precisa ser a mesma conta logada no app.

export class ExtAuthError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

function allowedExtensionOrigins(): string[] {
  return (process.env.EXTENSION_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => `chrome-extension://${id}`);
}

export async function authenticateExtension(req: Request, mailbox: string | null | undefined) {
  if (req.headers.get("x-tarefas-ext") !== "1") throw new ExtAuthError("Requisição não permitida", 403, "FORBIDDEN");
  const allowed = allowedExtensionOrigins();
  // Chamadas vindas de uma origem diferente das extensões liberadas são recusadas.
  const origin = req.headers.get("origin");
  if (allowed.length && origin && !allowed.includes(origin)) throw new ExtAuthError("Extensão não autorizada", 403, "FORBIDDEN");

  const user = await getCurrentUser();
  if (!user) throw new ExtAuthError("Entre no app de tarefas neste navegador", 401, "LOGIN_REQUIRED");

  if (mailbox && mailbox.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new ExtAuthError(
      `Este Gmail é de ${mailbox}, mas o app de tarefas está conectado como ${user.email}. Entre no app com a mesma conta.`,
      409,
      "MAILBOX_MISMATCH",
    );
  }
  return user;
}
