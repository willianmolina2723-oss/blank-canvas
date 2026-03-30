import { supabase } from '@/integrations/supabase/client';

export interface Recording {
  id: string;
  event_id: string;
  user_id: string;
  video_type: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  video_url: string | null;
  file_hash: string | null;
  file_size_bytes: number | null;
  status: string;
  device_info: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const RECORDING_SETUP_MESSAGE = 'Infraestrutura de vídeos ainda não configurada no servidor. Contate o administrador.';

export function isRecordingSetupError(message?: string | null) {
  if (!message) return false;

  const patterns = [
    'event_recordings',
    'schema cache',
    'Bucket not found',
    'checklist-videos',
    'The resource was not found',
    'relation',
    'NOTIFY pgrst',
    'Tabela public.event_recordings',
  ];

  return patterns.some((pattern) => message.includes(pattern));
}

async function extractFunctionErrorMessage(error: unknown) {
  const response = (error as { context?: Response } | null)?.context;

  if (response) {
    try {
      const payload = await response.clone().json() as { error?: string };
      if (payload?.error) return payload.error;
    } catch {
      try {
        const text = await response.clone().text();
        if (text) return text;
      } catch {
        // ignore
      }
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return 'Falha ao executar a edge function de gravação.';
}

export async function invokeManageRecording<T>(body: FormData | Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-recording', { body });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  if (!data) {
    throw new Error('A edge function retornou uma resposta vazia.');
  }

  if (data.success === false) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao processar a gravação.');
  }

  return data as T;
}