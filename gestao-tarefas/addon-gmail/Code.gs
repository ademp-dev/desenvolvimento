/**
 * Complemento do Gmail — "Tarefas ADEMP".
 *
 * Painel lateral (ao abrir um e-mail): status da tarefa e as ações
 *   Abrir tarefa -> Aberta | Play -> Em andamento | Concluir -> Concluída | Cancelar -> Cancelada
 * Todo e-mail começa como "Nova"; a tarefa só é gravada no primeiro clique.
 * Concluir pede a data-hora inicial e a final (sugeridas, editáveis).
 *
 * Janela de escrever (ícone na barra): resumo das suas tarefas e
 * "Encaminhar e atribuir" — passa a tarefa do e-mail para um colega
 * cadastrado, com status "Aberta".
 *
 * Permissões: lê SOMENTE a mensagem aberta e os destinatários do rascunho;
 * chama a API do app com o ID token do usuário (ScriptApp.getIdentityToken()).
 *
 * Configuração: Propriedades do script -> APP_URL = https://url-do-app (sem barra no fim).
 */

var STATUS_LABEL = { CRIADO: 'Nova', ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluída', CANCELADO: 'Cancelada' };
var STATUS_COLOR = { CRIADO: '#0b57d0', ABERTA: '#b06000', EM_ANDAMENTO: '#0842a0', CONCLUIDO: '#188038', CANCELADO: '#5f6368' };

// Ações na ordem do fluxo: nome (dica ao passar o mouse) e ícone (mesmos da extensão).
var ACTIONS = [
  { to: 'ABERTA', label: 'Abrir tarefa', icon: 'acao-abrir.png' },
  { to: 'EM_ANDAMENTO', label: 'Play — iniciar', icon: 'acao-play.png' },
  { to: 'CONCLUIDO', label: 'Concluir', icon: 'acao-concluir.png' },
  { to: 'CANCELADO', label: 'Cancelar (escreva o motivo na observação)', icon: 'acao-cancelar.png' },
];

function appUrl_() {
  var url = PropertiesService.getScriptProperties().getProperty('APP_URL');
  if (!url) throw new Error('Configure a propriedade do script APP_URL.');
  return url.replace(/\/$/, '');
}

function logoUrl_() {
  return appUrl_() + '/addon-logo.png';
}

/** Cabeçalho padrão: logo + "Tarefas ADEMP" + subtítulo. */
function header_(subtitle) {
  var h = CardService.newCardHeader().setTitle('Tarefas ADEMP').setImageUrl(logoUrl_()).setImageAltText('ADEMP');
  if (subtitle) h.setSubtitle(subtitle);
  return h;
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

function notify_(text) {
  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(text)).build();
}

function formValue_(e, name) {
  var input = e.commonEventObject.formInputs && e.commonEventObject.formInputs[name];
  if (!input) return null;
  if (input.stringInputs) return input.stringInputs.value[0];
  if (input.dateInput) return input.dateInput.msSinceEpoch;
  if (input.dateTimeInput) return input.dateTimeInput.msSinceEpoch;
  return null;
}

// =====================================================================
// Página inicial
// =====================================================================

function onHomepage(e) {
  return CardService.newCardBuilder()
    .setHeader(header_())
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(
          'Abra um e-mail para ver o status e usar as ações Abrir tarefa, Play, Concluir e Cancelar.<br><br>' +
            'Dica: deixe este painel aberto. Ele acompanha cada e-mail que você abrir.'
        )
      )
    )
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(linkButton_('Abrir app de tarefas', appUrl_(), false)))
    .build();
}

// =====================================================================
// Painel lateral do e-mail aberto
// =====================================================================

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

// Último e-mail aberto no painel (guardado por 30 min). Ao encaminhar, o Gmail
// não informa ao complemento qual e-mail está sendo encaminhado; a janela de
// escrever usa este registro e mostra o assunto para o usuário conferir.
var LAST_MSG_KEY = 'tarefas_ultimo_email';

function rememberMessage_(msg) {
  try {
    CacheService.getUserCache().put(LAST_MSG_KEY, JSON.stringify(msg), 1800);
  } catch (err) {
    console.log('Tarefas ADEMP: não foi possível guardar o último e-mail: ' + err.message);
  }
}

function lastMessage_() {
  try {
    var raw = CacheService.getUserCache().get(LAST_MSG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function onGmailMessageOpen(e) {
  try {
    var msg = readMessage_(e);
    rememberMessage_(msg);
    var ctx = api_('get', '/api/addon/context?messageId=' + encodeURIComponent(msg.gmailMessageId));
    return buildCard_(msg, ctx.task, ctx);
  } catch (err) {
    return errorCard_(err);
  }
}

function statusAction_(to, msg) {
  return CardService.newAction().setFunctionName('onStatusButton').setParameters({ to: to, msg: JSON.stringify(msg) });
}

/** Cartão do e-mail. `task` = null significa "Nova" (ainda sem tarefa gravada). */
function buildCard_(msg, task, ctx) {
  var status = task ? task.status : 'CRIADO';
  var card = CardService.newCardBuilder().setHeader(header_(task ? 'Tarefa #' + task.id : 'E-mail ainda sem tarefa'));

  // 1. Situação
  var info = CardService.newCardSection().addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Status')
      .setText('<b><font color="' + STATUS_COLOR[status] + '">' + STATUS_LABEL[status] + '</font></b>')
      .setBottomLabel(task ? 'Há ' + task.elapsed + ' · ' + task.responsible : 'Ainda não registrada')
      .setWrapText(true)
  );
  info.addWidget(CardService.newTextParagraph().setText('<b>' + esc_(task ? task.title : msg.subject) + '</b>'));
  if (task && task.execution) {
    info.addWidget(CardService.newTextParagraph().setText('<font color="#5f6368">Execução: ' + esc_(task.execution) + '</font>'));
  }
  if (task && task.overdue) {
    info.addWidget(CardService.newTextParagraph().setText('<font color="#d93025"><b>⏰ Prazo vencido</b></font>'));
  }
  card.addSection(info);

  // 2. Ações: só ícones, todos numa linha (o nome aparece ao passar o mouse).
  //    Status (Abrir, Play, Concluir, Cancelar) + Atribuir + Abrir app.
  var allowed = task ? task.allowed : ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'];
  var actions = CardService.newCardSection().setHeader('Ações');
  var icons = CardService.newButtonSet();
  ACTIONS.forEach(function (a) {
    if (allowed.indexOf(a.to) < 0) return;
    // Concluir abre um cartão para informar a data-hora inicial e a final.
    var action =
      a.to === 'CONCLUIDO'
        ? CardService.newAction().setFunctionName('onConcludeOpen').setParameters({ msg: JSON.stringify(msg), startedAt: (task && task.startedAt) || '' })
        : statusAction_(a.to, msg);
    icons.addButton(iconButton_(a.icon, a.label).setOnClickAction(action));
  });
  if (allowed.length) {
    icons.addButton(
      iconButton_('acao-atribuir.png', 'Atribuir a um usuário').setOnClickAction(
        CardService.newAction().setFunctionName('onAssignOpen').setParameters({ msg: JSON.stringify(msg) })
      )
    );
  }
  icons.addButton(
    iconButton_('acao-app.png', task ? 'Ver esta tarefa no app' : 'Abrir app de tarefas').setOpenLink(
      CardService.newOpenLink().setUrl(task ? task.url : appUrl_()).setOpenAs(CardService.OpenAs.FULL_SIZE)
    )
  );
  actions.addWidget(icons);
  if (allowed.length) {
    actions.addWidget(
      CardService.newTextInput().setFieldName('note').setTitle('Observação').setHint('Obrigatória para cancelar').setMultiline(true)
    );
  } else {
    actions.addWidget(CardService.newTextParagraph().setText('Tarefa encerrada. Somente um administrador pode reabri-la no app.'));
  }
  card.addSection(actions);

  // 3. Detalhes usados só na criação (primeiro clique)
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
  return card.build();
}

/** Botão só com ícone (PNG publicado pelo app); o texto aparece ao passar o mouse. */
function iconButton_(file, label) {
  return CardService.newImageButton().setIconUrl(appUrl_() + '/icones/' + file).setAltText(label);
}

/** "Atribuir": abre a lista de usuários cadastrados. */
function onAssignOpen(e) {
  var msg = JSON.parse(e.commonEventObject.parameters.msg);
  try {
    var ctx = api_('get', '/api/addon/context?messageId=' + encodeURIComponent(msg.gmailMessageId));
    var current = ctx.task ? ctx.task.responsibleId : null;
    var select = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle('Atribuir a')
      .setFieldName('assignTo');
    ctx.users.forEach(function (u) {
      select.addItem(u.name + ' (' + u.email + ')', u.id, u.id === current);
    });
    var section = CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('<b>' + esc_(ctx.task ? ctx.task.title : msg.subject) + '</b>'))
      .addWidget(select)
      .addWidget(CardService.newTextInput().setFieldName('assignNote').setTitle('Recado (opcional)').setMultiline(true))
      .addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText('Atribuir')
              .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
              .setOnClickAction(CardService.newAction().setFunctionName('onPanelAssign').setParameters({ msg: JSON.stringify(msg) }))
          )
          .addButton(CardService.newTextButton().setText('Voltar').setOnClickAction(CardService.newAction().setFunctionName('onBack')))
      );
    if (!ctx.task) {
      section.addWidget(CardService.newTextParagraph().setText('Este e-mail ainda não tem tarefa: ela será criada como <b>Aberta</b> para o usuário escolhido.'));
    }
    var card = CardService.newCardBuilder().setHeader(header_('Atribuir a um usuário')).addSection(section).build();
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
  } catch (err) {
    return notify_('Erro: ' + err.message);
  }
}

function onPanelAssign(e) {
  var msg = JSON.parse(e.commonEventObject.parameters.msg);
  var responsibleId = formValue_(e, 'assignTo');
  if (!responsibleId) return notify_('Escolha o usuário em "Atribuir a".');
  try {
    api_('post', '/api/addon/assign', { responsibleId: responsibleId, note: formValue_(e, 'assignNote'), email: msg, reopen: false });
    var ctx = api_('get', '/api/addon/context?messageId=' + encodeURIComponent(msg.gmailMessageId));
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popCard().updateCard(buildCard_(msg, ctx.task, ctx)))
      .setNotification(CardService.newNotification().setText('Tarefa atribuída a ' + (ctx.task ? ctx.task.responsible : 'usuário')))
      .build();
  } catch (err) {
    return notify_('Erro: ' + err.message);
  }
}

function onBack(e) {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().popCard()).build();
}

// Horário de Brasília (UTC−3, sem horário de verão) nos seletores de data-hora.
var BRASILIA_OFFSET_MIN = -180;

/** "Concluir": cartão com data-hora inicial e final (sugeridas, editáveis). */
function onConcludeOpen(e) {
  var params = e.commonEventObject.parameters;
  var msg = JSON.parse(params.msg);
  var now = Date.now();
  var started = params.startedAt ? new Date(params.startedAt).getTime() : now;
  // Campos do cartão principal (usados se a tarefa ainda não existe).
  var dueMs = formValue_(e, 'dueAt');
  var fields = {
    title: formValue_(e, 'title'),
    responsibleId: formValue_(e, 'responsibleId'),
    requesterEmail: formValue_(e, 'requesterEmail'),
    dueAt: dueMs ? new Date(Number(dueMs)).toISOString().slice(0, 10) : null,
  };
  var section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('<b>' + esc_(msg.subject) + '</b>'))
    .addWidget(
      CardService.newDateTimePicker()
        .setFieldName('startedAt')
        .setTitle('Data-hora inicial')
        .setValueInMsSinceEpoch(started)
        .setTimeZoneOffsetInMins(BRASILIA_OFFSET_MIN)
    )
    .addWidget(
      CardService.newDateTimePicker()
        .setFieldName('completedAt')
        .setTitle('Data-hora final')
        .setValueInMsSinceEpoch(now)
        .setTimeZoneOffsetInMins(BRASILIA_OFFSET_MIN)
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName('doneNote')
        .setTitle('Observação (opcional)')
        .setMultiline(true)
        .setValue(formValue_(e, 'note') || '')
    )
    .addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText('Concluir')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOnClickAction(
              CardService.newAction().setFunctionName('onConcludeConfirm').setParameters({ msg: params.msg, fields: JSON.stringify(fields) })
            )
        )
        .addButton(CardService.newTextButton().setText('Voltar').setOnClickAction(CardService.newAction().setFunctionName('onBack')))
    );
  var card = CardService.newCardBuilder().setHeader(header_('Concluir tarefa')).addSection(section).build();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
}

function onConcludeConfirm(e) {
  var params = e.commonEventObject.parameters;
  var msg = JSON.parse(params.msg);
  var fields = JSON.parse(params.fields || '{}');
  var startMs = formValue_(e, 'startedAt');
  var endMs = formValue_(e, 'completedAt');
  if (!startMs || !endMs) return notify_('Preencha a data-hora inicial e a final.');
  if (Number(startMs) > Number(endMs)) return notify_('O início não pode ser depois do fim.');
  try {
    var res = api_('post', '/api/addon/status', {
      to: 'CONCLUIDO',
      note: formValue_(e, 'doneNote'),
      title: fields.title,
      responsibleId: fields.responsibleId,
      requesterEmail: fields.requesterEmail,
      dueAt: fields.dueAt,
      startedAt: new Date(Number(startMs)).toISOString(),
      completedAt: new Date(Number(endMs)).toISOString(),
      email: msg,
    });
    var ctx = api_('get', '/api/addon/context?messageId=' + encodeURIComponent(msg.gmailMessageId));
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popCard().updateCard(buildCard_(msg, res.task, ctx)))
      .setNotification(CardService.newNotification().setText('Concluída' + (res.task && res.task.execution ? ': ' + res.task.execution : '')))
      .build();
  } catch (err) {
    return notify_('Erro: ' + err.message);
  }
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

function errorCard_(err) {
  return CardService.newCardBuilder()
    .setHeader(header_())
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText('Não foi possível carregar: ' + esc_(err.message))))
    .build();
}

// =====================================================================
// Janela de escrever: resumo + "Encaminhar e atribuir"
// =====================================================================

/** Destinatários do rascunho (disponíveis com draftAccess METADATA). */
function draftRecipients_(e) {
  var g = e.gmail || {};
  return [].concat(g.toRecipients || [], g.ccRecipients || []).map(function (r) { return extractEmail_(r); });
}

/**
 * Descobre o e-mail que está sendo encaminhado. Se o Gmail informar a
 * mensagem, lê direto; senão, usa o último e-mail aberto no painel
 * (`fromCache` = true: o usuário confere o assunto antes de atribuir).
 */
function composeContext_(e) {
  var g = e.gmail || {};
  var ctx = { email: null, messageId: g.messageId || null, threadId: g.threadId || null, fromCache: false };
  if (g.messageId && g.accessToken) {
    try {
      ctx.email = readMessage_(e);
    } catch (err) {
      console.log('Tarefas ADEMP: não foi possível ler a mensagem na janela de escrever: ' + err.message);
    }
  }
  if (!ctx.email && !ctx.messageId && !ctx.threadId) {
    var last = lastMessage_();
    if (last) {
      ctx.email = last;
      ctx.messageId = last.gmailMessageId;
      ctx.threadId = last.threadId;
      ctx.fromCache = true;
    }
  }
  return ctx;
}

function onComposeAction(e) {
  // Diagnóstico: quais campos o Gmail enviou (sem conteúdo do e-mail).
  console.log(
    'Tarefas ADEMP compose: ' +
      JSON.stringify({ gmailKeys: Object.keys(e.gmail || {}), hasMessageId: !!(e.gmail && e.gmail.messageId), hasThreadId: !!(e.gmail && e.gmail.threadId) })
  );

  var card = CardService.newCardBuilder().setHeader(header_('Suas tarefas'));
  var summary = CardService.newCardSection();
  var s = null;
  try {
    s = api_('get', '/api/addon/summary');
    summary.addWidget(
      CardService.newTextParagraph().setText(
        'Novas: <b>' + s.counts.CRIADO + '</b> · Abertas: <b>' + s.counts.ABERTA + '</b><br>' +
          'Em andamento: <b>' + s.counts.EM_ANDAMENTO + '</b> · Vencidas: <b><font color="#d93025">' + s.counts.overdue + '</font></b>'
      )
    );
  } catch (err) {
    summary.addWidget(CardService.newTextParagraph().setText('Não foi possível carregar o resumo: ' + esc_(err.message)));
  }
  summary.addWidget(linkButton_('Abrir app de tarefas', appUrl_(), false));
  card.addSection(summary);

  // Encaminhar e atribuir
  var fwd = CardService.newCardSection().setHeader('Encaminhar e atribuir');
  var ctx = composeContext_(e);
  if (!s || (!ctx.messageId && !ctx.threadId)) {
    fwd.addWidget(
      CardService.newTextParagraph().setText(
        'Não identifiquei o e-mail. Abra o e-mail com o painel do <b>Tarefas ADEMP</b> aberto (barra da direita), ' +
          'clique em <b>Encaminhar</b> e depois neste ícone.'
      )
    );
  } else {
    var to = draftRecipients_(e);
    var picked = null;
    s.users.forEach(function (u) {
      if (!picked && to.indexOf(String(u.email).toLowerCase()) >= 0) picked = u.id;
    });
    var select = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle('Atribuir a')
      .setFieldName('assignTo');
    s.users.forEach(function (u) {
      select.addItem(u.name + ' (' + u.email + ')', u.id, u.id === picked);
    });
    if (ctx.email) {
      fwd.addWidget(CardService.newTextParagraph().setText('E-mail: <b>' + esc_(ctx.email.subject) + '</b>'));
      if (ctx.fromCache) {
        fwd.addWidget(CardService.newTextParagraph().setText('<font color="#5f6368">Confira se é este o e-mail que está encaminhando.</font>'));
      }
    }
    fwd.addWidget(select);
    fwd.addWidget(CardService.newTextInput().setFieldName('assignNote').setTitle('Recado para o colega (opcional)').setMultiline(true));
    fwd.addWidget(
      CardService.newTextButton()
        .setText('Atribuir tarefa')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction().setFunctionName('onForwardAssign').setParameters({
            email: ctx.email ? JSON.stringify(ctx.email) : '',
            messageId: ctx.messageId || '',
            threadId: ctx.threadId || '',
          })
        )
    );
    fwd.addWidget(CardService.newTextParagraph().setText('A tarefa passa para o colega com status <b>Aberta</b>. Depois é só enviar o e-mail.'));
  }
  card.addSection(fwd);
  return [card.build()];
}

function onForwardAssign(e) {
  var p = e.commonEventObject.parameters || {};
  var responsibleId = formValue_(e, 'assignTo');
  if (!responsibleId) return notify_('Escolha o colega em "Atribuir a".');
  try {
    var res = api_('post', '/api/addon/assign', {
      responsibleId: responsibleId,
      note: formValue_(e, 'assignNote'),
      email: p.email ? JSON.parse(p.email) : null,
      messageId: p.messageId || null,
      threadId: p.threadId || null,
    });
    return notify_('Tarefa #' + res.taskId + ' atribuída (Aberta). Agora é só enviar o e-mail.');
  } catch (err) {
    return notify_('Erro: ' + err.message);
  }
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
