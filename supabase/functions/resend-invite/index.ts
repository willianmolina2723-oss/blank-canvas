import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { renderInviteEmail } from "../_shared/email-templates/invite.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://sistemasaph.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verificar admin / super_admin
    const { data: isSuper } = await admin.from("super_admins").select("id").eq("user_id", user.id).maybeSingle();
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!isSuper && !roleRow) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, full_name, email, empresa_id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!profile?.email) return new Response(JSON.stringify({ error: "Usuário sem e-mail" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // Validação cross-empresa para admin (não super)
    if (!isSuper) {
      const { data: meProfile } = await admin.from("profiles").select("empresa_id").eq("user_id", user.id).maybeSingle();
      if (!meProfile?.empresa_id || meProfile.empresa_id !== profile.empresa_id) {
        return new Response(JSON.stringify({ error: "Sem permissão sobre esse usuário" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Gerar link de definição de senha (recovery serve para set/reset)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
      options: { redirectTo: `${APP_URL}/reset-password` },
    });

    if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("profiles").update({ must_change_password: true }).eq("user_id", user_id);

    const { subject, html } = renderInviteEmail({
      fullName: profile.full_name || "Usuário",
      email: profile.email,
      setupUrl: linkData?.properties?.action_link,
      appUrl: APP_URL,
      isResend: true,
    });

    const { data: sendRes } = await admin.functions.invoke("send-email", {
      body: {
        type: "resend_invite",
        to: profile.email,
        subject, html,
        user_id,
        empresa_id: profile.empresa_id,
      },
    });

    // Atualizar user_invites
    await admin.from("user_invites").upsert({
      user_id,
      empresa_id: profile.empresa_id,
      invite_status: "pending",
      last_sent_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ success: true, send: sendRes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
