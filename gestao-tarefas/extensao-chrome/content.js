/*
 * Tarefas ADEMP — botões dentro do e-mail no Gmail.
 *
 * Ao abrir um e-mail, insere no topo da mensagem uma barra discreta, no
 * estilo dos ícones do Gmail, com o status da tarefa e as ações:
 * Abrir tarefa / Play / Pause / Concluir / Cancelar / Atribuir /
 * Concluir etapa e atribuir / Ver no app, e o tempo trabalhado em tempo real.
 * Todo e-mail começa como "Nova"; a tarefa só é gravada no primeiro clique.
 *
 * A leitura do Gmail usa classes e atributos da página (h2.hP, div.adn, div.gs,
 * data-legacy-message-id, span.gD, span.g2, span.g3). Se o Google mudar o
 * Gmail e a barra sumir, o painel lateral oficial continua funcionando.
 */
(function () {
  'use strict';

  var BAR_ID = 'tarefas-ademp-bar';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var STATUS_LABEL = { CRIADO: 'Nova', ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', PAUSADA: 'Pausada', CONCLUIDO: 'Concluída', CANCELADO: 'Cancelada' };

  // Ícones Material (24×24), os mesmos usados pelo Gmail.
  var ICON = {
    addTask: 'M22 5.18 10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8c1.57 0 3.04.46 4.28 1.25l1.45-1.45A10.02 10.02 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.73 0 3.36-.44 4.78-1.22l-1.5-1.5c-1 .46-2.11.72-3.28.72zm7-5h-3v2h3v3h2v-3h3v-2h-3v-3h-2v3z',
    play: 'M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
    done: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z',
    cancel: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z',
    open: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    refresh: 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    login: 'M11 7 9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z',
    assign: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    pause: 'M9 16h2V8H9v8zm3-14C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-4h2V8h-2v8z',
    // "Concluir etapa e atribuir": pessoa com seta (passar adiante).
    stage: 'M9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm0 2c-2.34 0-7 1.17-7 3.5V19h11v-1.5c0-2.33-4.66-3.5-7-3.5zm9-6-1.41 1.41L18.17 11H13v2h5.17l-1.58 1.59L18 16l4-4-4-4z',
    timer: 'M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0 0 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
  };

  var usersCache = null; // lista de usuários cadastrados (carregada uma vez)

  var ACTIONS = [
    { to: 'ABERTA', icon: 'addTask', tip: 'Abrir tarefa', cls: 'act-open' },
    { to: 'EM_ANDAMENTO', icon: 'play', tip: 'Play — iniciar', cls: 'act-play' },
    { to: 'PAUSADA', icon: 'pause', tip: 'Pause — pausar a contagem', cls: 'act-pause' },
    { to: 'CONCLUIDO', icon: 'done', tip: 'Concluir', cls: 'act-done' },
    { to: 'CANCELADO', icon: 'cancel', tip: 'Cancelar', cls: 'act-cancel' },
  ];
  var ALL = ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'];

  var current = null; // { key, info, state }
  var pending = 0;

  function visible(el) {
    return !!(el && el.offsetParent !== null);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'onclick') node.addEventListener('click', attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function svg(name) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', ICON[name]);
    s.appendChild(p);
    return s;
  }

  /** Botão redondo só com ícone, com dica ao passar o mouse (como na barra do Gmail). */
  function iconButton(icon, tip, cls, onclick) {
    return el('button', { type: 'button', class: 'ta-icon ' + (cls || ''), 'data-tip': tip, 'aria-label': tip, onclick: onclick }, [svg(icon)]);
  }

  function send(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (res) {
          if (chrome.runtime.lastError) resolve({ ok: false, status: 0, data: { error: chrome.runtime.lastError.message } });
          else resolve(res || { ok: false, status: 0, data: { error: 'Sem resposta' } });
        });
      } catch (e) {
        // Extensão atualizada/recarregada: a página precisa ser recarregada.
        resolve({ ok: false, status: 0, data: { error: 'Atualize a página do Gmail (F5).' } });
      }
    });
  }

  /** Lê a mensagem aberta. Em conversas com várias mensagens, usa a mais recente visível. */
  function readOpenMessage() {
    var subjectEl = Array.prototype.find.call(document.querySelectorAll('h2.hP'), visible);
    if (!subjectEl) return null;
    var msgs = Array.prototype.filter.call(document.querySelectorAll('div.adn[data-legacy-message-id], div[data-legacy-message-id]'), visible);
    if (!msgs.length) return null;
    var msgEl = msgs[msgs.length - 1];
    var id = msgEl.getAttribute('data-legacy-message-id');
    if (!id) return null;

    var mailbox = TarefasDom.mailboxFromTitle(document.title);
    var senderEl = msgEl.querySelector('span.gD[email]');
    var senderEmail = senderEl ? senderEl.getAttribute('email') : '';
    var senderName = senderEl ? senderEl.getAttribute('name') || senderEl.textContent : '';
    var recipients = Array.prototype.map.call(msgEl.querySelectorAll('span.g2[email]'), function (s) {
      return s.getAttribute('email');
    });
    var dateEl = msgEl.querySelector('span.g3');
    var date = TarefasDom.parseGmailDate(dateEl ? dateEl.getAttribute('title') || dateEl.textContent : '');

    return {
      subjectEl: subjectEl,
      msgEl: msgEl,
      mailbox: mailbox,
      email: {
        gmailMessageId: id,
        threadId: subjectEl.getAttribute('data-legacy-thread-id') || null,
        subject: (subjectEl.textContent || '').trim() || '(sem assunto)',
        sender: senderName && senderEmail ? senderName + ' <' + senderEmail + '>' : senderEmail,
        recipients: recipients,
        emailDate: date ? date.toISOString() : null,
        direction: mailbox && senderEmail && senderEmail.toLowerCase() === mailbox ? 'ENVIADO' : 'RECEBIDO',
      },
    };
  }

  /**
   * Onde a barra entra: no topo da coluna principal da mensagem (div.gs),
   * que ocupa a largura toda. Sem ela, no topo do próprio cartão.
   */
  function anchorFor(msgEl) {
    return msgEl.querySelector('div.gs') || msgEl;
  }

  function ensureBar(msgEl) {
    var anchor = anchorFor(msgEl);
    var bar = document.getElementById(BAR_ID);
    if (!bar) bar = el('div', { id: BAR_ID, role: 'toolbar', 'aria-label': 'Tarefas ADEMP' });
    if (bar.parentElement !== anchor || anchor.firstElementChild !== bar) anchor.insertAdjacentElement('afterbegin', bar);
    return bar;
  }

  function barInPlace(msgEl) {
    var anchor = anchorFor(msgEl);
    var bar = document.getElementById(BAR_ID);
    return !!(bar && bar.isConnected && bar.parentElement === anchor && anchor.firstElementChild === bar);
  }

  function divider() {
    return el('span', { class: 'ta-sep', 'aria-hidden': 'true' });
  }

  /**
   * Depois que a extensão é atualizada, a cópia antiga deste script continua na
   * aba aberta, mas sem acesso à extensão. Ela então se desliga para não
   * apagar a barra desenhada pela versão nova.
   */
  function alive() {
    try {
      if (chrome.runtime && chrome.runtime.id) return true;
    } catch (e) {
      // contexto da extensão invalidado
    }
    observer.disconnect();
    clearInterval(clockTimer);
    window.removeEventListener('hashchange', schedule);
    clearTimeout(pending);
    current = null;
    return false;
  }

  function render(state) {
    if (!current || !alive()) return;
    var bar = ensureBar(current.info.msgEl);
    bar.textContent = '';
    bar.appendChild(
      el('span', { class: 'ta-brand', title: 'Tarefas ADEMP' }, [el('img', { src: chrome.runtime.getURL('icons/48.png'), alt: 'Tarefas ADEMP' })]),
    );

    if (state.loading) {
      bar.appendChild(el('span', { class: 'ta-muted', text: 'Carregando…' }));
      return;
    }
    var res = state.res;
    if (!res.ok) {
      var data = res.data || {};
      bar.appendChild(el('span', { class: 'ta-error', text: data.error || 'Sem conexão com o app de tarefas' }));
      if (data.code === 'LOGIN_REQUIRED' || data.code === 'MAILBOX_MISMATCH') {
        bar.appendChild(iconButton('login', 'Entrar no app de tarefas', 'act-next', function () {
          send({ type: 'open', url: data.loginUrl });
        }));
      }
      bar.appendChild(iconButton('refresh', 'Tentar de novo', '', refresh));
      return;
    }

    var task = res.data.task;
    var status = task ? task.status : 'CRIADO';
    bar.appendChild(el('span', { class: 'ta-chip ta-' + status, text: (task && task.statusLabel) || STATUS_LABEL[status] || status }));
    bar.appendChild(responsibleChip(task));
    if (task) {
      bar.appendChild(el('span', { class: 'ta-muted', text: task.elapsed, title: 'Tempo decorrido desde a chegada do e-mail' }));
      var clock = workedClock(task);
      if (clock) bar.appendChild(clock);
      if (task.overdue) bar.appendChild(el('span', { class: 'ta-late', text: 'Vencida' }));
    }

    var allowed = task ? task.allowed : ALL;
    if (allowed.length) {
      bar.appendChild(divider());
      var next = allowed[0]; // próxima ação do fluxo: destaque sutil
      ACTIONS.forEach(function (a) {
        if (allowed.indexOf(a.to) < 0) return;
        var tip = a.to === 'EM_ANDAMENTO' && status === 'PAUSADA' ? 'Play — retomar' : a.tip;
        var btn = iconButton(a.icon, tip, a.cls + (a.to === next && a.to !== 'CANCELADO' ? ' act-next' : ''), function (ev) {
          if (a.to === 'CONCLUIDO') {
            ev.stopPropagation();
            toggleDoneDialog(btn, task ? task.startedAt : null);
          } else {
            act(a.to);
          }
        });
        bar.appendChild(btn);
      });
    }

    bar.appendChild(divider());
    if (allowed.length) {
      var assignBtn = iconButton('assign', 'Atribuir a um usuário', 'act-assign', function (ev) {
        ev.stopPropagation();
        toggleAssignMenu(assignBtn, task ? task.responsibleId : null, false);
      });
      bar.appendChild(assignBtn);
      var stageBtn = iconButton('stage', 'Concluir minha etapa e atribuir', 'act-stage', function (ev) {
        ev.stopPropagation();
        toggleAssignMenu(stageBtn, task ? task.responsibleId : null, true);
      });
      bar.appendChild(stageBtn);
    }
    bar.appendChild(iconButton('open', task ? 'Ver tarefa no app' : 'Abrir app de tarefas', '', function () {
      send({ type: 'open', url: task ? task.url : res.data.appUrl });
    }));
  }

  /**
   * Quem é o responsável pelo e-mail (tarefa): inicial + nome, sempre visível.
   * Mesmo destaque do app e do complemento.
   */
  function responsibleChip(task) {
    if (!task) {
      return el('span', { class: 'ta-resp empty', title: 'Este e-mail ainda não virou tarefa' }, [
        el('span', { class: 'ta-resp-label', text: 'Responsável:' }),
        el('span', { text: 'ninguém ainda' }),
      ]);
    }
    var name = task.responsible || '';
    return el('span', { class: 'ta-resp', title: 'Responsável: ' + name + (task.responsibleEmail ? ' <' + task.responsibleEmail + '>' : '') }, [
      el('span', { class: 'ta-avatar-sm', text: name.trim().charAt(0).toUpperCase() || '?' }),
      el('span', { class: 'ta-resp-label', text: 'Responsável:' }),
      el('span', { class: 'ta-resp-name', text: name }),
    ]);
  }

  // --- Atribuir --------------------------------------------------------------

  function closeAssignMenu() {
    var m = document.getElementById('tarefas-ademp-menu');
    if (m) m.remove();
    var b = document.querySelector('#' + BAR_ID + ' .act-assign');
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  /**
   * Abre a lista de usuários cadastrados logo abaixo do botão. Com "stage"
   * ("Concluir minha etapa e atribuir"), registra a etapa de quem sai.
   * Nos dois casos o tempo trabalhado até aqui fica com quem sai.
   */
  function toggleAssignMenu(anchorBtn, currentId, stage) {
    if (document.getElementById('tarefas-ademp-menu')) {
      closeAssignMenu();
      return;
    }
    closeDoneDialog();
    var title = stage ? 'Concluir minha etapa e passar para' : 'Atribuir a';
    var menu = el('div', { id: 'tarefas-ademp-menu', role: 'menu', 'aria-label': title });
    menu.appendChild(el('div', { class: 'ta-menu-title', text: title }));
    var list = el('div', { class: 'ta-menu-list' }, [el('div', { class: 'ta-menu-empty', text: 'Carregando…' })]);
    menu.appendChild(list);
    var r = anchorBtn.getBoundingClientRect();
    menu.style.top = r.bottom + 6 + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 300)) + 'px';
    document.body.appendChild(menu);
    anchorBtn.setAttribute('aria-expanded', 'true');

    loadUsers().then(function (res) {
      list.textContent = '';
      if (!res.ok) {
        list.appendChild(el('div', { class: 'ta-menu-empty', text: (res.data && res.data.error) || 'Não foi possível carregar os usuários' }));
        return;
      }
      res.users.forEach(function (u) {
        var isCurrent = u.id === currentId;
        list.appendChild(
          el(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              class: 'ta-menu-item' + (isCurrent ? ' current' : ''),
              onclick: function () {
                closeAssignMenu();
                if (!isCurrent) assign(u, stage);
              },
            },
            [
              el('span', { class: 'ta-avatar', text: (u.name || u.email).trim().charAt(0).toUpperCase() }),
              el('span', { class: 'ta-menu-text' }, [el('span', { class: 'ta-menu-name', text: u.name }), el('span', { class: 'ta-menu-mail', text: u.email })]),
              isCurrent ? el('span', { class: 'ta-menu-check', text: '✓' }) : null,
            ],
          ),
        );
      });
    });
  }

  function loadUsers() {
    if (usersCache) return Promise.resolve({ ok: true, users: usersCache });
    return send({ type: 'users', mailbox: current ? current.info.mailbox : '' }).then(function (res) {
      if (res.ok && res.data && res.data.users) {
        usersCache = res.data.users;
        return { ok: true, users: usersCache };
      }
      return { ok: false, data: res.data };
    });
  }

  function assign(user, stage) {
    if (!current) return;
    var info = current.info;
    var key = current.key;
    render({ loading: true });
    var body = { responsibleId: user.id, mailbox: info.mailbox, email: info.email, stage: !!stage };
    send({ type: 'assign', body: body }).then(function (res) {
      if (!current || current.key !== key) return;
      var ok = stage ? 'Etapa concluída. Tarefa passada para ' + user.name : 'Tarefa atribuída a ' + user.name;
      toast(res.ok ? ok : (res.data && res.data.error) || 'Erro ao atribuir');
      refresh();
    });
  }

  // --- Tempo trabalhado em tempo real -------------------------------------------

  var clockTimer = null;

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** "1h 05min" (parado) ou "01:05:12" (correndo). */
  function formatWorked(ms, running) {
    var s = Math.floor(Math.max(0, ms) / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (running) return pad2(h) + ':' + pad2(m) + ':' + pad2(s % 60);
    return h ? h + 'h ' + pad2(m) + 'min' : m + 'min';
  }

  /**
   * Relógio do tempo efetivamente trabalhado (Play → Pause). Com a tarefa em
   * andamento, avança a cada segundo; pausada, mostra o total parado.
   */
  function workedClock(task) {
    clearInterval(clockTimer);
    var closed = task.workedClosedMs || 0;
    var since = task.runningSince ? Date.parse(task.runningSince) : null;
    if (!since && !closed) return null;
    var label = el('span', { class: 'ta-clock-text' });
    var node = el('span', { class: 'ta-clock' + (since ? ' running' : ''), title: since ? 'Tempo trabalhado (contando)' : 'Tempo trabalhado (pausado)' }, [
      svg('timer'),
      label,
    ]);
    var tick = function () {
      label.textContent = formatWorked(closed + (since ? Date.now() - since : 0), !!since);
    };
    tick();
    if (since) clockTimer = setInterval(tick, 1000);
    return node;
  }

  // --- Concluir: data-hora inicial e final -------------------------------------

  var DONE_ID = 'tarefas-ademp-done';

  /** Date -> "YYYY-MM-DDTHH:mm" no horário do computador (valor do <input type="datetime-local">). */
  function toLocalInput(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function closeDoneDialog() {
    var d = document.getElementById(DONE_ID);
    if (d) d.remove();
  }

  /**
   * Abre, abaixo do botão "Concluir", o quadro com início e fim da execução.
   * Sugestão: início = quando a tarefa foi iniciada (Play) ou agora; fim = agora.
   */
  function toggleDoneDialog(anchorBtn, startedAt) {
    if (document.getElementById(DONE_ID)) {
      closeDoneDialog();
      return;
    }
    closeAssignMenu();
    var now = toLocalInput(new Date());
    var start = el('input', { type: 'datetime-local', id: 'ta-done-start', required: 'required', max: now });
    start.value = startedAt ? toLocalInput(new Date(startedAt)) : now;
    var end = el('input', { type: 'datetime-local', id: 'ta-done-end', required: 'required', max: now });
    end.value = now;
    var note = el('textarea', { id: 'ta-done-note', rows: '2', maxlength: '5000', placeholder: 'Observação (opcional)' });
    var error = el('div', { class: 'ta-done-error', role: 'alert' });

    var form = el('form', { id: DONE_ID, 'aria-label': 'Concluir tarefa' }, [
      el('div', { class: 'ta-menu-title', text: 'Concluir tarefa' }),
      el('label', { for: 'ta-done-start', text: 'Data-hora inicial' }),
      start,
      el('label', { for: 'ta-done-end', text: 'Data-hora final' }),
      end,
      note,
      error,
      el('div', { class: 'ta-done-actions' }, [
        el('button', { type: 'button', class: 'ta-btn-text', text: 'Voltar', onclick: closeDoneDialog }),
        el('button', { type: 'submit', class: 'ta-btn-done', text: 'Concluir' }),
      ]),
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!start.value || !end.value) {
        error.textContent = 'Preencha a data-hora inicial e a final.';
        return;
      }
      if (start.value > end.value) {
        error.textContent = 'O início não pode ser depois do fim.';
        return;
      }
      closeDoneDialog();
      act('CONCLUIDO', {
        note: note.value.trim() || null,
        startedAt: new Date(start.value).toISOString(),
        completedAt: new Date(end.value).toISOString(),
      });
    });

    var r = anchorBtn.getBoundingClientRect();
    form.style.top = r.bottom + 6 + 'px';
    form.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 300)) + 'px';
    document.body.appendChild(form);
    start.focus();
  }

  document.addEventListener('click', function (e) {
    var m = document.getElementById('tarefas-ademp-menu');
    if (m && !m.contains(e.target)) closeAssignMenu();
    var d = document.getElementById(DONE_ID);
    if (d && !d.contains(e.target)) closeDoneDialog();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAssignMenu();
      closeDoneDialog();
    }
  });

  /** Muda o status. `extra` (só em Concluir): { note, startedAt, completedAt }. */
  function act(to, extra) {
    if (!current) return;
    var note = extra ? extra.note : null;
    if (to === 'CANCELADO') {
      note = window.prompt('Motivo do cancelamento:');
      if (!note || !note.trim()) return;
    }
    var info = current.info;
    var key = current.key;
    var body = { to: to, note: note, mailbox: info.mailbox, email: info.email };
    if (extra) {
      body.startedAt = extra.startedAt;
      body.completedAt = extra.completedAt;
    }
    render({ loading: true });
    send({ type: 'status', body: body }).then(function (res) {
      if (!current || current.key !== key) return;
      if (res.ok) toast('Status: ' + STATUS_LABEL[to]);
      else toast(res.data && res.data.error ? res.data.error : 'Erro ao mudar o status');
      // Recarrega o estado (em caso de erro, mostra o status real).
      refresh();
    });
  }

  function refresh() {
    if (!current) return;
    var key = current.key;
    var info = current.info;
    render({ loading: true });
    send({ type: 'context', messageId: info.email.gmailMessageId, mailbox: info.mailbox }).then(function (res) {
      if (!current || current.key !== key) return;
      current.state = { res: res };
      render(current.state);
    });
  }

  var toastTimer = null;
  function toast(text) {
    var t = document.getElementById('tarefas-ademp-toast');
    if (!t) {
      t = el('div', { id: 'tarefas-ademp-toast', role: 'status' });
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
    }, 3500);
  }

  /** Verifica se o e-mail aberto mudou; se sim, carrega o status. */
  function scan() {
    if (!alive()) return;
    var info = readOpenMessage();
    if (!info) {
      current = null;
      clearInterval(clockTimer);
      var old = document.getElementById(BAR_ID);
      if (old) old.remove();
      return;
    }
    var key = info.email.gmailMessageId;
    if (current && current.key === key) {
      current.info.subjectEl = info.subjectEl;
      current.info.msgEl = info.msgEl;
      // O Gmail pode ter recriado o cartão: garante que a barra continua lá.
      if (!barInPlace(info.msgEl)) render(current.state || { loading: true });
      return;
    }
    current = { key: key, info: info, state: null };
    refresh();
  }

  function schedule() {
    clearTimeout(pending);
    pending = setTimeout(scan, 250);
  }

  var observer = new MutationObserver(function (mutations) {
    // Ignora mudanças feitas pela própria barra.
    for (var i = 0; i < mutations.length; i++) {
      var t = mutations[i].target;
      if (!(t && t.closest && t.closest('#' + BAR_ID + ', #tarefas-ademp-toast, #tarefas-ademp-menu, #' + DONE_ID))) {
        schedule();
        return;
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  schedule();

  // Mantém responsável e status atualizados se outra pessoa mexer na tarefa
  // com o e-mail aberto: confere a cada minuto, sem piscar a barra e sem
  // atrapalhar menus abertos.
  var watchTimer = setInterval(function () {
    if (!alive()) {
      clearInterval(watchTimer);
      return;
    }
    if (!current || document.visibilityState !== 'visible') return;
    if (document.getElementById('tarefas-ademp-menu') || document.getElementById(DONE_ID)) return;
    var key = current.key;
    var info = current.info;
    send({ type: 'context', messageId: info.email.gmailMessageId, mailbox: info.mailbox }).then(function (res) {
      if (!current || current.key !== key || !res.ok) return;
      if (document.getElementById('tarefas-ademp-menu') || document.getElementById(DONE_ID)) return;
      var before = JSON.stringify(current.state && current.state.res && current.state.res.data && current.state.res.data.task);
      var after = JSON.stringify(res.data && res.data.task);
      current.state = { res: res };
      if (before !== after) render(current.state);
    });
  }, 60000);
})();
