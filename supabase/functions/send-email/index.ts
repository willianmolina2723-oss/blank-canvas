import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "SAPH <no-reply@sistemasaph.com.br>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SendPayload {
  type: "invite" | "password_reset" | "opportunity" | "resend_invite";
  to: string;
  subject: string;
  html: string;
  user_id?: string | null;
  empresa_id?: string | null;
  metadata?: Record<string, unknown>;
}

async function sendViaResend(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Resend ${res.status}`);
  }
  return data?.id as string | undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as SendPayload;
    if (!payload?.to || !payload?.subject || !payload?.html || !payload?.type) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // log pending
    const { data: log } = await admin
      .from("email_logs")
      .insert({
        recipient_email: payload.to,
        type: payload.type,
        subject: payload.subject,
        status: "pending",
        user_id: payload.user_id ?? null,
        empresa_id: payload.empresa_id ?? null,
        metadata: payload.metadata ?? {},
      })
      .select("id")
      .single();

    const logId = log?.id;

    try {
      const providerId = await sendViaResend(payload.to, payload.subject, payload.html);
      if (logId) {
        await admin.from("email_logs").update({
          status: "sent", provider_id: providerId ?? null,
        }).eq("id", logId);
      }
      return new Response(JSON.stringify({ success: true, log_id: logId, provider_id: providerId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      if (logId) {
        await admin.from("email_logs").update({
          status: "failed", error_message: msg,
        }).eq("id", logId);
      }
      return new Response(JSON.stringify({ success: false, error: msg, log_id: logId }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
