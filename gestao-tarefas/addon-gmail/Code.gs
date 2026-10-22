/**
 * Complemento do Gmail — "Tarefas ADEMP".
 *
 * Ao abrir qualquer e-mail, o painel lateral mostra o status da tarefa e os
 * botões:
 *   Abrir tarefa -> Aberta
 *   Play         -> Em andamento
 *   Concluir     -> Concluída
 *   Cancelar     -> Cancelada
 * Todo e-mail começa como "Nova"; a tarefa só é gravada no primeiro clique.
 *
 * Permissões: lê SOMENTE a mensagem aberta (gmail.addons.current.message.readonly)
 * e chama a API do app com o ID token do usuário (ScriptApp.getIdentityToken()).
 *
 * Configuração: Propriedades do script -> APP_URL = https://url-do-app (sem barra no fim).
 */

var STATUS_LABEL = { CRIADO: 'Nova', ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluída', CANCELADO: 'Cancelada' };
var STATUS_COLOR = { CRIADO: '#0b57d0', ABERTA: '#b06000', EM_ANDAMENTO: '#0842a0', CONCLUIDO: '#188038', CANCELADO: '#5f6368' };

// Botões, na ordem do fluxo.
var ACTIONS = [
  { to: 'ABERTA', text: '📂 Abrir tarefa' },
  { to: 'EM_ANDAMENTO', text: '▶ Play' },
  { to: 'CONCLUIDO', text: '✔ Concluir' },
  { to: 'CANCELADO', text: '✖ Cancelar' },
];

function appUrl_() {
  var url = PropertiesService.getScriptProperties().getProperty('APP_URL');
  if (!url) throw new Error('Configure a propriedade do script APP_URL.');
  return url.replace(/\/$/, '');
}

function api_(method, path, payload) {
  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getIdentityToken() },
    muteHttpExceptions: true,
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(appUrl_() + path, options);
  var text = res.getContentText();
  var body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (err) { body = { error: text }; }
  if (res.getResponseCode() >= 400) throw new Error(body.error || ('Erro HTTP ' + res.getResponseCode()));
  return body;
}

function extractEmail_(value) {
  var m = /<([^<>\s]+@[^<>\s]+)>/.exec(value || '');
  return (m ? m[1] : (value || '').trim()).toLowerCase();
}

function onHomepage(e) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Tarefas ADEMP'))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(
          'Abra um e-mail para ver o status e usar os botões Abrir tarefa, Play, Concluir e Cancelar.<br><br>' +
            'Dica: deixe este painel aberto. Ele acompanha cada e-mail que você abrir.'
        )
      )
    )
    .setFixedFooter(
      CardService.newFixedFooter().setPrimaryButton(
        CardService.newTextButton().setText('🗂 Abrir app de tarefas').setOpenLink(CardService.newOpenLink().setUrl(appUrl_()))
      )
    )
    .build();
}

/** Escapa texto para os campos que aceitam HTML simples nos cartões. */
function esc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Botão que abre um endereço do app numa aba nova. */
function linkButton_(text, url, filled) {
  var btn = CardService.newTextButton()
    .setText(text)
    .setOpenLink(CardService.newOpenLink().setUrl(url).setOpenAs(CardService.OpenAs.FULL_SIZE));
  if (filled) btn.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
  return btn;
}

/**
 * Ícone na barra da janela de escrever/responder: resumo das suas tarefas.
 * O modal da janela de escrever é restrito: usa só título, texto e botões
 * que abrem link (componentes que já funcionaram nesse modal).
 */
function onComposeAction(e) {
  var section = CardService.newCardSection();
  try {
    var s = api_('get', '/api/addon/summary');
    var nums =
      'Novas: <b>' + s.counts.CRIADO + '</b><br>' +
      'Abertas: <b>' + s.counts.ABERTA + '</b><br>' +
      'Em andamento: <b>' + s.counts.EM_ANDAMENTO + '</b><br>' +
      'Vencidas: <b><font color="#d93025">' + s.counts.overdue + '</font></b>';
    section.addWidget(CardService.newTextParagraph().setText(nums));
    section.addWidget(linkButton_('🗂 Abrir app completo', appUrl_(), true));

    if (!s.tasks.length) {
      section.addWidget(CardService.newTextParagraph().setText('<b>Abertas:</b> nenhuma tarefa aberta. 🎉'));
    } else {
      section.addWidget(
        CardService.newTextParagraph().setText(
          '<b>Abertas' + (s.total > s.tasks.length ? ' (10 de ' + s.total + ')' : ' (' + s.total + ')') + ':</b>'
        )
      );
      s.tasks.forEach(function (t) {
        section.addWidget(
          CardService.newTextParagraph().setText(
            (t.overdue ? '<font color="#d93025">⏰ VENCIDA</font> · ' : '') +
              t.statusLabel + ' · há ' + t.elapsed + (t.due ? ' · prazo ' + t.due : '')
          )
        );
        section.addWidget(linkButton_('#' + t.id + ' ' + String(t.title).slice(0, 60), t.url, false));
      });
    }
  } catch (err) {
    section.addWidget(CardService.newTextParagraph().setText('Não foi possível carregar o resumo: ' + esc_(err.message)));
    section.addWidget(linkButton_('🗂 Abrir app completo', appUrl_(), true));
  }
  return [CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Suas tarefas')).addSection(section).build()];
}

function readMessage_(e) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  var m = GmailApp.getMessageById(e.gmail.messageId);
  var me = Session.getActiveUser().getEmail().toLowerCase();
  var from = m.getFrom() || '';
  var recipients = []
    .concat((m.getTo() || '').split(','))
    .concat((m.getCc() || '').split(','))
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s; });
  return {
    gmailMessageId: m.getId(),
    threadId: m.getThread().getId(),
    subject: m.getSubject() || '(sem assunto)',
    sender: from,
    recipients: recipients,
    emailDate: m.getDate().toISOString(),
    direction: from.toLowerCase().indexOf(me) >= 0 ? 'ENVIADO' : 'RECEBIDO',
  };
}

function onGmailMessageOpen(e) {
  try {
    var msg = readMessage_(e);
    var ctx = api_('get', '/api/addon/context?messageId=' + encodeURIComponent(msg.gmailMessageId));
    return buildCard_(msg, ctx.task, ctx);
  } catch (err) {
    return errorCard_(err);
  }
}

/** Cartão do e-mail. `task` = null significa "Nova" (ainda sem tarefa gravada). */
function buildCard_(msg, task, ctx) {
  var status = task ? task.status : 'CRIADO';
  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle(task ? 'Tarefa #' + task.id : 'Tarefa')
      .setSubtitle(task ? task.title : msg.subject)
  );

  // Status atual
  var info = CardService.newCardSection().addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Status')
      .setText('<b><font color="' + STATUS_COLOR[status] + '">' + STATUS_LABEL[status] + '</font></b>')
      .setBottomLabel(task ? 'Há ' + task.elapsed + ' · ' + task.responsible : 'Ainda não registrada')
  );
  if (task && task.overdue) {
    info.addWidget(CardService.newTextParagraph().setText('<font color="#d93025"><b>⏰ Prazo vencido</b></font>'));
  }
  card.addSection(info);

  // Botões permitidos para o status atual
  var allowed = task ? task.allowed : ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'];
  var buttons = CardService.newButtonSet();
  ACTIONS.forEach(function (a) {
    if (allowed.indexOf(a.to) < 0) return;
    var action = CardService.newAction()
      .setFunctionName('onStatusButton')
      .setParameters({ to: a.to, msg: JSON.stringify(msg) });
    var btn = CardService.newTextButton().setText(a.text).setOnClickAction(action);
    if (a.to !== 'CANCELADO') btn.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
    if (a.to === 'CONCLUIDO') btn.setBackgroundColor('#188038');
    buttons.addButton(btn);
  });
  var actions = CardService.newCardSection();
  if (allowed.length) {
    actions.addWidget(buttons);
    actions.addWidget(
      CardService.newTextInput()
        .setFieldName('note')
        .setTitle('Observação (obrigatória para cancelar)')
        .setMultiline(true)
    );
  } else {
    actions.addWidget(CardService.newTextParagraph().setText('Tarefa encerrada. Somente um administrador pode reabri-la no app.'));
  }
  card.addSection(actions);

  // Detalhes usados só na criação (primeiro clique)
  if (!task) {
    var responsible = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle('Responsável')
      .setFieldName('responsibleId');
    ctx.users.forEach(function (u) {
      responsible.addItem(u.name, u.id, u.id === ctx.user.id);
    });
    card.addSection(
      CardService.newCardSection()
        .setHeader('Detalhes da tarefa')
        .setCollapsible(true)
        .setNumUncollapsibleWidgets(0)
        .addWidget(CardService.newTextInput().setFieldName('title').setTitle('Título').setValue(msg.subject.slice(0, 200)))
        .addWidget(CardService.newTextInput().setFieldName('requesterEmail').setTitle('Solicitante (e-mail)').setValue(extractEmail_(msg.sender)))
        .addWidget(responsible)
        .addWidget(CardService.newDatePicker().setFieldName('dueAt').setTitle('Prazo (opcional)'))
    );
  }

  // Rodapé fixo, sempre visível: abre o app (e a tarefa, quando já existir).
  var footer = CardService.newFixedFooter().setPrimaryButton(
    CardService.newTextButton().setText('🗂 Abrir app de tarefas').setOpenLink(CardService.newOpenLink().setUrl(appUrl_()))
  );
  if (task) {
    footer.setSecondaryButton(
      CardService.newTextButton().setText('Ver esta tarefa').setOpenLink(CardService.newOpenLink().setUrl(task.url))
    );
  }
  card.setFixedFooter(footer);
  return card.build();
}

function formValue_(e, name) {
  var input = e.commonEventObject.formInputs && e.commonEventObject.formInputs[name];
  if (!input) return null;
  if (input.stringInputs) return input.stringInputs.value[0];
  if (input.dateInput) return input.dateInput.msSinceEpoch;
  return null;
}

function onStatusButton(e) {
  var params = e.commonEventObject.parameters;
  var msg = JSON.parse(params.msg);
  var note = formValue_(e, 'note');
  if (params.to === 'CANCELADO' && !(note && note.trim())) {
    return notify_('Escreva o motivo do cancelamento no campo Observação.');
  }
  try {
    var dueMs = formValue_(e, 'dueAt');
    var res = api_('post', '/api/addon/status', {
      to: params.to,
      note: note,
      title: formValue_(e, 'title'),
      responsibleId: formValue_(e, 'responsibleId'),
      requesterEmail: formValue_(e, 'requesterEmail'),
      // O DatePicker devolve meia-noite UTC do dia; o servidor usa 23:59 de Brasília.
      dueAt: dueMs ? new Date(Number(dueMs)).toISOString().slice(0, 10) : null,
      email: msg,
    });
    var ctx = api_('get', '/api/addon/context?messageId=' + encodeURIComponent(msg.gmailMessageId));
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildCard_(msg, res.task, ctx)))
      .setNotification(CardService.newNotification().setText('Status: ' + STATUS_LABEL[params.to]))
      .build();
  } catch (err) {
    return notify_('Erro: ' + err.message);
  }
}

function notify_(text) {
  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text)).build();
}

function errorCard_(err) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Tarefas ADEMP'))
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText('Não foi possível carregar: ' + err.message)))
    .build();
}

/**
 * Utilitário para a configuração inicial: execute no editor do Apps Script e
 * copie o valor "aud" do log para a variável ADDON_OAUTH_CLIENT_IDS do app.
 */
function mostrarClientId() {
  var part = ScriptApp.getIdentityToken().split('.')[1];
  while (part.length % 4) part += '=';
  var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(part)).getDataAsString());
  Logger.log('ADDON_OAUTH_CLIENT_IDS=' + payload.aud);
}