import { allowedDomain } from "@/lib/config";
import { requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { updateUserAction } from "./actions";
import { AddUserForm } from "./AddUserForm";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { tasksResponsible: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] text-ink">Usuários</h1>
        <p className="text-sm text-ink-3">
          Usuários entram com a conta Google da organização. Pré-cadastre quem ainda não entrou para já poder atribuir tarefas.
        </p>
      </div>
      <AddUserForm domain={allowedDomain()} />
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="th">Nome</th>
              <th className="th">E-mail</th>
              <th className="th">Perfil</th>
              <th className="th">Situação</th>
              <th className="th">Último acesso</th>
              <th className="th text-right">Tarefas</th>
              <th className="th">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "bg-[#f2f6fc] text-ink-3"}>
                <td className="td">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">{u.role === "ADMIN" ? <strong>Administrador</strong> : "Usuário"}</td>
                <td className="td">{u.active ? (u.googleSub ? "Ativo" : "Aguardando 1º acesso") : "Desativado"}</td>
                <td className="td tabular-nums">{formatDateTime(u.lastLogin)}</td>
                <td className="td text-right tabular-nums">{u._count.tasksResponsible}</td>
                <td className="td">
                  {u.id === admin.id ? (
                    <span className="text-xs text-ink-3">você</span>
                  ) : (
                    <form action={updateUserAction} className="flex flex-wrap gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <button name="op" value={u.role === "ADMIN" ? "make-user" : "make-admin"} className="btn-secondary px-2 py-1 text-xs">
                        {u.role === "ADMIN" ? "Tornar usuário" : "Tornar admin"}
                      </button>
                      <button name="op" value={u.active ? "deactivate" : "activate"} className={`${u.active ? "btn-danger" : "btn-secondary"} px-2 py-1 text-xs`}>
                        {u.active ? "Desativar" : "Reativar"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
