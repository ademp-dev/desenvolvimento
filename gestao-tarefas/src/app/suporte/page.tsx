import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Suporte · Tarefas ADEMP" };

export default function SupportPage() {
  return (
    <InfoPage title="Suporte">
      <p>
        Precisa de ajuda com o <strong>Tarefas ADEMP</strong>? Escreva para{" "}
        <a className="text-brand hover:underline" href="mailto:administrativo@ademp.org.br">
          administrativo@ademp.org.br
        </a>
        .
      </p>
      <h2>Como usar no Gmail</h2>
      <ul>
        <li>Abra um e-mail e clique no ícone do Tarefas ADEMP na barra lateral direita do Gmail.</li>
        <li>Todo e-mail começa com o status &quot;Nova&quot;.</li>
        <li>
          Use os botões: <strong>Abrir tarefa</strong> (Aberta), <strong>Play</strong> (Em andamento), <strong>Concluir</strong> (Concluída) e{" "}
          <strong>Cancelar</strong> (Cancelada, com motivo).
        </li>
        <li>As tarefas também podem ser vistas e editadas no app web, com painel, filtros e relatórios.</li>
      </ul>
    </InfoPage>
  );
}
