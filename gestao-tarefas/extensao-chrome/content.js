/*
 * Tarefas ADEMP — botões dentro do e-mail no Gmail.
 *
 * Ao abrir um e-mail, insere logo abaixo do assunto uma barra com o status da
 * tarefa e os botões Abrir tarefa / Play / Concluir / Cancelar. Todo e-mail
 * começa como "Nova"; a tarefa só é gravada no primeiro clique.
 *
 * A leitura do Gmail usa classes e atributos da página (h2.hP, div.adn,
 * data-legacy-message-id, span.gD, span.g2, span.g3). Se o Google mudar o
 * Gmail e a barra sumir, o painel lateral oficial continua funcionando.
 */
(function () {
  'use strict';

  var BAR_ID = 'tarefas-ademp-bar';
  var STATUS_LABEL = { CRIADO: 'Nova', ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluída', CANCELADO: 'Cancelada' };
  var ACTIONS = [
    { to: 'ABERTA', text: 'Abrir tarefa', icon: '📂', cls: 'primary' },
    { to: 'EM_ANDAMENTO', text: 'Play', icon: '▶', cls: 'primary' },
    { to: 'CONCLUIDO', text: 'Concluir', icon: '✔', cls: 'success' },
    { to: 'CANCELADO', text: 'Cancelar', icon: '✖', cls: 'danger' },
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

  function ensureBar(subjectEl) {
    var anchor = subjectEl.closest('.ha') || subjectEl.parentElement;
    var bar = document.getElementById(BAR_ID);
    if (!bar) bar = el('div', { id: BAR_ID });
    if (bar.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', bar);
    return bar;
  }

  function render(state) {
    if (!current) return;
    var bar = ensureBar(current.info.subjectEl);
    bar.textContent = '';
    bar.appendChild(el('span', { class: 'ta-brand', text: '✓ Tarefas' }));

    if (state.loading) {
      bar.appendChild(el('span', { class: 'ta-muted', text: 'carregando…' }));
      return;
    }
    var res = state.res;
    if (!res.ok) {
      var data = res.data || {};
      bar.appendChild(el('span', { class: 'ta-error', text: data.error || 'Não foi possível falar com o app de tarefas.' }));
      if (data.code === 'LOGIN_REQUIRED' || data.code === 'MAILBOX_MISMATCH') {
        bar.appendChild(
          el('button', {
            class: 'ta-btn primary',
            text: 'Entrar no app de tarefas',
            onclick: function () {
              send({ type: 'open', url: data.loginUrl });
            },
          }),
        );
      }
      bar.appendChild(el('button', { class: 'ta-btn text', text: 'Tentar de novo', onclick: refresh }));
      return;
    }

    var task = res.data.task;
    var status = task ? task.status : 'CRIADO';
    bar.appendChild(el('span', { class: 'ta-chip ta-' + status, text: STATUS_LABEL[status] }));
    if (task) {
      bar.appendChild(el('span', { class: 'ta-muted', text: 'há ' + task.elapsed + ' · ' + task.responsible }));
      if (task.overdue) bar.appendChild(el('span', { class: 'ta-late', text: '⏰ Prazo vencido' }));
    }

    var allowed = task ? task.allowed : ALL;
    ACTIONS.forEach(function (a) {
      if (allowed.indexOf(a.to) < 0) return;
      bar.appendChild(
        el('button', { class: 'ta-btn ' + a.cls, title: STATUS_LABEL[a.to], onclick: function () { act(a.to); } }, [
          el('span', { class: 'ta-ic', text: a.icon }),
          document.createTextNode(' ' + a.text),
        ]),
      );
    });
    if (!allowed.length) bar.appendChild(el('span', { class: 'ta-muted', text: 'Tarefa encerrada' }));

    bar.appendChild(
      el('button', {
        class: 'ta-btn text',
        text: task ? 'Ver tarefa ↗' : 'Abrir app ↗',
        onclick: function () {
          send({ type: 'open', url: task ? task.url : res.data.appUrl });
        },
      }),
    );
  }

  function act(to) {
    if (!current) return;
    var note = null;
    if (to === 'CANCELADO') {
      note = window.prompt('Motivo do cancelamento:');
      if (!note || !note.trim()) return;
    }
    var info = current.info;
    var key = current.key;
    render({ loading: true });
    send({ type: 'status', body: { to: to, note: note, mailbox: info.mailbox, email: info.email } }).then(function (res) {
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
      t = el('div', { id: 'tarefas-ademp-toast' });
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
    var info = readOpenMessage();
    if (!info) {
      current = null;
      var old = document.getElementById(BAR_ID);
      if (old) old.remove();
      return;
    }
    var key = info.email.gmailMessageId;
    if (current && current.key === key) {
      current.info.subjectEl = info.subjectEl;
      // O Gmail pode ter recriado o cabeçalho: garante que a barra continua lá.
      var bar = document.getElementById(BAR_ID);
      if (!bar || !bar.isConnected || bar.previousElementSibling !== (info.subjectEl.closest('.ha') || info.subjectEl.parentElement)) {
        render(current.state || { loading: true });
      }
      return;
    }
    current = { key: key, info: info, state: null };
    refresh();
  }

  function schedule() {
    clearTimeout(pending);
    pending = setTimeout(scan, 250);
  }

  new MutationObserver(function (mutations) {
    // Ignora mudanças feitas pela própria barra.
    for (var i = 0; i < mutations.length; i++) {
      var t = mutations[i].target;
      if (!(t && t.closest && t.closest('#' + BAR_ID + ', #tarefas-ademp-toast'))) {
        schedule();
        return;
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  schedule();
})();
