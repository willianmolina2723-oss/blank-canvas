import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!caller) throw new Error('Não autorizado')

    const { event_id, new_status } = await req.json()
    if (!event_id || !new_status) throw new Error('event_id e new_status são obrigatórios')

    const validStatuses = ['ativo', 'em_andamento', 'finalizado', 'cancelado']
    if (!validStatuses.includes(new_status)) throw new Error(`Status inválido: ${new_status}`)

    const { error } = await supabaseAdmin.from('events').update({
      status: new_status,
      updated_at: new Date().toISOString(),
    }).eq('id', event_id)

    if (error) throw new Error(`Erro ao atualizar evento: ${error.message}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
