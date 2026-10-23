# Gestão de Tarefas integrada ao Gmail

Aplicação web para criar, acompanhar e relatar tarefas originadas de e-mails do Gmail ou cadastradas manualmente. Login com contas Google Workspace da organização.

## Arquitetura

```
Complemento do Gmail (Apps Script) ──HTTPS + ID token──▶ App Next.js (UI + API) ──▶ PostgreSQL
                                                          │
                                                          └──OAuth do próprio usuário──▶ Gmail API (somente leitura)
```

| Camada | Tecnologia | Onde |
|---|---|---|
| Interface + API | Next.js 16 (App Router, Server Actions), React 19, Tailwind 4 | `src/app` |
| Autenticação | Auth.js v5 (Google OpenID Connect), sessão JWT de 12 h | `src/auth.ts` |
| Regras de negócio | Serviços TypeScript + validação Zod | `src/lib/task-service.ts`, `status.ts`, `permissions.ts`, `time.ts` |
| Banco | PostgreSQL + Prisma (migrações versionadas) | `prisma/` |
| Integração Gmail (web) | Gmail API REST, escopo `gmail.readonly`, autorização incremental | `src/lib/gmail.ts` |
| Integração Gmail (painel lateral) | Google Workspace Add-on, escopo `gmail.addons.current.message.readonly` | `addon-gmail/` |
| Exportação | CSV (`;` + BOM, compatível com Excel pt-BR) e XLSX (ExcelJS) | `src/lib/export.ts` |

### Modelo de dados

- **User**: e-mail, nome, `role` (USER/ADMIN), `active`, último acesso.
- **Task**: título, descrição, origem (EMAIL/MANUAL), status, responsável → User, criador → User, prazo, criação, atualização, início, conclusão e cancelamento.
- **EmailSource** (1:1 com Task): id da mensagem e da conversa, assunto, remetente, destinatários, data, link, caixa de origem, recebido ou enviado. O corpo do e-mail **não** é armazenado.
- **TaskNote**: observações.
- **TaskHistory**: trilha de auditoria (criação, status, edição de cada campo, reatribuição, observação), sempre gravada na mesma transação da alteração.
- **GoogleToken**: tokens OAuth do Gmail do próprio usuário, criptografados com AES-256-GCM.

Datas ficam em UTC (`timestamptz`) e são exibidas em `America/Sao_Paulo`.

### Regras de negócio

- **Status**: Criado → Em andamento → Concluído; Criado ou Em andamento → Cancelado; Criado → Concluído direto também é permitido. Concluído e Cancelado são finais. Só o administrador reabre (volta para Em andamento e limpa as datas de encerramento). Cancelar exige um motivo.
- **Tempo decorrido**: tarefas abertas contam da criação até agora; concluídas, até a conclusão; canceladas, até o cancelamento. O formato é "2 dias e 5 horas" (tempo corrido, 24 h por dia) e a tela atualiza sozinha a cada 30 s, sem recarregar a página.
- **Atraso**: tarefa aberta com prazo passado aparece como "vencida". Concluída depois do prazo aparece como "concluída com atraso". Cancelada nunca conta como atrasada.
- **Edição**: somente tarefas abertas. Cada campo alterado vira uma linha do histórico.
- **Proteção contra conflito**: a mudança de status só é aplicada se o status ainda for o mesmo que foi lido. Duas abas não sobrescrevem uma à outra.

### Permissões

| Ação | Usuário | Administrador |
|---|---|---|
| Ver, editar, mudar status e comentar | Tarefas em que é responsável **ou** criador | Todas |
| Atribuir tarefa a outra pessoa | Sim | Sim |
| Painel e lista | Só as tarefas visíveis para ele | Todas |
| Relatório geral e exportação | Não | Sim |
| Gerenciar usuários (perfil, ativar/desativar, pré-cadastro) | Não | Sim |
| Reabrir tarefa encerrada | Não | Sim |

- Só contas **verificadas do domínio configurado** (`ALLOWED_DOMAIN`) conseguem entrar, tanto no app quanto pelo complemento.
- O app lê apenas a caixa de quem está logado, com o token dessa pessoa. Não existe código que leia a caixa de outro usuário. Quando uma tarefa vinda de e-mail é atribuída a outra pessoa, ela passa a ver só os **metadados** desse e-mail (assunto, remetente, destinatários e data), por decisão de quem atribuiu.
- Usuário desativado perde o acesso na hora, porque a sessão é revalidada no banco a cada requisição.
- Todas as verificações de permissão são feitas no servidor (`src/lib/permissions.ts`).

## Configuração no Google Cloud (uma vez)

1. Crie ou escolha um projeto no [Google Cloud Console](https://console.cloud.google.com/) **dentro da organização Workspace**.
2. Em **APIs e serviços → Biblioteca**, ative a **Gmail API**.
3. Em **Tela de consentimento OAuth**, escolha o tipo **Interno**. Com isso o app não precisa da verificação do Google para o escopo restrito do Gmail.
   - Escopos: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`.
4. Em **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**:
   - Origens JavaScript: `http://localhost:3000` e a URL de produção.
   - URIs de redirecionamento: `http://localhost:3000/api/auth/callback/google` e `https://SUA-URL/api/auth/callback/google`.
   - Copie o **ID do cliente** e a **chave secreta** para `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`.

## Execução local

Pré-requisitos: Node.js 24 e PostgreSQL 15 ou superior. Para o PostgreSQL, pode usar `docker compose up -d` (arquivo incluído) ou uma instalação local.

```bash
npm install
cp .env.example .env.local      # preencha as variáveis (veja os comentários no arquivo)
npx prisma migrate deploy       # cria as tabelas
npm run dev                     # http://localhost:3000
```

Gere os segredos com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use um valor para `AUTH_SECRET` e **outro** para `TOKEN_ENCRYPTION_KEY`.

Os e-mails listados em `ADMIN_EMAILS` viram administradores no primeiro login.

## Testes

```bash
npm test                 # testes unitários: tempo, fuso, transições, permissões, filtros, indicadores, CSV
npm run lint             # verificação de tipos
```

Testes de integração com PostgreSQL real. Use um banco **descartável**, porque os dados são apagados:

```bash
# PowerShell
$env:DATABASE_URL="postgresql://.../tarefas_teste"; npx prisma migrate deploy
$env:RUN_DB_TESTS="1"; npm test
```

Os testes de integração cobrem: criação manual e por e-mail, visibilidade por usuário, filtros (vencidas, origem, texto, nº), transições com datas e auditoria, reabertura só pelo admin, histórico campo a campo, bloqueio de responsável inativo e geração do XLSX.

## Implantação no Google Cloud (Cloud Run + Cloud SQL)

```bash
# 1. Banco
gcloud sql instances create tarefas-db --database-version=POSTGRES_17 --region=southamerica-east1 --tier=db-f1-micro
gcloud sql databases create tarefas --instance=tarefas-db
gcloud sql users create tarefas --instance=tarefas-db --password=SENHA_FORTE

# 2. Segredos (repita para AUTH_SECRET, AUTH_GOOGLE_SECRET, TOKEN_ENCRYPTION_KEY, DATABASE_URL)
printf "VALOR" | gcloud secrets create AUTH_SECRET --data-file=-

# 3. Build e deploy (a partir da pasta do projeto)
gcloud run deploy gestao-tarefas --source . --region=southamerica-east1 \
  --add-cloudsql-instances=PROJETO:southamerica-east1:tarefas-db \
  --set-env-vars=AUTH_URL=https://SUA-URL,AUTH_TRUST_HOST=true,ALLOWED_DOMAIN=ademp.org.br,ADMIN_EMAILS=administrativo@ademp.org.br,AUTH_GOOGLE_ID=...,ADDON_OAUTH_CLIENT_IDS=... \
  --set-secrets=AUTH_SECRET=AUTH_SECRET:latest,AUTH_GOOGLE_SECRET=AUTH_GOOGLE_SECRET:latest,TOKEN_ENCRYPTION_KEY=TOKEN_ENCRYPTION_KEY:latest,DATABASE_URL=DATABASE_URL:latest \
  --allow-unauthenticated
```

- Com Cloud SQL via socket, a `DATABASE_URL` fica assim: `postgresql://tarefas:SENHA@localhost/tarefas?host=/cloudsql/PROJETO:southamerica-east1:tarefas-db`.
- O contêiner executa `prisma migrate deploy` antes de iniciar, então as migrações são aplicadas automaticamente.
- `--allow-unauthenticated` só libera o acesso à página. O login Google continua obrigatório para tudo.
- Depois do primeiro deploy, coloque a URL final em `AUTH_URL` e nas URIs de redirecionamento do cliente OAuth.
- Faça backup automático do Cloud SQL (ativado por padrão) e defina a retenção conforme a política da organização.

## Complemento do Gmail (painel lateral)

1. Acesse [script.google.com](https://script.google.com) e crie um projeto chamado "Gestão de Tarefas".
2. Em **Configurações do projeto**:
   - marque "Mostrar arquivo de manifesto appsscript.json";
   - em **Projeto do Google Cloud**, vincule o **mesmo projeto** do passo anterior (número do projeto).
3. Copie `addon-gmail/appsscript.json` e `addon-gmail/Code.gs` para o projeto. No manifesto, troque `SUBSTITUA-PELA-URL-DO-APP` pela URL do app.
4. Em **Propriedades do script**, crie `APP_URL` = URL do app, sem barra no final.
5. Execute a função `mostrarClientId` uma vez, autorize e copie o valor `ADDON_OAUTH_CLIENT_IDS=...` do log para a variável do app. Depois reimplante o app.
6. Teste: **Implantar → Testar implantações → Instalar**. Abra um e-mail no Gmail e o painel "Gestão de Tarefas" aparece à direita.
7. Para liberar para toda a organização: **Implantar → Nova implantação → Complemento**. Depois publique no Google Workspace Marketplace como **privado (somente o domínio)** ou instale pelo Admin Console para todos os usuários.

O complemento lê apenas a mensagem aberta e mais nada da caixa. A API do app valida o ID token do Google (assinatura, validade, audience, e-mail verificado e domínio) a cada chamada.

## Estrutura

```
src/
  auth.ts                    login Google, restrição de domínio, gravação dos tokens do Gmail
  lib/
    time.ts                  contagem de tempo, atraso, fuso horário
    status.ts                transições e datas de status
    permissions.ts           regras de acesso
    task-service.ts          criar/editar/status/observações + auditoria
    filters.ts, queries.ts   filtros, ordenação e consultas
    stats.ts                 indicadores (gerais e por usuário)
    gmail.ts                 Gmail API (somente a caixa do próprio usuário)
    addon-auth.ts            validação do ID token do complemento
    export.ts                CSV / XLSX
  app/
    login/                   tela de autenticação
    (app)/page.tsx           painel
    (app)/tarefas/           lista, nova, detalhes, edição, criar a partir do Gmail
    (app)/relatorios/        relatório geral (admin)
    (app)/admin/usuarios/    gestão de usuários (admin)
    api/addon/*              API do complemento
    api/relatorios/exportar  exportação CSV/XLSX
addon-gmail/                 complemento Apps Script
prisma/                      esquema e migrações
tests/                       testes unitários e de integração
```
