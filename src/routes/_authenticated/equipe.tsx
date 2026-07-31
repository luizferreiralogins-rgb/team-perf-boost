import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createTeamMember,
  deleteTeamMember,
  listTeam,
  updateTeamMember,
} from "@/lib/team.functions";
import { supabase } from "@/integrations/supabase/client";
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

type Role = "consultor" | "gerente" | "lider_pap" | "regional" | "admin";
type Canal = "loja" | "pap";
type Unidade = "norte" | "sul" | "shopping";

type Member = {
  id: string;
  nome: string;
  email: string | null;
  canal: Canal;
  loja_unidade: Unidade | null;
  gerente_id: string | null;
  ativo: boolean;
  roles: Role[];
};

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

  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterCanal, setFilterCanal] = useState<string>("all");
  const [filterUnidade, setFilterUnidade] = useState<string>("all");
  const [filterGerente, setFilterGerente] = useState<string>("all");
  const [q, setQ] = useState("");

  const isRegional = me.data?.roles.includes("regional") || me.data?.roles.includes("admin");
  const isGerente = me.data?.roles.includes("gerente");

  const members = (membersQ.data ?? []) as Member[];
  const gerentes = useMemo(() => members.filter((m) => m.roles.includes("gerente")), [members]);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      // gerente só vê consultores do seu time (RLS já limita, mas garantimos UI limpa)
      if (isGerente && !isRegional && !m.roles.includes("consultor")) return false;
      if (isGerente && !isRegional && m.gerente_id !== me.data?.uid) return false;
      if (filterRole !== "all" && !m.roles.includes(filterRole as Role)) return false;
      if (filterCanal !== "all" && m.canal !== filterCanal) return false;
      if (filterUnidade !== "all" && m.loja_unidade !== filterUnidade) return false;
      if (filterGerente !== "all" && m.gerente_id !== filterGerente) return false;
      if (q && !`${m.nome} ${m.email ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [members, filterRole, filterCanal, filterUnidade, filterGerente, q, isGerente, isRegional, me.data?.uid]);

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
              <SelectItem value="norte">Norte</SelectItem>
              <SelectItem value="sul">Sul</SelectItem>
              <SelectItem value="shopping">Shopping</SelectItem>
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
        <CardHeader>
          <CardTitle>{filtered.length} acessos</CardTitle>
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
                    <TableHead>Gerente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      gerentes={gerentes}
                      isRegional={!!isRegional}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MemberRow({
  member,
  gerentes,
  isRegional,
}: {
  member: Member;
  gerentes: Member[];
  isRegional: boolean;
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
    ? "Regional"
    : member.roles.includes("gerente")
      ? "Gerente"
      : "Consultor";

  return (
    <TableRow>
      <TableCell className="font-medium">{member.nome || "—"}</TableCell>
      <TableCell className="text-muted-foreground">{member.email ?? "—"}</TableCell>
      <TableCell><Badge variant="secondary">{perfil}</Badge></TableCell>
      <TableCell className="uppercase text-xs">{member.canal}</TableCell>
      <TableCell className="capitalize">{member.loja_unidade ?? "—"}</TableCell>
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
          <EditarDialog member={member} gerentes={gerentes} isRegional={isRegional} />
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
  isGerente,
  gerentes,
  myId,
}: {
  isRegional: boolean;
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
  const [role, setRole] = useState<"gerente" | "consultor">(isRegional ? "gerente" : "consultor");
  const [canal, setCanal] = useState<Canal>("loja");
  const [unidade, setUnidade] = useState<Unidade | "">("");
  const [gerenteId, setGerenteId] = useState<string>("");

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          nome,
          email,
          password,
          role,
          canal: role === "consultor" ? canal : undefined,
          loja_unidade: role === "consultor" && canal === "loja" ? (unidade || null) : null,
          gerente_id:
            role === "consultor"
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
      setNome(""); setEmail(""); setPassword(""); setUnidade(""); setGerenteId("");
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
                  <SelectItem value="gerente">Gerente</SelectItem>
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
            <Label>Senha temporária</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
          </div>
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
                    <Select value={unidade} onValueChange={(v) => setUnidade(v as Unidade)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="norte">Norte</SelectItem>
                        <SelectItem value="sul">Sul</SelectItem>
                        <SelectItem value="shopping">Shopping</SelectItem>
                      </SelectContent>
                    </Select>
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
            disabled={mut.isPending || !nome || !email || password.length < 8}
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
}: {
  member: Member;
  gerentes: Member[];
  isRegional: boolean;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateTeamMember);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(member.nome);
  const [canal, setCanal] = useState<Canal>(member.canal);
  const [unidade, setUnidade] = useState<Unidade | "">(member.loja_unidade ?? "");
  const [ativo, setAtivo] = useState(member.ativo);
  const [gerenteId, setGerenteId] = useState<string>(member.gerente_id ?? "");

  const mut = useMutation({
    mutationFn: () =>
      update({
        data: {
          user_id: member.id,
          nome,
          canal,
          loja_unidade: canal === "loja" ? (unidade || null) : null,
          ativo,
          gerente_id: isRegional ? (gerenteId || null) : undefined,
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
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
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
                <Select value={unidade} onValueChange={(v) => setUnidade(v as Unidade)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="norte">Norte</SelectItem>
                    <SelectItem value="sul">Sul</SelectItem>
                    <SelectItem value="shopping">Shopping</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {isRegional && !member.roles.includes("regional") && (
            <div className="space-y-2">
              <Label>Gerente responsável</Label>
              <Select value={gerenteId} onValueChange={setGerenteId}>
                <SelectTrigger><SelectValue placeholder="Sem gerente" /></SelectTrigger>
                <SelectContent>
                  {gerentes.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
