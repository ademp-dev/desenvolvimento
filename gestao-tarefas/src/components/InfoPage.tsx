import Link from "next/link";
import { Logo } from "./Brand";

/** Moldura simples para as páginas públicas (privacidade, termos, suporte). */
export function InfoPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-page p-4">
      <article className="mx-auto max-w-3xl rounded-[28px] bg-white p-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo size={36} />
          <span className="text-xl text-ink-2">Tarefas</span>
        </Link>
        <h1 className="mt-6 text-[28px] text-ink">{title}</h1>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
        <p className="mt-8 text-xs text-ink-3">
          <Link href="/privacidade" className="hover:underline">
            Privacidade
          </Link>{" "}
          ·{" "}
          <Link href="/termos" className="hover:underline">
            Termos de uso
          </Link>{" "}
          ·{" "}
          <Link href="/suporte" className="hover:underline">
            Suporte
          </Link>
        </p>
      </article>
    </main>
  );
}
