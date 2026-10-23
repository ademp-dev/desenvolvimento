import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { Logo } from "@/components/Brand";
import { getCurrentUser } from "@/lib/current-user";
import { allowedDomain } from "@/lib/config";

const ERRORS: Record<string, string> = {
  dominio: "Use uma conta Google da organização para entrar.",
  inativo: "Seu acesso está desativado. Procure um administrador.",
  AccessDenied: "Acesso negado.",
  Configuration: "Erro de configuração da autenticação. Avise o administrador.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const domain = allowedDomain();

  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-[1040px] rounded-[28px] bg-white p-9 md:grid md:grid-cols-2 md:gap-10">
        <div>
          <Logo size={48} />
          <h1 className="mt-6 text-[36px] leading-tight text-ink">Fazer login</h1>
          <p className="mt-3 text-base text-ink">Tarefas ADEMP — use sua conta da organização.</p>
        </div>
        <div className="mt-8 flex flex-col justify-center md:mt-0">
          {error && <p className="mb-4 rounded-lg bg-[#fce8e6] p-3 text-sm text-[#b3261e]">{ERRORS[error] ?? "Não foi possível entrar."}</p>}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className="btn w-full border border-[#747775] bg-white py-3 text-ink hover:bg-[#f8fafd]" type="submit">
              <GoogleIcon /> Continuar com o Google
            </button>
          </form>
          {domain && <p className="mt-4 text-sm text-ink-3">Acesso restrito a contas @{domain}</p>}
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-4 7-9.9 7-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-4.2-13.5-10l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
