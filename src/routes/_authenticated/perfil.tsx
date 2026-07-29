import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil — Unifique Comercial" },
      { name: "description", content: "Suas informações de acesso e canal na Unifique." },
    ],
  }),
  component: Perfil,
});

function Perfil() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["perfil"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      return {
        userId: uid,
        authEmail: sess.user!.email ?? "",
        profile,
        roles: (roles ?? []).map((r) => r.role),
      };
    },
  });

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);

  useEffect(() => {
    if (data) {
      setNome(data.profile?.nome ?? "");
      setEmail(data.authEmail ?? data.profile?.email ?? "");
    }
  }, [data]);

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    if (nome.trim().length < 2) {
      toast.error("Informe um nome válido.");
      return;
    }
    setSavingProfile(true);
    try {
      const emailChanged = email.trim().toLowerCase() !== (data.authEmail ?? "").toLowerCase();
      if (emailChanged) {
        const { error } = await supabase.auth.updateUser({ email: email.trim() });
        if (error) throw error;
      }
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ nome: nome.trim(), email: email.trim() })
        .eq("id", data.userId);
      if (pErr) throw pErr;
      toast.success(
        emailChanged
          ? "Dados salvos. Verifique seu e-mail para confirmar a alteração."
          : "Dados atualizados com sucesso.",
      );
      qc.invalidateQueries({ queryKey: ["perfil"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao salvar.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function alterarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (senha !== senha2) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setSavingSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      toast.success("Senha alterada com sucesso.");
      setSenha("");
      setSenha2("");
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao alterar senha.");
    } finally {
      setSavingSenha(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meu perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Atualize seus dados de acesso. O perfil de acesso é definido pelo seu gestor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isLoading ? <Skeleton className="h-6 w-40" /> : data?.profile?.nome ?? "—"}</CardTitle>
          <CardDescription>
            {isLoading ? <Skeleton className="h-4 w-52" /> : data?.authEmail ?? "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label="Canal" value={data?.profile?.canal === "pap" ? "PAP" : "Loja"} loading={isLoading} />
          <Info
            label="Perfis"
            value={
              data?.roles?.length
                ? data.roles.map((r) => (
                    <Badge key={r} variant="secondary" className="mr-1 capitalize">
                      {r}
                    </Badge>
                  ))
                : "Consultor"
            }
            loading={isLoading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados cadastrais</CardTitle>
          <CardDescription>Nome e e-mail de acesso.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={salvarDados} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Alterar o e-mail exige confirmação pelo link enviado ao novo endereço.
              </p>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={savingProfile || isLoading}>
                {savingProfile ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>Mínimo de 8 caracteres.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={alterarSenha} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="senha">Nova senha</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="senha2">Confirmar senha</Label>
              <Input
                id="senha2"
                type="password"
                value={senha2}
                onChange={(e) => setSenha2(e.target.value)}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={savingSenha}>
                {savingSenha ? "Alterando..." : "Alterar senha"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({
  label,
  value,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{loading ? <Skeleton className="h-4 w-24" /> : value}</div>
    </div>
  );
}
