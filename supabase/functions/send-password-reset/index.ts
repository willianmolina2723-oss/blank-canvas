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

  const generic = (cooldownSeconds = 0) => new Response(JSON.stringify({
    success: true,
    cooldown_seconds: cooldownSeconds,
    message: cooldownSeconds > 0
      ? "Se este e-mail estiver cadastrado, aguarde alguns minutos antes de solicitar um novo link de redefinição."
      : "Se este e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") return generic();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit: 3 tentativas / hora por email+ip
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentAttempts } = await admin
      .from("password_reset_attempts")
      .select("created_at")
      .eq("email", normalizedEmail)
      .eq("ip", ip)
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: true })
      .limit(3);

    if ((recentAttempts?.length ?? 0) >= 3) {
      const oldestAttempt = new Date(recentAttempts![0].created_at).getTime();
      const retryAfterSeconds = Math.max(60, Math.ceil((oldestAttempt + 60 * 60 * 1000 - Date.now()) / 1000));
      return generic(retryAfterSeconds);
    }

    await admin.from("password_reset_attempts").insert({
      email: normalizedEmail, ip,
    });

    // Buscar usuário
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, full_name, email")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (!profile?.user_id) return generic();

    // Gerar link de recovery
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${APP_URL}/reset-password` },
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("generateLink error:", linkErr);
      return generic();
    }

    const resetUrl = `${APP_URL}/reset-password?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=recovery`;

    const { subject, html } = renderPasswordResetEmail({
      fullName: profile.full_name,
      resetUrl,
    });

    const { data: sendData, error: sendError } = await admin.functions.invoke("send-email", {
      body: {
        type: "password_reset",
        to: normalizedEmail,
        subject,
        html,
        user_id: profile.user_id,
      },
    });

    if (sendError || sendData?.success === false) {
      console.error("send-email error", sendError ?? sendData);
    }

    return generic();
  } catch (e) {
    console.error("send-password-reset error", e);
    return generic();
  }
});
