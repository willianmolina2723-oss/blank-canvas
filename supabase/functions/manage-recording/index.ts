import { createClient, type User } from 'npm:@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'

const VIDEO_BUCKET = 'checklist-videos'
const SCHEMA_RELOAD_HINT = "NOTIFY pgrst, 'reload schema';"

type RecordingStatus = 'recording' | 'completed' | 'failed'

type RecordingRow = {
  id: string
  event_id: string
  user_id: string
  profile_id: string | null
  empresa_id: string | null
  video_type: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  video_url: string | null
  file_hash: string | null
  file_size_bytes: number | null
  status: RecordingStatus
  device_info: string | null
  latitude: number | null
  longitude: number | null
}

type BasePayload = { action?: unknown }

type ListPayload = {
  action: 'list'
  event_id: string
}

type StartPayload = {
  action: 'start'
  event_id: string
  video_type: string
  device_info?: string | null
  latitude?: number | null
  longitude?: number | null
}

type FinishPayload = {
  action: 'finish'
  recording_id: string
  video_url?: string | null
  file_hash?: string | null
  file_size_bytes?: number | null
  duration_seconds?: number | null
  video_file?: Blob | null
}

type DeletePayload = {
  action: 'delete'
  recording_id: string
}

type RecordingPayload = ListPayload | StartPayload | FinishPayload | DeletePayload
type SupabaseAdminClient = ReturnType<typeof createAdminClient>

function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios na edge function.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function errorResponse(message: string, status = 400, details?: unknown) {
  console.error('manage-recording error:', { message, details })

  return jsonResponse(
    {
      success: false,
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    status,
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Erro desconhecido'
}

function isSchemaCacheError(error: unknown) {
  const message = getErrorMessage(error)
  return (
    message.includes("Could not find the table 'public.event_recordings' in the schema cache") ||
    message.includes('relation "public.event_recordings" does not exist') ||
    message.includes('relation "event_recordings" does not exist')
  )
}

function schemaCacheMessage() {
  return `Tabela public.event_recordings não encontrada no schema cache do Supabase. Confirme que ela existe e rode ${SCHEMA_RELOAD_HINT}`
}

function normalizeDatabaseError(error: unknown) {
  return isSchemaCacheError(error) ? schemaCacheMessage() : getErrorMessage(error)
}

function parseNumber(value: FormDataEntryValue | null) {
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseNullableString(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isBlobLike(value: unknown): value is Blob {
  return value instanceof Blob
}

async function parseRequestPayload(req: Request): Promise<RecordingPayload> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const videoFile = formData.get('video_file')
    const action = formData.get('action')

    if (action === 'finish') {
      return {
        action: 'finish',
        recording_id: String(formData.get('recording_id') || ''),
        video_url: parseNullableString(formData.get('video_url')),
        file_hash: parseNullableString(formData.get('file_hash')),
        file_size_bytes: parseNumber(formData.get('file_size_bytes')),
        duration_seconds: parseNumber(formData.get('duration_seconds')),
        video_file: isBlobLike(videoFile) ? videoFile : null,
      }
    }

    return { action } as BasePayload as RecordingPayload
  }

  const body = (await req.json().catch(() => ({}))) as BasePayload
  return body as RecordingPayload
}

function validatePayload(payload: RecordingPayload) {
  switch (payload.action) {
    case 'list':
      return payload.event_id ? null : 'event_id é obrigatório'
    case 'start':
      if (!payload.event_id) return 'event_id é obrigatório'
      if (!payload.video_type || typeof payload.video_type !== 'string') return 'video_type é obrigatório'
      return null
    case 'finish':
      if (!payload.recording_id) return 'recording_id é obrigatório'
      if (!payload.video_file && !payload.video_url) {
        return 'Envie video_file ou video_url para finalizar a gravação'
      }
      return null
    case 'delete':
      return payload.recording_id ? null : 'recording_id é obrigatório'
    default:
      return `Ação inválida: ${String(payload.action)}`
  }
}

async function authenticateRequest(supabase: SupabaseAdminClient, req: Request): Promise<User> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Não autorizado')
  }

  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    console.error('manage-recording auth error:', error)
    throw new Error('Não autorizado')
  }

  return user
}

async function getProfile(supabase: SupabaseAdminClient, userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, empresa_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Perfil não encontrado')
  return data
}

async function isAdminUser(supabase: SupabaseAdminClient, userId: string) {
  const [{ data: adminRole, error: roleError }, { data: superAdmin, error: superAdminError }] = await Promise.all([
    supabase.from('user_roles').select('id').eq('user_id', userId).eq('role', 'admin').maybeSingle(),
    supabase.from('super_admins').select('id').eq('user_id', userId).maybeSingle(),
  ])

  if (roleError) throw new Error(roleError.message)
  if (superAdminError) throw new Error(superAdminError.message)

  return Boolean(adminRole || superAdmin)
}

async function assertEventAccess(supabase: SupabaseAdminClient, eventId: string, userId: string) {
  if (await isAdminUser(supabase, userId)) return

  const profile = await getProfile(supabase, userId)
  const { data, error } = await supabase
    .from('event_participants')
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', profile.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Sem permissão para acessar gravações deste evento')
}

async function ensureRecordingsTableAvailable(supabase: SupabaseAdminClient) {
  const { error } = await supabase
    .from('event_recordings')
    .select('*', { head: true, count: 'exact' })
    .limit(1)

  if (error) {
    console.error('manage-recording table validation error:', error)
    throw new Error(normalizeDatabaseError(error))
  }
}

async function ensureVideoBucketAvailable(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase.storage.getBucket(VIDEO_BUCKET)

  if (error || !data) {
    console.error('manage-recording bucket validation error:', error)
    throw new Error(`Bucket ${VIDEO_BUCKET} não encontrado. Crie o bucket no Supabase Storage antes de gravar vídeos.`)
  }
}

function calculateDurationSeconds(startedAt: string, explicitDuration?: number | null) {
  if (typeof explicitDuration === 'number' && Number.isFinite(explicitDuration) && explicitDuration >= 0) {
    return Math.round(explicitDuration)
  }

  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000))
}

function getStoragePathFromVideoUrl(videoUrl: string | null) {
  if (!videoUrl) return null

  const bucketMarker = `/${VIDEO_BUCKET}/`
  if (videoUrl.includes(bucketMarker)) {
    const [, path] = videoUrl.split(bucketMarker)
    return path || null
  }

  if (videoUrl.startsWith(`${VIDEO_BUCKET}/`)) {
    return videoUrl.slice(VIDEO_BUCKET.length + 1)
  }

  return videoUrl.startsWith('http') ? null : videoUrl.replace(/^\/+/, '')
}

async function uploadVideo(supabase: SupabaseAdminClient, recording: RecordingRow, videoFile: Blob) {
  const filePath = `${recording.event_id}/${recording.user_id}/${Date.now()}.mp4`

  const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(filePath, videoFile, {
    contentType: videoFile.type || 'video/mp4',
    upsert: true,
  })

  if (error) {
    console.error('manage-recording upload error:', error)
    throw new Error(`Falha no upload do vídeo: ${error.message}`)
  }

  const { data } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

async function listRecordings(supabase: SupabaseAdminClient, user: User, payload: ListPayload) {
  await ensureRecordingsTableAvailable(supabase)
  await assertEventAccess(supabase, payload.event_id, user.id)

  const { data, error } = await supabase
    .from('event_recordings')
    .select('*')
    .eq('event_id', payload.event_id)
    .order('started_at', { ascending: true })

  if (error) throw new Error(normalizeDatabaseError(error))

  return jsonResponse({ success: true, recordings: (data || []) as RecordingRow[] })
}

async function startRecording(supabase: SupabaseAdminClient, user: User, payload: StartPayload) {
  await ensureRecordingsTableAvailable(supabase)
  await assertEventAccess(supabase, payload.event_id, user.id)

  const profile = await getProfile(supabase, user.id)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('event_recordings')
    .insert({
      event_id: payload.event_id,
      user_id: user.id,
      profile_id: profile.id,
      empresa_id: profile.empresa_id,
      video_type: payload.video_type,
      started_at: now,
      status: 'recording',
      device_info: payload.device_info || null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
    })
    .select('*')
    .single()

  if (error) throw new Error(normalizeDatabaseError(error))

  return jsonResponse({ success: true, recording: data as RecordingRow, server_time: now })
}

async function finishRecording(supabase: SupabaseAdminClient, user: User, payload: FinishPayload) {
  await ensureRecordingsTableAvailable(supabase)

  const { data: existingRecording, error: existingError } = await supabase
    .from('event_recordings')
    .select('*')
    .eq('id', payload.recording_id)
    .single()

  if (existingError) throw new Error(normalizeDatabaseError(existingError))

  const recording = existingRecording as RecordingRow
  const isAdmin = await isAdminUser(supabase, user.id)

  if (recording.user_id !== user.id && !isAdmin) {
    return errorResponse('Sem permissão para finalizar esta gravação', 403)
  }

  let videoUrl = payload.video_url || recording.video_url

  if (payload.video_file) {
    await ensureVideoBucketAvailable(supabase)
    videoUrl = await uploadVideo(supabase, recording, payload.video_file)
  }

  if (!videoUrl) {
    return errorResponse('Nenhum vídeo foi enviado para finalizar a gravação', 400)
  }

  const endedAt = new Date().toISOString()
  const durationSeconds = calculateDurationSeconds(recording.started_at, payload.duration_seconds)

  const { data, error } = await supabase
    .from('event_recordings')
    .update({
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      video_url: videoUrl,
      file_hash: payload.file_hash || null,
      file_size_bytes: payload.file_size_bytes ?? null,
      status: 'completed',
    })
    .eq('id', payload.recording_id)
    .select('*')
    .single()

  if (error) throw new Error(normalizeDatabaseError(error))

  return jsonResponse({ success: true, recording: data as RecordingRow })
}

async function deleteRecording(supabase: SupabaseAdminClient, user: User, payload: DeletePayload) {
  await ensureRecordingsTableAvailable(supabase)

  if (!(await isAdminUser(supabase, user.id))) {
    return errorResponse('Apenas administradores podem deletar gravações', 403)
  }

  const { data: recording, error: recordingError } = await supabase
    .from('event_recordings')
    .select('id, video_url')
    .eq('id', payload.recording_id)
    .single()

  if (recordingError) throw new Error(normalizeDatabaseError(recordingError))

  const storagePath = getStoragePathFromVideoUrl(recording.video_url)
  if (storagePath) {
    const { error: bucketError } = await supabase.storage.from(VIDEO_BUCKET).remove([storagePath])
    if (bucketError) {
      console.error('manage-recording storage delete warning:', bucketError)
    }
  }

  const { error } = await supabase
    .from('event_recordings')
    .delete()
    .eq('id', payload.recording_id)

  if (error) throw new Error(normalizeDatabaseError(error))

  return jsonResponse({ success: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido', 405)
  }

  try {
    const supabase = createAdminClient()
    const user = await authenticateRequest(supabase, req)
    const payload = await parseRequestPayload(req)
    const validationError = validatePayload(payload)

    if (validationError) {
      return errorResponse(validationError, 400)
    }

    switch (payload.action) {
      case 'list':
        return await listRecordings(supabase, user, payload)
      case 'start':
        return await startRecording(supabase, user, payload)
      case 'finish':
        return await finishRecording(supabase, user, payload)
      case 'delete':
        return await deleteRecording(supabase, user, payload)
      default:
        return errorResponse(`Ação inválida: ${String((payload as BasePayload).action)}`, 400)
    }
  } catch (error) {
    console.error('manage-recording fatal error:', error)
    return errorResponse(normalizeDatabaseError(error), 400)
  }
})
