"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/(app)/shell-actions";
import { Avatar, Logo } from "./Brand";
import { Icon } from "./Icon";

export interface ShellCounts {
  open: number;
  CRIADO: number;
  ABERTA: number;
  EM_ANDAMENTO: number;
  overdue: number;
}

interface Props {
  user: { name: string; email: string; isAdmin: boolean };
  counts: ShellCounts;
  children: React.ReactNode;
}

/** Estrutura no estilo Gmail: barra superior, menu lateral recolhível e área principal. */
export function AppShell({ user, counts, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
    } catch {}
  }, []);

  function toggle() {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((v) => !v);
      return;
    }
    setCollapsed((v) => {
      try {
        localStorage.setItem("sidebar-collapsed", v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  return (
    <div className="flex h-dvh flex-col bg-page">
      <header className="flex h-16 shrink-0 items-center gap-1 pr-2 pl-2 md:gap-2 md:pr-4">
        <button type="button" onClick={toggle} className="icon-btn" aria-label="Menu principal">
          <Icon name="menu" size={24} />
        </button>
        <Link href="/" className="flex shrink-0 items-center gap-2 pr-2 md:w-[180px]">
          <Logo size={36} />
          <span className="hidden text-[22px] leading-none text-ink-2 sm:inline">Tarefas</span>
        </Link>
        <Suspense fallback={<div className="h-12 flex-1" />}>
          <SearchBar />
        </Suspense>
        <div className="ml-auto flex items-center gap-1">
          <UserMenu user={user} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {mobileOpen && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setMobileOpen(false)} />}
        <aside
          className={[
            "z-40 shrink-0 overflow-y-auto bg-page pb-4 transition-[width] duration-200",
            "fixed top-16 bottom-0 left-0 w-64 md:static",
            mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full md:translate-x-0",
            collapsed ? "md:w-[72px]" : "md:w-64",
          ].join(" ")}
        >
          <Suspense>
            <Sidebar collapsed={collapsed} isAdmin={user.isAdmin} counts={counts} onNavigate={() => setMobileOpen(false)} />
          </Suspense>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto rounded-2xl bg-surface md:mr-4 md:mb-4">
          <div className="mx-auto max-w-[1400px] p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SearchBar() {
  const sp = useSearchParams();
  const pathname = usePathname();
  const q = pathname === "/tarefas" ? (sp.get("q") ?? "") : "";
  return (
    <form action="/tarefas" method="get" className="flex h-12 max-w-[720px] min-w-0 flex-1 items-center rounded-full bg-search px-1 focus-within:bg-white focus-within:shadow-[0_1px_1px_0_rgba(65,69,73,.3),0_1px_3px_1px_rgba(65,69,73,.15)]">
      <button type="submit" className="icon-btn" aria-label="Pesquisar">
        <Icon name="search" size={22} />
      </button>
      <input
        key={q}
        name="q"
        defaultValue={q}
        placeholder="Pesquisar tarefas"
        className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-2"
        aria-label="Pesquisar tarefas"
      />
      <Link href="/tarefas?filtros=1" className="icon-btn" aria-label="Mostrar opções de pesquisa" title="Mostrar opções de pesquisa">
        <Icon name="tune" size={22} />
      </Link>
    </form>
  );
}

function UserMenu({ user }: { user: Props["user"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full p-1 hover:bg-[#444746]/[0.08]" aria-label="Conta">
        <Avatar name={user.name} email={user.email} size={32} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-3xl bg-[#e9eef6] p-4 text-center shadow-lg">
          <div className="text-sm text-ink-2">{user.email}</div>
          <div className="my-4 flex justify-center">
            <Avatar name={user.name} email={user.email} size={72} />
          </div>
          <div className="text-xl">Olá, {user.name.split(" ")[0]}!</div>
          {user.isAdmin && <div className="mt-1 text-xs text-ink-3">Administrador</div>}
          <form action={signOutAction} className="mt-4">
            <button type="submit" className="btn w-full bg-white text-ink hover:bg-[#f8fafd]">
              <Icon name="logout" /> Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  count?: number;
  danger?: boolean;
  match: (path: string, sp: URLSearchParams) => boolean;
}

function Sidebar({ collapsed, isAdmin, counts, onNavigate }: { collapsed: boolean; isAdmin: boolean; counts: ShellCounts; onNavigate: () => void }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const onList = (status: string | null, overdue = false) => (p: string, s: URLSearchParams) =>
    p === "/tarefas" && (s.get("status") ?? null) === status && (s.get("vencidas") === "1") === overdue;

  const main: NavItem[] = [
    { href: "/", label: "Painel", icon: "dashboard", match: (p) => p === "/" },
    { href: "/tarefas", label: "Todas as tarefas", icon: "inbox", count: counts.open, match: onList(null) },
    { href: "/tarefas?status=CRIADO", label: "Novas", icon: "fiber_new", count: counts.CRIADO, match: onList("CRIADO") },
    { href: "/tarefas?status=ABERTA", label: "Abertas", icon: "drafts", count: counts.ABERTA, match: onList("ABERTA") },
    { href: "/tarefas?status=EM_ANDAMENTO", label: "Em andamento", icon: "pending_actions", count: counts.EM_ANDAMENTO, match: onList("EM_ANDAMENTO") },
    { href: "/tarefas?vencidas=1", label: "Vencidas", icon: "alarm", count: counts.overdue, danger: true, match: onList(null, true) },
    { href: "/tarefas?status=CONCLUIDO", label: "Concluídas", icon: "task_alt", match: onList("CONCLUIDO") },
    { href: "/tarefas?status=CANCELADO", label: "Canceladas", icon: "cancel", match: onList("CANCELADO") },
  ];
  const tools: NavItem[] = [
    { href: "/tarefas/email", label: "Criar do Gmail", icon: "mail", match: (p) => p === "/tarefas/email" },
    ...(isAdmin
      ? [
          { href: "/relatorios", label: "Relatório geral", icon: "analytics", match: (p: string) => p === "/relatorios" },
          { href: "/admin/usuarios", label: "Usuários", icon: "group", match: (p: string) => p.startsWith("/admin") },
        ]
      : []),
  ];

  return (
    <nav className="flex flex-col pt-2">
      <div className={collapsed ? "mb-4 px-2 md:px-3" : "mb-4 px-2"}>
        <Link
          href="/tarefas/nova"
          onClick={onNavigate}
          className={`inline-flex h-14 items-center gap-3 rounded-2xl bg-compose text-sm font-medium text-[#001d35] transition hover:shadow-[0_1px_3px_0_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)] ${
            collapsed ? "w-14 justify-center md:px-0 max-md:px-5" : "px-5"
          }`}
          title="Nova tarefa"
        >
          <Icon name="edit" size={24} />
          <span className={collapsed ? "md:hidden" : ""}>Nova tarefa</span>
        </Link>
      </div>
      {main.map((item) => (
        <NavLink key={item.href} item={item} active={item.match(pathname, sp)} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
      <div className={`my-3 border-t border-line ${collapsed ? "md:mx-3" : "mx-6"}`} />
      {!collapsed && <div className="px-6 pb-1 text-sm font-medium text-ink">Ferramentas</div>}
      {tools.map((item) => (
        <NavLink key={item.href} item={item} active={item.match(pathname, sp)} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function NavLink({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={item.label}
      className={[
        "flex h-8 items-center gap-4 text-sm",
        collapsed ? "mx-3 justify-center rounded-full md:w-12 max-md:mr-2 max-md:ml-0 max-md:justify-start max-md:rounded-l-none max-md:rounded-r-full max-md:pl-6" : "mr-2 rounded-r-full pr-3 pl-6",
        active ? "bg-nav-active font-bold text-[#001d35]" : "text-ink hover:bg-nav-hover",
      ].join(" ")}
    >
      <Icon name={item.icon} fill={active} size={20} className={item.danger && (item.count ?? 0) > 0 ? "text-[#d93025]" : ""} />
      <span className={`flex-1 truncate ${collapsed ? "md:hidden" : ""}`}>{item.label}</span>
      {!!item.count && (
        <span className={`text-xs tabular-nums ${item.danger ? "font-bold text-[#d93025]" : active ? "font-bold" : "font-medium"} ${collapsed ? "md:hidden" : ""}`}>
          {item.count}
        </span>
      )}
    </Link>
  );
}
