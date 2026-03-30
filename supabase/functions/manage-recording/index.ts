import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SETUP_REQUIRED_MESSAGE = 'Tabela public.event_recordings ou bucket checklist-videos não configurados. Execute o SQL de setup antes de gravar vídeos.'

function isMissingRelationError(message?: string | null) {
  return !!message && (
    message.includes("Could not find the table 'public.event_recordings' in the schema cache") ||
    message.includes('relation "public.event_recordings" does not exist') ||
    message.includes('relation "event_recordings" does not exist')
  )
}

async function ensureRecordingTableExists(supabaseAdmin: ReturnType<typeof createClient>) {
  const { error } = await supabaseAdmin
    .from('event_recordings')
    .select('id', { count: 'exact', head: true })

  if (isMissingRelationError(error?.message)) {
    throw new Error(SETUP_REQUIRED_MESSAGE)
  }

  if (error) throw new Error(error.message)
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
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) throw new Error('Não autorizado')

    const body = await req.json()
    const { action } = body

    await ensureRecordingTableExists(supabaseAdmin)

    // Get caller profile
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, empresa_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!callerProfile) throw new Error('Perfil não encontrado')

    if (action === 'start') {
      const { event_id, video_type, device_info, latitude, longitude } = body
      if (!event_id || !video_type) throw new Error('event_id e video_type são obrigatórios')

      const now = new Date().toISOString()

      const { data, error } = await supabaseAdmin
        .from('event_recordings')
        .insert({
          event_id,
          user_id: user.id,
          profile_id: callerProfile.id,
          empresa_id: callerProfile.empresa_id,
          video_type,
          started_at: now,
          device_info: device_info || null,
          latitude: latitude || null,
          longitude: longitude || null,
          status: 'recording',
        })
        .select('id, started_at')
        .single()

      if (isMissingRelationError(error?.message)) throw new Error(SETUP_REQUIRED_MESSAGE)
      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({ recording: data, server_time: now }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'finish') {
      const { recording_id, video_url, file_hash, file_size_bytes } = body
      if (!recording_id) throw new Error('recording_id é obrigatório')

      // Get the recording to calculate duration
      const { data: rec } = await supabaseAdmin
        .from('event_recordings')
        .select('started_at, user_id')
        .eq('id', recording_id)
        .single()

      if (!rec) throw new Error('Gravação não encontrada')
      if (rec.user_id !== user.id) throw new Error('Sem permissão')

      const now = new Date()
      const startedAt = new Date(rec.started_at)
      const durationSeconds = Math.round((now.getTime() - startedAt.getTime()) / 1000)

      const { data, error } = await supabaseAdmin
        .from('event_recordings')
        .update({
          ended_at: now.toISOString(),
          duration_seconds: durationSeconds,
          video_url: video_url || null,
          file_hash: file_hash || null,
          file_size_bytes: file_size_bytes || null,
          status: 'completed',
        })
        .eq('id', recording_id)
        .select()
        .single()

      if (isMissingRelationError(error?.message)) throw new Error(SETUP_REQUIRED_MESSAGE)
      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({ recording: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list') {
      const { event_id } = body
      if (!event_id) throw new Error('event_id é obrigatório')

      const { data, error } = await supabaseAdmin
        .from('event_recordings')
        .select('*')
        .eq('event_id', event_id)
        .order('created_at', { ascending: true })

      if (isMissingRelationError(error?.message)) throw new Error(SETUP_REQUIRED_MESSAGE)
      if (error) throw new Error(error.message)

      return new Response(JSON.stringify({ recordings: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      const { recording_id } = body
      if (!recording_id) throw new Error('recording_id é obrigatório')

      // Only admins can delete
      const { data: isAdmin } = await supabaseAdmin.rpc('is_admin')
      const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin')
      
      // Check admin via user_roles table directly
      const { data: adminRole } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle()

      const { data: superAdmin } = await supabaseAdmin
        .from('super_admins')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!adminRole && !superAdmin) {
        throw new Error('Apenas administradores podem deletar gravações')
      }

      // Get recording to delete file from storage
      const { data: rec } = await supabaseAdmin
        .from('event_recordings')
        .select('video_url')
        .eq('id', recording_id)
        .single()

      if (rec?.video_url) {
        // Extract path from URL
        const urlParts = rec.video_url.split('/checklist-videos/')
        if (urlParts[1]) {
          await supabaseAdmin.storage.from('checklist-videos').remove([urlParts[1]])
        }
      }

      const { error } = await supabaseAdmin
        .from('event_recordings')
        .delete()
        .eq('id', recording_id)

      if (isMissingRelationError(error?.message)) throw new Error(SETUP_REQUIRED_MESSAGE)
      if (error) throw new Error(error.message)

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
