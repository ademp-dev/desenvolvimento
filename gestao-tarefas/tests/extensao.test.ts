import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const dom = require("../extensao-chrome/gmail-dom.js") as {
  mailboxFromTitle(title: string): string | null;
  parseGmailDate(text: string, now?: Date): Date | null;
};

describe("extensão: leitura do Gmail", () => {
  it("descobre a conta pelo título da aba", () => {
    expect(dom.mailboxFromTitle("Caixa de entrada (7) - administrativo@ademp.org.br - ADEMP Mail")).toBe("administrativo@ademp.org.br");
    expect(dom.mailboxFromTitle("Pedido de fulano@x.com - Renato@ADEMP.org.br - Gmail")).toBe("renato@ademp.org.br");
    expect(dom.mailboxFromTitle("Gmail")).toBeNull();
  });

  it("entende datas do Gmail em português e inglês", () => {
    const now = new Date(2026, 9, 21, 12, 0);
    const d1 = dom.parseGmailDate("qua., 10 de jun. de 2026, 10:49", now)!;
    expect([d1.getFullYear(), d1.getMonth(), d1.getDate(), d1.getHours(), d1.getMinutes()]).toEqual([2026, 5, 10, 10, 49]);
    const d2 = dom.parseGmailDate("21 de out. de 2026 21:01", now)!;
    expect([d2.getMonth(), d2.getDate(), d2.getHours()]).toEqual([9, 21, 21]);
    const d3 = dom.parseGmailDate("3 de set., 08:05", now)!; // sem ano: ano atual
    expect([d3.getFullYear(), d3.getMonth(), d3.getDate()]).toEqual([2026, 8, 3]);
    const d4 = dom.parseGmailDate("Wed, Jun 10, 2026, 1:49 PM", now)!;
    expect([d4.getMonth(), d4.getDate(), d4.getHours(), d4.getMinutes()]).toEqual([5, 10, 13, 49]);
    expect(dom.parseGmailDate("ontem", now)).toBeNull();
  });
});
