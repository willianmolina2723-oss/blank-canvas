import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Minimal Web Push implementation using VAPID
async function importKey(pem: string) {
  const b64 = pem.replace(/-+BEGIN[^-]+-+/, '').replace(/-+END[^-]+-+/, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createVapidJwt(audience: string, subject: string, privateKey: CryptoKey): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: subject };

  const enc = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(unsigned));
  // Convert DER signature to raw r||s (64 bytes)
  const derSig = new Uint8Array(sig);
  let r: Uint8Array, s: Uint8Array;
  if (derSig[0] === 0x30) {
    // DER encoded
    const rLen = derSig[3];
    const rStart = 4;
    r = derSig.slice(rStart, rStart + rLen);
    const sLen = derSig[rStart + rLen + 1];
    const sStart = rStart + rLen + 2;
    s = derSig.slice(sStart, sStart + sLen);
  } else {
    // Already raw
    r = derSig.slice(0, 32);
    s = derSig.slice(32, 64);
  }
  // Pad/trim to exactly 32 bytes each
  const pad = (a: Uint8Array) => {
    if (a.length === 32) return a;
    if (a.length > 32) return a.slice(a.length - 32);
    const p = new Uint8Array(32);
    p.set(a, 32 - a.length);
    return p;
  };
  const rawSig = new Uint8Array(64);
  rawSig.set(pad(r), 0);
  rawSig.set(pad(s), 32);

  return `${unsigned}.${uint8ArrayToBase64Url(rawSig)}`;
}

async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: CryptoKey
): Promise<Response> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await createVapidJwt(audience, 'mailto:noreply@saph.app', vapidPrivateKey);

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body: new TextEncoder().encode(payload),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, body, user_ids, data } = await req.json();

    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKeyPem = Deno.env.get("VAPID_PRIVATE_KEY")!;

    let vapidPrivateKey: CryptoKey;
    try {
      vapidPrivateKey = await importKey(vapidPrivateKeyPem);
    } catch (e) {
      console.error("Failed to import VAPID private key:", e);
      // Fallback: try as raw base64url
      const raw = urlBase64ToUint8Array(vapidPrivateKeyPem);
      vapidPrivateKey = await crypto.subtle.importKey(
        'pkcs8', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
      );
    }

    // Get subscriptions
    let query = supabase.from("push_subscriptions").select("*");
    if (user_ids && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    }
    const { data: subscriptions, error } = await query;

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body, icon: "/icons/icon-192x192.png", badge: "/icons/icon-72x72.png", data });

    let sent = 0;
    const failed: string[] = [];

    for (const sub of subscriptions) {
      try {
        const res = await sendWebPush(sub.endpoint, sub.p256dh, sub.auth, payload, vapidPublicKey, vapidPrivateKey);
        if (res.ok || res.status === 201) {
          sent++;
        } else if (res.status === 404 || res.status === 410) {
          // Subscription expired, remove it
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          console.log(`Removed expired subscription for user ${sub.user_id}`);
        } else {
          console.error(`Push failed for ${sub.user_id}: ${res.status} ${await res.text()}`);
          failed.push(sub.user_id);
        }
      } catch (e) {
        console.error(`Push error for ${sub.user_id}:`, e);
        failed.push(sub.user_id);
      }
    }

    return new Response(JSON.stringify({ sent, total: subscriptions.length, failed: failed.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Push notification error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
