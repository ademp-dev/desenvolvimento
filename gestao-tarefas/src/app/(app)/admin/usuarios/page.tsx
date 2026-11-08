import { allowedDomain } from "@/lib/config";
import { requireAdmin } from "@/lib/current-user";
import { fullNames, prisma } from "@/lib/db";
import { formatDateTime, OPEN_STATUSES } from "@/lib/time";
import { setNicknameAction, updateUserAction } from "./actions";
import { AddUserForm } from "./AddUserForm";
import { DeleteUserButton } from "./DeleteUserButton";
import { Icon } from "@/components/Icon";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const [rows, names, openByUser] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { tasksResponsible: true } } },
    }),
    fullNames(),
    prisma.task.groupBy({ by: ["responsibleId"], where: { status: { in: OPEN_STATUSES } }, _count: { _all: true } }),
  ]);
  const openTasks = new Map(openByUser.map((g) => [g.responsibleId, g._count._all]));
  // "name" já vem com o apelido; aqui a coluna Nome mostra o nome completo.
  const users = rows.map((u) => ({ ...u, fullName: names.get(u.id) ?? u.name }));
  const activeUsers = users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] text-ink">Usuários</h1>
        <p className="text-sm text-ink-3">
          Usuários entram com a conta Google da organização. Pré-cadastre quem ainda não entrou para já poder atribuir tarefas.
        </p>
        <p className="mt-1 text-sm text-ink-3">
          O <b>apelido</b> é o nome curto que aparece como responsável no sistema, na extensão do Chrome e no complemento do Gmail. Em branco, vale o
          nome completo.
        </p>
      </div>
      <AddUserForm domain={allowedDomain()} />
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="th">Nome</th>
              <th className="th">Apelido (exibido como responsável)</th>
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
                <td className="td">{u.fullName}</td>
                <td className="td">
                  <form action={setNicknameAction} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      name="nickname"
                      defaultValue={u.nickname ?? ""}
                      maxLength={40}
                      placeholder="Ex.: ADEMP Adm."
                      aria-label={`Apelido de ${u.fullName}`}
                      className="input w-40 py-1 text-sm"
                    />
                    <button type="submit" className="icon-btn text-[#025148]" title="Salvar apelido" aria-label={`Salvar apelido de ${u.fullName}`}>
                      <Icon name="check_circle" />
                    </button>
                  </form>
                </td>
                <td className="td">{u.email}</td>
                <td className="td">{u.role === "ADMIN" ? <strong>Administrador</strong> : "Usuário"}</td>
                <td className="td">{u.active ? (u.googleSub ? "Ativo" : "Aguardando 1º acesso") : "Desativado"}</td>
                <td className="td tabular-nums">{formatDateTime(u.lastLogin)}</td>
                <td className="td text-right tabular-nums">{u._count.tasksResponsible}</td>
                <td className="td">
                  {u.id === admin.id ? (
                    <span className="text-xs text-ink-3">você</span>
                  ) : (
                    // Só ícones, como na extensão e no complemento: o nome aparece ao passar o mouse.
                    <div className="flex items-center gap-0.5">
                      <form action={updateUserAction} className="flex items-center gap-0.5">
                        <input type="hidden" name="id" value={u.id} />
                        <button
                          name="op"
                          value={u.role === "ADMIN" ? "make-user" : "make-admin"}
                          className="icon-btn text-[#0b57d0]"
                          title={u.role === "ADMIN" ? "Tornar usuário comum" : "Tornar administrador"}
                          aria-label={`${u.role === "ADMIN" ? "Tornar usuário comum" : "Tornar administrador"}: ${u.fullName}`}
                        >
                          <Icon name={u.role === "ADMIN" ? "remove_moderator" : "admin_panel_settings"} />
                        </button>
                        <button
                          name="op"
                          value={u.active ? "deactivate" : "activate"}
                          className={`icon-btn ${u.active ? "text-[#b06000]" : "text-[#188038]"}`}
                          title={u.active ? "Desativar (não entra mais, mas pode ser reativado)" : "Reativar"}
                          aria-label={`${u.active ? "Desativar" : "Reativar"}: ${u.fullName}`}
                        >
                          <Icon name={u.active ? "person_off" : "how_to_reg"} />
                        </button>
                      </form>
                      <DeleteUserButton
                        user={{ id: u.id, name: u.name, email: u.email }}
                        openTasks={openTasks.get(u.id) ?? 0}
                        others={activeUsers.filter((o) => o.id !== u.id)}
                      />
                    </div>
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
