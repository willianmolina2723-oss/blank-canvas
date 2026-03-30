import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function createAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getUser(supabase: ReturnType<typeof createClient>, authHeader: string) {
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) throw new Error('Não autorizado')
  return user
}

async function getProfile(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id, empresa_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) throw new Error('Perfil não encontrado')
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabase = createAdmin()
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado' }, 401)

    const user = await getUser(supabase, authHeader)
    const body = await req.json()
    const { action } = body

    // ── LIST ──
    if (action === 'list') {
      const { event_id } = body
      if (!event_id) return json({ error: 'event_id é obrigatório' }, 400)

      const { data, error } = await supabase
        .from('event_recordings')
        .select('*')
        .eq('event_id', event_id)
        .order('created_at', { ascending: true })

      if (error) throw new Error(error.message)
      return json({ recordings: data || [] })
    }

    // ── START ──
    if (action === 'start') {
      const { event_id, video_type, device_info, latitude, longitude } = body
      if (!event_id || !video_type) return json({ error: 'event_id e video_type são obrigatórios' }, 400)

      const profile = await getProfile(supabase, user.id)
      const now = new Date().toISOString()

      const { data, error } = await supabase
        .from('event_recordings')
        .insert({
          event_id,
          user_id: user.id,
          profile_id: profile.id,
          empresa_id: profile.empresa_id,
          video_type,
          started_at: now,
          device_info: device_info || null,
          latitude: latitude || null,
          longitude: longitude || null,
          status: 'recording',
        })
        .select('id, started_at')
        .single()

      if (error) throw new Error(error.message)
      return json({ recording: data, server_time: now })
    }

    // ── FINISH ──
    if (action === 'finish') {
      const { recording_id, video_url, file_hash, file_size_bytes } = body
      if (!recording_id) return json({ error: 'recording_id é obrigatório' }, 400)

      const { data: rec } = await supabase
        .from('event_recordings')
        .select('started_at, user_id')
        .eq('id', recording_id)
        .single()

      if (!rec) return json({ error: 'Gravação não encontrada' }, 404)
      if (rec.user_id !== user.id) return json({ error: 'Sem permissão' }, 403)

      const now = new Date()
      const durationSeconds = Math.round((now.getTime() - new Date(rec.started_at).getTime()) / 1000)

      const { data, error } = await supabase
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

      if (error) throw new Error(error.message)
      return json({ recording: data })
    }

    // ── DELETE ──
    if (action === 'delete') {
      const { recording_id } = body
      if (!recording_id) return json({ error: 'recording_id é obrigatório' }, 400)

      // Check admin via user_roles or super_admins
      const [{ data: adminRole }, { data: superAdmin }] = await Promise.all([
        supabase.from('user_roles').select('id').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
        supabase.from('super_admins').select('id').eq('user_id', user.id).maybeSingle(),
      ])

      if (!adminRole && !superAdmin) return json({ error: 'Apenas administradores podem deletar gravações' }, 403)

      // Get recording to remove file from storage
      const { data: rec } = await supabase
        .from('event_recordings')
        .select('video_url')
        .eq('id', recording_id)
        .single()

      if (rec?.video_url) {
        const parts = rec.video_url.split('/checklist-videos/')
        if (parts[1]) {
          await supabase.storage.from('checklist-videos').remove([parts[1]])
        }
      }

      const { error } = await supabase
        .from('event_recordings')
        .delete()
        .eq('id', recording_id)

      if (error) throw new Error(error.message)
      return json({ success: true })
    }

    return json({ error: `Ação inválida: ${action}` }, 400)
  } catch (err: any) {
    console.error('manage-recording error:', err.message)
    return json({ error: err.message }, 400)
  }
})
