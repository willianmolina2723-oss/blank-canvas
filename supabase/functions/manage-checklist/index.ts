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

    const body = await req.json()
    const { action, event_id, item_type, items, include_cost_items, cost_items_category } = body

    if (!event_id || !item_type) throw new Error('event_id e item_type são obrigatórios')

    // Get caller's empresa_id
    const { data: callerProfile } = await supabaseAdmin.from('profiles').select('id, empresa_id').eq('user_id', caller.id).maybeSingle()
    const empresaId = callerProfile?.empresa_id

    if (action === 'load') {
      const { data: checklistItems, error } = await supabaseAdmin
        .from('checklist_items')
        .select('*')
        .eq('event_id', event_id)
        .eq('item_type', item_type)

      if (error) throw new Error(error.message)

      let costItems = null
      if (include_cost_items && cost_items_category) {
        const { data } = await supabaseAdmin
          .from('cost_items')
          .select('*')
          .eq('category', cost_items_category)
          .eq('is_active', true)
          .order('name')

        costItems = data
      }

      return new Response(JSON.stringify({ items: checklistItems || [], cost_items: costItems }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'save') {
      if (!items || !Array.isArray(items)) throw new Error('items é obrigatório')

      // Delete existing items for this event/type
      await supabaseAdmin
        .from('checklist_items')
        .delete()
        .eq('event_id', event_id)
        .eq('item_type', item_type)

      // Insert new items
      if (items.length > 0) {
        const inserts = items.map((item: any) => ({
          event_id,
          item_type,
          item_name: item.item_name || item.name,
          is_checked: item.is_checked || false,
          checked_by: item.is_checked ? callerProfile?.id : null,
          checked_at: item.is_checked ? new Date().toISOString() : null,
          notes: item.notes || null,
          cost_item_id: item.cost_item_id || null,
          empresa_id: empresaId,
        }))

        const { error } = await supabaseAdmin.from('checklist_items').insert(inserts)
        if (error) throw new Error(error.message)
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Ação inválida: ${action}`)
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
