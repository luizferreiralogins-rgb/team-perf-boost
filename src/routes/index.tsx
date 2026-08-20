import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, ShieldCheck, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unifique — Gestão Comercial" },
      {
        name: "description",
        content:
          "Plataforma de gestão comercial da Unifique. Registre vendas, acompanhe comissões e resultados em tempo real.",
      },
      { property: "og:title", content: "Unifique — Gestão Comercial" },
      {
        property: "og:description",
        content: "Vendas, comissões e resultados da equipe comercial em um só lugar.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[image:var(--gradient-hero)] text-primary-foreground font-bold shadow-[var(--shadow-elegant)]">
              U
            </div>
            <span className="text-lg font-semibold tracking-tight">Unifique · Comercial</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link to="/auth">Entrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[image:var(--gradient-hero)] opacity-[0.07]" />
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" /> Loja e PAP em uma única plataforma
          </span>
          <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight md:text-6xl">
            Gestão comercial que{" "}
            <span className="bg-[image:var(--gradient-hero)] bg-clip-text text-transparent">
              acelera resultados
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Substitua as planilhas de vendas por um sistema integrado: registre vendas, acompanhe
            comissões, veja o desempenho da equipe e tome decisões em tempo real.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Entrar</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: BarChart3,
              title: "Vendas e comissões",
              desc: "Cadastre vendas de Loja ou PAP com as regras de comissão já configuradas.",
            },
            {
              icon: Users,
              title: "Hierarquia por equipe",
              desc: "Consultor, gerente e regional — cada um vê exatamente o que precisa.",
            },
            {
              icon: ShieldCheck,
              title: "Dados seguros",
              desc: "Cada consultor acessa apenas seus dados. Gestores enxergam suas equipes.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
            >
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Unifique — Gestão Comercial
      </footer>
    </div>
  );
}
