import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  UserCircle,
  LogOut,
  Menu,
  X,
  KanbanSquare,
  FileText,
  MessageCircle,
  CalendarCheck,
  Activity,
  History,
  Scale,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AtalhosExternos } from "@/components/atalhos-externos";
import { useAlertas } from "@/hooks/use-alertas";


type Profile = { nome: string; canal: "loja" | "pap"; email: string | null };
type Role = "consultor" | "gerente" | "regional" | "admin";

function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("nome, canal, email").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      return {
        userId: uid,
        profile: (profile ?? { nome: "", canal: "loja", email: sess.user?.email ?? null }) as Profile,
        roles: (roles ?? []).map((r) => r.role as Role),
      };
    },
    staleTime: 30_000,
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMobileOpen(false), [location]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        roles={me.data?.roles ?? []}
        profile={me.data?.profile}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="lg:pl-64">
        <TopBar onMenu={() => setMobileOpen(true)} nome={me.data?.profile.nome ?? ""} />
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ onMenu, nome }: { onMenu: () => void; nome: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-background/80 px-4 py-2 backdrop-blur md:px-8">
      <button
        onClick={onMenu}
        className="lg:hidden -ml-2 grid h-9 w-9 place-items-center rounded-md hover:bg-accent"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <AtalhosExternos />
      <div className="ml-auto flex items-center gap-3">

        <span className="hidden text-sm text-muted-foreground md:inline">
          Olá, <span className="font-medium text-foreground">{nome || "Consultor"}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await qc.cancelQueries();
            qc.clear();
            await supabase.auth.signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>
    </header>
  );
}

function Sidebar({
  roles,
  profile,
  mobileOpen,
  onClose,
}: {
  roles: Role[];
  profile?: Profile;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const isGestor = roles.includes("gerente") || roles.includes("regional") || roles.includes("admin");
  const isConsultor = roles.includes("consultor") && !isGestor;
  const alertas = useAlertas().data;
  const items = [
    {
      to: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      show: true,
      badge: isGestor ? alertas?.vendas : undefined,
    },
    { to: "/leads", label: "Leads", icon: KanbanSquare, show: true, badge: alertas?.leads },
    { to: "/vendas", label: "Vendas", icon: ShoppingBag, show: isConsultor, badge: alertas?.vendas },
    { to: "/produtividade", label: "Produtividade", icon: Activity, show: isConsultor },
    { to: "/historico", label: "Histórico", icon: History, show: true },
    { to: "/contestacoes", label: "Contestações", icon: Scale, show: isGestor, badge: alertas?.contestacoes },
    { to: "/chat", label: "Chat", icon: MessageCircle, show: true, badge: alertas?.chat },
    { to: "/tarefas", label: "Agenda/Tarefas", icon: CalendarCheck, show: true, badge: alertas?.tarefas },
    { to: "/equipe", label: "Equipe", icon: Users, show: isGestor },
    { to: "/regras-comissionamento", label: "Regras de Comissionamento", icon: FileText, show: isGestor },
    { to: "/perfil", label: "Perfil", icon: UserCircle, show: true },
  ];


  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 -translate-x-full bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
          mobileOpen && "translate-x-0",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
              U
            </div>
            <span className="font-semibold">Unifique</span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden grid h-8 w-8 place-items-center rounded hover:bg-sidebar-accent"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="p-3 space-y-1">
          {items
            .filter((i) => i.show)
            .map((i) => (
              <Link
                key={i.to}
                to={i.to}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
                activeProps={{ "data-status": "active" } as never}
              >
                <i.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{i.label}</span>
                {!!i.badge && i.badge > 0 && (
                  <span
                    className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground"
                    aria-label={`${i.badge} pendência(s)`}
                  >
                    {i.badge > 99 ? "99+" : i.badge}
                  </span>
                )}
              </Link>
            ))}
        </nav>
        {profile && (
          <div className="absolute bottom-0 left-0 right-0 border-t border-sidebar-border p-4">
            <div className="text-xs text-sidebar-foreground/60">Canal</div>
            <div className="text-sm font-semibold uppercase tracking-wide">
              {profile.canal === "loja" ? "Loja" : "PAP"}
            </div>
            <div className="mt-2 truncate text-xs text-sidebar-foreground/60">
              {profile.email}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
