/*
 * Funções puras para ler informações da página do Gmail.
 * Usadas pelo content.js e pelos testes automáticos (tests/extensao.test.ts).
 */
(function (root) {
  var MONTHS_PT = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
  var MONTHS_EN = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  /** E-mail da conta aberta, a partir do título da aba: "Caixa de entrada (7) - fulano@ademp.org.br - ADEMP Mail". */
  function mailboxFromTitle(title) {
    if (!title) return null;
    var m = /\s-\s([^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+)\s-\s[^@]*$/.exec(title);
    if (m) return m[1].toLowerCase();
    var any = title.match(/[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g);
    return any ? any[any.length - 1].toLowerCase() : null;
  }

  /**
   * Converte a data mostrada pelo Gmail (atributo title de span.g3) em Date.
   * Aceita, por exemplo: "qua., 10 de jun. de 2026, 10:49", "21 de out. de 2026 21:01",
   * "10 de jun., 10:49" (ano atual) e "Wed, Jun 10, 2026, 10:49 AM".
   * Devolve null se não reconhecer o formato.
   */
  function parseGmailDate(text, now) {
    if (!text) return null;
    now = now || new Date();
    var s = String(text).toLowerCase().replace(/ | /g, ' ');
    var pt = /(\d{1,2}) de ([a-zç]{3})[a-zç]*\.?(?: de (\d{4}))?,? (\d{1,2}):(\d{2})/.exec(s);
    if (pt && MONTHS_PT[pt[2]] !== undefined) {
      var y = pt[3] ? Number(pt[3]) : now.getFullYear();
      return new Date(y, MONTHS_PT[pt[2]], Number(pt[1]), Number(pt[4]), Number(pt[5]));
    }
    var en = /([a-z]{3})[a-z]* (\d{1,2})(?:, (\d{4}))?,? (\d{1,2}):(\d{2})\s?(am|pm)?/.exec(s);
    if (en && MONTHS_EN[en[1]] !== undefined) {
      var h = Number(en[4]);
      if (en[6] === 'pm' && h < 12) h += 12;
      if (en[6] === 'am' && h === 12) h = 0;
      var yy = en[3] ? Number(en[3]) : now.getFullYear();
      return new Date(yy, MONTHS_EN[en[1]], Number(en[2]), h, Number(en[5]));
    }
    return null;
  }

  var api = { mailboxFromTitle: mailboxFromTitle, parseGmailDate: parseGmailDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TarefasDom = api;
})(typeof self !== 'undefined' ? self : this);
