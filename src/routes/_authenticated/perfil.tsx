import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { data, isLoading } = useQuery({
    queryKey: ["perfil"],
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user!.id;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      return { profile, roles: (roles ?? []).map((r) => r.role) };
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meu perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">Suas informações de acesso.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{isLoading ? <Skeleton className="h-6 w-40" /> : data?.profile?.nome ?? "—"}</CardTitle>
          <CardDescription>{isLoading ? <Skeleton className="h-4 w-52" /> : data?.profile?.email ?? "—"}</CardDescription>
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
