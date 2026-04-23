import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { renderPasswordResetEmail } from "../_shared/email-templates/password-reset.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://sistemasaph.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const generic = () => new Response(JSON.stringify({
    success: true,
    message: "Se este e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") return generic();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // Rate limit: 3 tentativas / hora por email+ip
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("password_reset_attempts")
      .select("*", { count: "exact", head: true })
      .eq("email", email.toLowerCase())
      .gte("created_at", oneHourAgo);

    if ((count ?? 0) >= 3) return generic();

    await admin.from("password_reset_attempts").insert({
      email: email.toLowerCase(), ip,
    });

    // Buscar usuário
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, full_name, email")
      .ilike("email", email)
      .maybeSingle();

    if (!profile?.user_id) return generic();

    // Gerar link de recovery
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${APP_URL}/reset-password` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("generateLink error:", linkErr);
      return generic();
    }

    const { subject, html } = renderPasswordResetEmail({
      fullName: profile.full_name,
      resetUrl: linkData.properties.action_link,
    });

    await admin.functions.invoke("send-email", {
      body: {
        type: "password_reset",
        to: email,
        subject,
        html,
        user_id: profile.user_id,
      },
    });

    return generic();
  } catch (e) {
    console.error("send-password-reset error", e);
    return generic();
  }
});
