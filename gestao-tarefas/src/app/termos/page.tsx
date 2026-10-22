import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Termos de uso · Tarefas ADEMP" };

export default function TermsPage() {
  return (
    <InfoPage title="Termos de uso">
      <p>
        O <strong>Tarefas ADEMP</strong> é uma ferramenta interna, de uso exclusivo de colaboradores da ADEMP com conta <strong>@ademp.org.br</strong>,
        para registrar e acompanhar tarefas, inclusive as originadas de e-mails.
      </p>
      <ul>
        <li>O acesso é pessoal e feito com a conta Google da organização.</li>
        <li>Cada usuário vê as tarefas de que é responsável ou que criou. Administradores veem todas as tarefas e o relatório geral.</li>
        <li>As alterações nas tarefas são registradas (quem, o quê e quando) para auditoria.</li>
        <li>O uso deve seguir as políticas internas da ADEMP sobre sigilo e tratamento de informações.</li>
        <li>A ADEMP pode alterar estes termos ou desativar o acesso de usuários a qualquer momento.</li>
      </ul>
      <p>
        Dúvidas:{" "}
        <a className="text-brand hover:underline" href="mailto:administrativo@ademp.org.br">
          administrativo@ademp.org.br
        </a>
        .
      </p>
    </InfoPage>
  );
}
