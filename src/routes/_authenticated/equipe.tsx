import { createFileRoute } from "@tanstack/react-router";
import { useOrdenacao, cmpTexto, type OpcaoOrdenacao } from "@/components/ordenacao";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  createTeamMember,
  deleteTeamMember,
  listTeam,
  updateTeamMember,
  setTeamMemberPassword,
} from "@/lib/team.functions";
import { supabase } from "@/integrations/supabase/client";
import { SelectUnidade, UnidadesConfig, useUnidades } from "@/components/unidades-loja";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — Unifique Comercial" },
      { name: "description", content: "Gerencie acessos de gerentes e consultores." },
    ],
  }),
  component: EquipePage,
});

type Role = "consultor" | "gerente" | "lider_pap" | "gerente_regional" | "regional" | "admin";
type RoleEditavel = "consultor" | "gerente" | "lider_pap" | "gerente_regional" | "regional";

type Canal = "loja" | "pap";
type Unidade = string;

type Member = {
  id: string;
  nome: string;
  email: string | null;
  canal: Canal;
  loja_unidade: Unidade | null;
  gerente_id: string | null;
  ativo: boolean;
  data_nascimento: string | null;
  roles: Role[];
};

function formatarData(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function useMyRoles() {
  return useQuery({
    queryKey: ["my-roles"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) return { uid: "", roles: [] as Role[] };
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      return { uid, roles: (data ?? []).map((r) => r.role as Role) };
    },
    staleTime: 60_000,
  });
}

function EquipePage() {
  const me = useMyRoles();
  const list = useServerFn(listTeam);
  const membersQ = useQuery({
    queryKey: ["team"],
    queryFn: () => list(),
  });

  const { data: unidades } = useUnidades();

  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterCanal, setFilterCanal] = useState<string>("all");
  const [filterUnidade, setFilterUnidade] = useState<string>("all");
  const [filterGerente, setFilterGerente] = useState<string>("all");
  const [q, setQ] = useState("");

  const isMaster = !!(me.data?.roles.includes("regional") || me.data?.roles.includes("admin"));
  const isGerenteRegional = !!me.data?.roles.includes("gerente_regional");
  const isRegional = isMaster || isGerenteRegional;
  const isGerente = me.data?.roles.includes("gerente") || me.data?.roles.includes("lider_pap");

  const members = (membersQ.data ?? []) as Member[];
  const gerentes = useMemo(
    () =>
      members.filter(
        (m) =>
          m.roles.includes("gerente") ||
          m.roles.includes("lider_pap") ||
          m.roles.includes("gerente_regional") ||
          m.roles.includes("regional"),
      ),
    [members],
  );


  const filtered = useMemo(() => {
    return members.filter((m) => {
      // gestor só vê sua equipe direta (RLS já limita, mas garantimos UI limpa)
      if (isGerente && !isRegional && !(m.roles.includes("consultor") || m.roles.includes("lider_pap")))
        return false;
      if (isGerente && !isRegional && m.gerente_id !== me.data?.uid) return false;
      if (filterRole !== "all" && !m.roles.includes(filterRole as Role)) return false;
      if (filterCanal !== "all" && m.canal !== filterCanal) return false;
      if (filterUnidade !== "all" && m.loja_unidade !== filterUnidade) return false;
      if (filterGerente !== "all" && m.gerente_id !== filterGerente) return false;
      if (q && !`${m.nome} ${m.email ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [members, filterRole, filterCanal, filterUnidade, filterGerente, q, isGerente, isRegional, me.data?.uid]);

  type Membro = (typeof filtered)[number];
  const opcoesOrdem = useMemo<OpcaoOrdenacao<Membro>[]>(
    () => [
      { valor: "nome", label: "Nome (A-Z)", cmp: cmpTexto((m) => m.nome) },
      { valor: "email", label: "E-mail (A-Z)", cmp: cmpTexto((m) => m.email ?? "") },
      { valor: "canal", label: "Canal (A-Z)", cmp: cmpTexto((m) => m.canal ?? "") },
      { valor: "perfil", label: "Perfil (A-Z)", cmp: cmpTexto((m) => m.roles.join(", ")) },
    ],
    [],
  );
  const { rows: membrosOrdenados, control: ordenarControl } = useOrdenacao(filtered, opcoesOrdem);

  if (!me.isLoading && !isRegional && !isGerente) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Sem acesso</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Esta área é restrita a gerentes e regionais.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isRegional
              ? "Gerencie gerentes e consultores da regional."
              : "Gerencie os consultores do seu time."}
          </p>
        </div>
        <NovoAcessoDialog
          isRegional={!!isRegional}
          isMaster={isMaster}
          isGerente={!!isGerente}
          gerentes={gerentes}
          myId={me.data?.uid ?? ""}
        />

      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <Input placeholder="Buscar nome ou email" value={q} onChange={(e) => setQ(e.target.value)} />
          {isRegional && (
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger><SelectValue placeholder="Perfil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                <SelectItem value="gerente">Gerente</SelectItem>
                <SelectItem value="lider_pap">Líder PAP</SelectItem>
                <SelectItem value="consultor">Consultor</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={filterCanal} onValueChange={setFilterCanal}>
            <SelectTrigger><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="loja">Loja</SelectItem>
              <SelectItem value="pap">PAP</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterUnidade} onValueChange={setFilterUnidade}>
            <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as unidades</SelectItem>
              {(unidades ?? []).map((u) => (
                <SelectItem key={u.id} value={u.nome}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isRegional && (
            <Select value={filterGerente} onValueChange={setFilterGerente}>
              <SelectTrigger><SelectValue placeholder="Gerente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os gerentes</SelectItem>
                {gerentes.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>{filtered.length} acessos</CardTitle>
          {filtered.length > 0 && ordenarControl}
        </CardHeader>
        <CardContent>
          {membersQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Aniversário</TableHead>
                    <TableHead>Gerente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membrosOrdenados.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      gerentes={gerentes}
                      membros={members}
                      isRegional={!!isRegional}
                      isMaster={isMaster}
                    />
                  ))}

                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UnidadesConfig />
    </div>
  );
}

function MemberRow({
  member,
  gerentes,
  membros,
  isRegional,
  isMaster,
}: {
  member: Member;
  gerentes: Member[];
  membros: Member[];
  isRegional: boolean;
  isMaster: boolean;
}) {
  const qc = useQueryClient();
  const remove = useServerFn(deleteTeamMember);
  const del = useMutation({
    mutationFn: () => remove({ data: { user_id: member.id } }),
    onSuccess: () => {
      toast.success("Acesso excluído");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const gerenteNome = gerentes.find((g) => g.id === member.gerente_id)?.nome;
  const perfil = member.roles.includes("regional")
    ? "Acesso Master"
    : member.roles.includes("gerente_regional")
      ? "Gerente Regional"
      : member.roles.includes("gerente")
        ? "Gerente"
        : member.roles.includes("lider_pap")
          ? "Líder PAP"
          : "Consultor";


  return (
    <TableRow>
      <TableCell className="font-medium">{member.nome || "—"}</TableCell>
      <TableCell className="text-muted-foreground">{member.email ?? "—"}</TableCell>
      <TableCell><Badge variant="secondary">{perfil}</Badge></TableCell>
      <TableCell className="uppercase text-xs">{member.canal}</TableCell>
      <TableCell className="capitalize">{member.loja_unidade ?? "—"}</TableCell>
      <TableCell>{formatarData(member.data_nascimento)}</TableCell>
      <TableCell>{gerenteNome ?? "—"}</TableCell>
      <TableCell>
        {member.ativo ? (
          <Badge>Ativo</Badge>
        ) : (
          <Badge variant="outline">Inativo</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <EditarDialog
            member={member}
            gerentes={gerentes}
            isRegional={isRegional}
            isMaster={isMaster}
          />
          {isMaster && member.roles.includes("gerente_regional") && (
            <EquipeRegionalDialog regional={member} membros={membros} />
          )}
          {isRegional && <SenhaDialog member={member} />}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" title="Excluir">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir acesso?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso remove permanentemente o usuário <b>{member.nome}</b> e seus dados vinculados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate()}>Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NovoAcessoDialog({
  isRegional,
  isMaster,
  isGerente,
  gerentes,
  myId,
}: {
  isRegional: boolean;
  isMaster: boolean;
  isGerente: boolean;
  gerentes: Member[];
  myId: string;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createTeamMember);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"gerente_regional" | "gerente" | "lider_pap" | "consultor">(
    isRegional ? "gerente" : "consultor",
  );

  const [canal, setCanal] = useState<Canal>("loja");
  const [unidade, setUnidade] = useState<Unidade | "">("");
  const [gerenteId, setGerenteId] = useState<string>("");
  const [nascimento, setNascimento] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          nome,
          email,
          password,
          data_nascimento: nascimento || null,
          role,
          canal: role === "consultor" ? canal : undefined,
          loja_unidade: role === "consultor" && canal === "loja" ? (unidade || null) : null,
          gerente_id:
            role === "consultor" || role === "lider_pap"
              ? isRegional
                ? gerenteId || null
                : myId
              : null,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Acesso criado");
      qc.invalidateQueries({ queryKey: ["team"] });
      setOpen(false);
      setNome(""); setEmail(""); setPassword(""); setUnidade(""); setGerenteId(""); setNascimento("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg"><Plus className="mr-2 h-4 w-4" /> Novo acesso</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar novo acesso</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isRegional && (
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isMaster && (
                    <SelectItem value="gerente_regional">Gerente Regional</SelectItem>
                  )}
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="lider_pap">Líder PAP</SelectItem>
                  <SelectItem value="consultor">Consultor</SelectItem>
                </SelectContent>

              </Select>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Data de aniversário</Label>
            <Input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Senha temporária</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
          </div>
          {role === "lider_pap" && isRegional && (
            <div className="space-y-2">
              <Label>Vincular ao gerente</Label>
              <Select value={gerenteId} onValueChange={setGerenteId}>
                <SelectTrigger><SelectValue placeholder="Selecione um gerente" /></SelectTrigger>
                <SelectContent>
                  {gerentes
                    .filter((g) => g.roles.includes("gerente"))
                    .map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O Líder PAP precisa estar vinculado a um Gerente.
              </p>
            </div>
          )}
          {role === "consultor" && (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Canal</Label>
                  <Select value={canal} onValueChange={(v) => setCanal(v as Canal)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loja">Loja</SelectItem>
                      <SelectItem value="pap">PAP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {canal === "loja" && (
                  <div className="space-y-2">
                    <Label>Unidade da loja</Label>
                    <SelectUnidade value={unidade} onChange={(v) => setUnidade(v)} />
                  </div>
                )}
              </div>
              {isRegional && (
                <div className="space-y-2">
                  <Label>Vincular ao gerente</Label>
                  <Select value={gerenteId} onValueChange={setGerenteId}>
                    <SelectTrigger><SelectValue placeholder="Selecione um gerente" /></SelectTrigger>
                    <SelectContent>
                      {gerentes.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending ||
              !nome ||
              !email ||
              password.length < 8 ||
              (role === "lider_pap" && isRegional && !gerenteId)
            }
          >
            {mut.isPending ? "Criando..." : "Criar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarDialog({
  member,
  gerentes,
  isRegional,
  isMaster,
}: {
  member: Member;
  gerentes: Member[];
  isRegional: boolean;
  isMaster: boolean;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateTeamMember);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(member.nome);
  const [canal, setCanal] = useState<Canal>(member.canal);
  const [unidade, setUnidade] = useState<Unidade | "">(member.loja_unidade ?? "");
  const [ativo, setAtivo] = useState(member.ativo);
  const [gerenteId, setGerenteId] = useState<string>(member.gerente_id ?? "");
  const [nascimento, setNascimento] = useState(member.data_nascimento ?? "");
  const cargoAtual: RoleEditavel = member.roles.includes("regional")
    ? "regional"
    : member.roles.includes("gerente_regional")
      ? "gerente_regional"
      : member.roles.includes("gerente")
        ? "gerente"
        : member.roles.includes("lider_pap")
          ? "lider_pap"
          : "consultor";
  const [role, setRole] = useState<RoleEditavel>(cargoAtual);


  const mut = useMutation({
    mutationFn: () =>
      update({
        data: {
          user_id: member.id,
          nome,
          data_nascimento: nascimento || null,
          canal,
          loja_unidade: canal === "loja" ? (unidade || null) : null,
          ativo,
          gerente_id: isRegional ? (gerenteId || null) : undefined,
          role: isRegional && role !== cargoAtual ? role : undefined,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Acesso atualizado");
      qc.invalidateQueries({ queryKey: ["team"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {member.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data de aniversário</Label>
              <Input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={canal} onValueChange={(v) => setCanal(v as Canal)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loja">Loja</SelectItem>
                  <SelectItem value="pap">PAP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canal === "loja" && (
              <div className="space-y-2">
                <Label>Unidade</Label>
                <SelectUnidade value={unidade} onChange={(v) => setUnidade(v)} placeholder="—" />
              </div>
            )}
          </div>
          {isRegional && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select value={role} onValueChange={(v) => setRole(v as RoleEditavel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isMaster && <SelectItem value="regional">Acesso Master</SelectItem>}
                    {isMaster && (
                      <SelectItem value="gerente_regional">Gerente Regional</SelectItem>
                    )}
                    <SelectItem value="gerente">Gerente</SelectItem>
                    <SelectItem value="lider_pap">Líder PAP</SelectItem>
                    <SelectItem value="consultor">Consultor</SelectItem>
                  </SelectContent>

                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gestor responsável</Label>
                <Select value={gerenteId} onValueChange={setGerenteId}>
                  <SelectTrigger><SelectValue placeholder="Sem gestor" /></SelectTrigger>
                  <SelectContent>
                    {gerentes
                      .filter((g) => g.id !== member.id)
                      .map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="font-medium text-sm">Acesso ativo</div>
              <div className="text-xs text-muted-foreground">Desative para bloquear o login.</div>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SenhaDialog({ member }: { member: Member }) {
  const setPwd = useServerFn(setTeamMemberPassword);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [mostrar, setMostrar] = useState(false);

  const mut = useMutation({
    mutationFn: () => setPwd({ data: { user_id: member.id, password } }),
    onSuccess: () => {
      toast.success("Senha redefinida");
      setPassword("");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Redefinir senha">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Senha de {member.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Por segurança, as senhas são guardadas criptografadas e não podem ser exibidas — nem pelo
            Acesso Master. Você pode definir uma nova senha e informá-la ao colaborador.
          </p>
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input
              type={mostrar ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
              Mostrar senha
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || password.length < 8}>
            {mut.isPending ? "Salvando..." : "Definir senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
