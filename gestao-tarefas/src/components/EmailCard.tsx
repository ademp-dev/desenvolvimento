import { formatDateTime } from "@/lib/time";

interface Props {
  subject: string;
  sender: string;
  recipients: string[];
  emailDate: Date | string | null;
  direction: string;
  link: string;
  mailbox?: string;
  snippet?: string;
}

export function EmailCard(e: Props) {
  return (
    <div className="max-w-2xl rounded-2xl border border-line bg-white p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-ink">
          <span className="msi text-[#d93025]">mail</span> {e.subject}
        </div>
        <a href={e.link} target="_blank" rel="noopener noreferrer" className="btn-text px-2 py-1 text-xs">
          Abrir no Gmail <span className="msi" style={{ fontSize: 16 }}>open_in_new</span>
        </a>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-ink-3">De</dt>
        <dd className="break-all">{e.sender || "—"}</dd>
        <dt className="text-ink-3">Para</dt>
        <dd className="break-all">{e.recipients.length ? e.recipients.join(", ") : "—"}</dd>
        <dt className="text-ink-3">{e.direction === "ENVIADO" ? "Enviado em" : "Recebido em"}</dt>
        <dd>{formatDateTime(e.emailDate)}</dd>
        {e.mailbox && (
          <>
            <dt className="text-ink-3">Caixa</dt>
            <dd>{e.mailbox}</dd>
          </>
        )}
      </dl>
      {e.snippet && <p className="mt-2 text-xs text-ink-3 italic">“{e.snippet}”</p>}
    </div>
  );
}
