import Link from "next/link";
import type { TaskFilters } from "@/lib/filters";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/status";

interface Props {
  path: string;
  filters: TaskFilters;
  users: { id: string; name: string; email: string }[];
  showSearch?: boolean;
}

/** Filtros via GET: o estado fica na URL, funciona sem JavaScript e pode ser compartilhado. */
export function FilterBar({ path, filters, users, showSearch = true }: Props) {
  return (
    <form method="get" action={path} className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {showSearch && (
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor="q">
            Pesquisa
          </label>
          <input id="q" name="q" defaultValue={filters.q} placeholder="Título, descrição, assunto, remetente ou nº da tarefa" className="input" />
        </div>
      )}
      <fieldset className="sm:col-span-2">
        <legend className="label">Status</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {STATUS_ORDER.map((s) => (
            <label key={s} className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="status" value={s} defaultChecked={filters.status.includes(s)} />
              {STATUS_LABEL[s]}
            </label>
          ))}
          <label className="inline-flex items-center gap-1.5 text-sm font-medium text-[#d93025]">
            <input type="checkbox" name="vencidas" value="1" defaultChecked={filters.overdue} />
            Somente vencidas
          </label>
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="responsavel">
          Responsável
        </label>
        <select id="responsavel" name="responsavel" defaultValue={filters.responsibleId ?? ""} className="input">
          <option value="">Todos</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="origem">
          Origem
        </label>
        <select id="origem" name="origem" defaultValue={filters.origin ?? ""} className="input">
          <option value="">Todas</option>
          <option value="EMAIL">E-mail</option>
          <option value="MANUAL">Manual</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <span className="label">Criada entre</span>
        <div className="flex gap-1">
          <input type="date" name="criadoDe" defaultValue={filters.createdFrom} className="input" aria-label="Criada de" />
          <input type="date" name="criadoAte" defaultValue={filters.createdTo} className="input" aria-label="Criada até" />
        </div>
      </div>
      <div className="sm:col-span-2">
        <span className="label">Prazo entre</span>
        <div className="flex gap-1">
          <input type="date" name="prazoDe" defaultValue={filters.dueFrom} className="input" aria-label="Prazo de" />
          <input type="date" name="prazoAte" defaultValue={filters.dueTo} className="input" aria-label="Prazo até" />
        </div>
      </div>
      <input type="hidden" name="ordem" value={filters.sort} />
      <input type="hidden" name="dir" value={filters.dir} />
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className="btn-primary">
          Filtrar
        </button>
        <Link href={path} className="btn-secondary">
          Limpar
        </Link>
      </div>
    </form>
  );
}
