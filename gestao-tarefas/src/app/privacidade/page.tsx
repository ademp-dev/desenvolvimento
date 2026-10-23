import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Privacidade · Tarefas ADEMP" };

export default function PrivacyPage() {
  return (
    <InfoPage title="Política de privacidade">
      <p>
        O <strong>Tarefas ADEMP</strong> é uma ferramenta interna da Associação dos Advogados Empregados da Petrobras (ADEMP), de uso exclusivo de
        contas do domínio <strong>ademp.org.br</strong>.
      </p>
      <h2>Dados que coletamos</h2>
      <ul>
        <li>Da sua conta Google: nome, e-mail e foto, para identificar você no login.</li>
        <li>
          Dos e-mails que você transforma em tarefa: assunto, remetente, destinatários, data e o link para abrir a mensagem no Gmail. O corpo do
          e-mail e os anexos <strong>não</strong> são armazenados.
        </li>
        <li>As tarefas que você cria ou altera, com o histórico de alterações (quem, o quê e quando), para auditoria interna.</li>
      </ul>
      <h2>Acesso ao Gmail</h2>
      <ul>
        <li>O complemento do Gmail lê somente a mensagem que você abriu, e apenas quando você clica em um dos botões.</li>
        <li>
          No app web, a leitura da caixa (somente leitura) é pedida apenas a quem usa o recurso &quot;Criar do Gmail&quot; e pode ser desconectada a
          qualquer momento. O app nunca envia, apaga ou altera e-mails.
        </li>
        <li>Nenhum usuário acessa a caixa de e-mail de outro usuário.</li>
      </ul>
      <h2>Armazenamento e compartilhamento</h2>
      <ul>
        <li>Os dados ficam em servidores no Brasil (São Paulo), com acesso restrito e conexões criptografadas.</li>
        <li>Os tokens de acesso ao Gmail são guardados criptografados.</li>
        <li>Os dados não são vendidos nem compartilhados com terceiros.</li>
      </ul>
      <h2>Seus direitos</h2>
      <p>
        Para solicitar acesso, correção ou exclusão dos seus dados, ou para tirar dúvidas, escreva para{" "}
        <a className="text-brand hover:underline" href="mailto:administrativo@ademp.org.br">
          administrativo@ademp.org.br
        </a>
        .
      </p>
    </InfoPage>
  );
}
