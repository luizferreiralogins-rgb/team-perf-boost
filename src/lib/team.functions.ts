import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "consultor" | "gerente" | "lider_pap" | "gerente_regional" | "regional" | "admin";
type Canal = "loja" | "pap";
type Unidade = string;

const getRoles = async (supabase: any, userId: string): Promise<Role[]> => {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => r.role as Role);
};

const isGestorDe = async (supabase: any, manager: string, target: string) => {
  const { data } = await supabase.rpc("is_gestor_de", {
    _manager: manager,
    _consultant: target,
  });
  return data === true;
};

const canManage = async (
  supabase: any,
  callerId: string,
  targetRole: Role,
  gerenteId: string | null,
  targetId?: string,
): Promise<boolean> => {
  const rs = await getRoles(supabase, callerId);
  if (rs.includes("admin") || rs.includes("regional")) {
    // Regional/Admin (Acesso Master) gerencia cargos e hierarquia de qualquer usuário
    return true;
  }
  if (rs.includes("gerente_regional")) {
    // Mesmas permissões do Master, porém só dentro da própria equipe
    if (targetRole === "regional" || targetRole === "admin" || targetRole === "gerente_regional") {
      return false;
    }
    if (targetId) return isGestorDe(supabase, callerId, targetId);
    if (targetRole === "gerente") return true;
    if (!gerenteId) return false;
    return gerenteId === callerId || (await isGestorDe(supabase, callerId, gerenteId));
  }
  if (rs.includes("gerente") || rs.includes("lider_pap")) {
    return (targetRole === "consultor" || targetRole === "lider_pap") && gerenteId === callerId;
  }
  return false;
};



export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, nome, email, canal, loja_unidade, gerente_id, regional_id, ativo, data_nascimento, created_at")
      .order("nome");
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p: any) => p.id);
    const { data: roles } = ids.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as { user_id: string; role: Role }[] };
    const rolesMap = new Map<string, Role[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: rolesMap.get(p.id) ?? [],
    }));
  });

const createSchema = z.object({
  email: z.string().trim().email().max(255),
  nome: z.string().trim().min(2).max(120),
  role: z.enum(["regional", "gerente_regional", "gerente", "lider_pap", "consultor"]),
  canal: z.enum(["loja", "pap"]).optional(),
  loja_unidade: z.string().trim().min(1).max(60).nullable().optional(),
  gerente_id: z.string().uuid().nullable().optional(),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  password: z.string().min(8).max(72),
});

export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rs = await getRoles(supabase, userId);
    const souGerenteRegional =
      rs.includes("gerente_regional") && !rs.includes("regional") && !rs.includes("admin");
    const precisaGestor =
      data.role === "consultor" ||
      data.role === "lider_pap" ||
      (data.role === "gerente" && souGerenteRegional);
    const gerenteId = precisaGestor ? (data.gerente_id ?? null) : null;
    const ok = await canManage(supabase, userId, data.role as Role, gerenteId);
    if (!ok) throw new Error("Sem permissão para criar este tipo de acesso.");
    if (data.role === "lider_pap" && !gerenteId && !souGerenteRegional) {
      throw new Error("O Líder PAP precisa estar vinculado a um Gerente.");
    }

    // Gerente / Líder PAP / Gerente Regional criando subordinado vincula a si mesmo
    const gerenteFinal =
      precisaGestor &&
      (souGerenteRegional || rs.includes("gerente") || rs.includes("lider_pap")) &&
      !rs.includes("regional") &&
      !rs.includes("admin")
        ? (data.role === "gerente" ? userId : (gerenteId ?? userId))
        : gerenteId;



    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome, canal: data.canal ?? "loja" },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Falha ao criar usuário");
    }
    const newId = created.data.user.id;

    await supabaseAdmin
      .from("profiles")
      .update({
        nome: data.nome,
        canal: data.canal ?? "loja",
        loja_unidade: data.canal === "loja" ? (data.loja_unidade ?? null) : null,
        gerente_id: gerenteFinal,
        data_nascimento: data.data_nascimento ?? null,
      })
      .eq("id", newId);

    // Ajustar role — o trigger cria como consultor
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });

    return { id: newId };
  });

const updateSchema = z.object({
  user_id: z.string().uuid(),
  nome: z.string().trim().min(2).max(120).optional(),
  canal: z.enum(["loja", "pap"]).optional(),
  loja_unidade: z.string().trim().min(1).max(60).nullable().optional(),
  ativo: z.boolean().optional(),
  gerente_id: z.string().uuid().nullable().optional(),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  role: z.enum(["regional", "gerente_regional", "gerente", "lider_pap", "consultor"]).optional(),
});

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: target } = await supabase
      .from("profiles")
      .select("gerente_id")
      .eq("id", data.user_id)
      .maybeSingle();
    const { data: targetRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    const currentRole = ((targetRoles ?? [])[0]?.role ?? "consultor") as Role;
    const ok = await canManage(
      supabase,
      userId,
      currentRole,
      target?.gerente_id ?? null,
      data.user_id,
    );

    if (!ok) throw new Error("Sem permissão para editar este acesso.");

    const patch: any = {};
    if (data.nome !== undefined) patch.nome = data.nome;
    if (data.canal !== undefined) patch.canal = data.canal;
    if (data.loja_unidade !== undefined)
      patch.loja_unidade = data.canal === "pap" ? null : data.loja_unidade;
    if (data.ativo !== undefined) patch.ativo = data.ativo;
    if (data.gerente_id !== undefined) patch.gerente_id = data.gerente_id;
    if (data.data_nascimento !== undefined) patch.data_nascimento = data.data_nascimento;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }
    if (data.role && data.role !== currentRole) {
      if (data.user_id === userId) throw new Error("Você não pode alterar o próprio cargo.");
      if (
        !(await canManage(supabase, userId, data.role, target?.gerente_id ?? null, data.user_id))
      ) {
        throw new Error("Sem permissão para alterar o tipo de acesso.");
      }
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    }

    return { ok: true };
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: target } = await supabase
      .from("profiles")
      .select("gerente_id")
      .eq("id", data.user_id)
      .maybeSingle();
    const { data: targetRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    const currentRole = ((targetRoles ?? [])[0]?.role ?? "consultor") as Role;
    if (data.user_id === userId) throw new Error("Você não pode excluir a si mesmo.");
    const ok = await canManage(
      supabase,
      userId,
      currentRole,
      target?.gerente_id ?? null,
      data.user_id,
    );

    if (!ok) throw new Error("Sem permissão para excluir este acesso.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTeamMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rs = await getRoles(supabase, userId);
    const master = rs.includes("admin") || rs.includes("regional");
    const regionalEscopo =
      rs.includes("gerente_regional") && (await isGestorDe(supabase, userId, data.user_id));
    if (!master && !regionalEscopo) {
      throw new Error("Sem permissão para redefinir a senha deste usuário.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
