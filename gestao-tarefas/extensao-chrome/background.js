/*
 * Service worker da extensão: faz as chamadas à API do app de tarefas.
 * O content script (dentro do Gmail) não pode chamar outro site diretamente;
 * por isso pede para este arquivo, que usa o login do app (cookie de sessão).
 */
const APP_URL = 'https://gestao-tarefas-1014439328942.southamerica-east1.run.app';

async function call(method, path, body) {
  const headers = { 'X-Tarefas-Ext': '1' };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(APP_URL + path, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    data = { error: 'Resposta inválida do servidor (' + res.status + ')' };
  }
  return { ok: res.ok, status: res.status, data };
}

async function handle(msg) {
  if (msg.type === 'context') {
    const q = new URLSearchParams({ messageId: msg.messageId, mailbox: msg.mailbox || '' });
    return call('GET', '/api/ext/context?' + q.toString());
  }
  if (msg.type === 'status') return call('POST', '/api/ext/status', msg.body);
  if (msg.type === 'users') return call('GET', '/api/ext/users?' + new URLSearchParams({ mailbox: msg.mailbox || '' }).toString());
  if (msg.type === 'assign') return call('POST', '/api/ext/assign', msg.body);
  if (msg.type === 'open') {
    // Só abre endereços do próprio app.
    const url = typeof msg.url === 'string' && msg.url.startsWith(APP_URL) ? msg.url : APP_URL;
    await chrome.tabs.create({ url });
    return { ok: true };
  }
  return { ok: false, status: 400, data: { error: 'Mensagem desconhecida' } };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Só aceita mensagens vindas do content script desta extensão.
  if (sender.id !== chrome.runtime.id) return false;
  handle(msg).then(sendResponse, (e) =>
    sendResponse({ ok: false, status: 0, data: { error: 'Sem conexão com o app de tarefas: ' + (e && e.message ? e.message : e) } }),
  );
  return true; // resposta assíncrona
});

// Clique no ícone da extensão: abre o app.
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: APP_URL }));
