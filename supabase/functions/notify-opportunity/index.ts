import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { renderOpportunityEmail } from "../_shared/email-templates/opportunity.ts";

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

    const { data: isSuper } = await admin.from("super_admins").select("id").eq("user_id", user.id).maybeSingle();
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!isSuper && !roleRow) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { opportunity_id } = await req.json();
    if (!opportunity_id) return new Response(JSON.stringify({ error: "opportunity_id obrigatório" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { data: opp } = await admin
      .from("opportunities")
      .select("*")
      .eq("id", opportunity_id)
      .maybeSingle();

    if (!opp) return new Response(JSON.stringify({ error: "Oportunidade não encontrada" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // Buscar usuários elegíveis: mesma empresa, ativos
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, full_name, email, empresa_id")
      .eq("empresa_id", opp.empresa_id)
      .is("deleted_at", null)
      .not("email", "is", null);

    const recipients = (profiles || []).filter((p) => p.email);

    const results = await Promise.allSettled(
      recipients.slice(0, 50).map(async (p) => {
        const { subject, html } = renderOpportunityEmail({
          fullName: p.full_name,
          title: opp.title,
          location: opp.location,
          eventDate: opp.event_date,
          startTime: opp.start_time,
          endTime: opp.end_time,
          description: opp.description,
          rolesNeeded: opp.roles_needed,
          appUrl: APP_URL,
        });
        return admin.functions.invoke("send-email", {
          body: {
            type: "opportunity",
            to: p.email,
            subject, html,
            user_id: p.user_id,
            empresa_id: opp.empresa_id,
            metadata: { opportunity_id },
          },
        });
      })
    );

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;

    return new Response(JSON.stringify({ success: true, sent: ok, failed, total: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
