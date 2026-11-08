"use client";

import { useActionState, useState } from "react";
import { authorizeGmailSendAction, sendReportAction, type SendReportState } from "./actions";

interface Props {
  /** Filtros da tela, para o PDF enviado ser igual ao baixado. */
  qs: string;
  canSend: boolean;
  defaultSubject: string;
  /** Abre já aberto (volta da autorização do Google). */
  startOpen?: boolean;
}

/** "Enviar por e-mail": manda o relatório em PDF anexado, pelo Gmail do próprio administrador. */
export function SendReportForm({ qs, canSend, defaultSubject, startOpen = false }: Props) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState<SendReportState, FormData>(sendReportAction, {});

  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        ✉ Enviar por e-mail
      </button>
    );
  }

  const authorize = (
    <form action={authorizeGmailSendAction}>
      <input type="hidden" name="qs" value={qs} />
      <button type="submit" className="btn-primary">
        Autorizar envio pelo Gmail
      </button>
    </form>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-labelledby="send-title">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between bg-[#f2f6fc] px-4 py-2.5">
          <h2 id="send-title" className="text-sm font-medium text-ink">
            Enviar relatório por e-mail
          </h2>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        {!canSend && !state.ok ? (
          <div className="space-y-3 p-4 text-sm text-ink-2">
            <p>
              O relatório sai da <b>sua</b> caixa do Gmail, com o PDF anexado, e fica na sua pasta Enviados. Para isso, o Google pede uma
              autorização (só na primeira vez).
            </p>
            {authorize}
          </div>
        ) : (
          <form action={action} className="space-y-3 p-4">
            <input type="hidden" name="qs" value={qs} />
            <div>
              <label className="label" htmlFor="send-to">
                Para *
              </label>
              <input id="send-to" name="to" required className="input" placeholder="nome@ademp.org.br, outro@ademp.org.br" autoComplete="email" />
              <p className="mt-1 text-xs text-ink-3">Separe vários e-mails com vírgula (até 20).</p>
            </div>
            <div>
              <label className="label" htmlFor="send-subject">
                Assunto
              </label>
              <input id="send-subject" name="subject" defaultValue={defaultSubject} maxLength={200} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="send-message">
                Mensagem (opcional)
              </label>
              <textarea id="send-message" name="message" rows={3} maxLength={5000} className="input" />
            </div>
            <p className="text-xs text-ink-3">📎 O PDF anexado usa os mesmos filtros desta tela.</p>
            {state.error && <p className="rounded-lg bg-[#fce8e6] p-2 text-sm text-[#b3261e]">{state.error}</p>}
            {state.ok && <p className="rounded-lg bg-[#e6f4ea] p-2 text-sm text-[#0d652d]">{state.ok}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Fechar
              </button>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Gerando e enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        )}
        {state.needsAuth && <div className="px-4 pb-4">{authorize}</div>}
      </div>
    </div>
  );
}
