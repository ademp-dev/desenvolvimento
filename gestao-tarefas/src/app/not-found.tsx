import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-[22px] text-ink">Não encontrado</h1>
      <p className="text-ink-3">A página ou tarefa não existe, ou você não tem permissão para vê-la.</p>
      <Link href="/" className="btn-primary">
        Voltar ao painel
      </Link>
    </main>
  );
}
