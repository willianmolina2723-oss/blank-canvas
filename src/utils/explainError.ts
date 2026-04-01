/**
 * Extracts a human-readable error message from any caught value.
 * Falls back to the provided default message if nothing useful is found.
 */
export function explainError(err: unknown, fallback = 'Erro desconhecido.'): string {
  if (!err) return fallback;

  // Supabase PostgREST / API errors come as plain objects with .message
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;

    // Supabase error shape: { message, code, details, hint }
    if (typeof obj.message === 'string' && obj.message) {
      return translateRlsError(obj.message);
    }

    // Error instances
    if (err instanceof Error) {
      return translateRlsError(err.message);
    }

    // Sometimes errors are nested: { error: { message } }
    if (typeof obj.error === 'string' && obj.error) {
      return translateRlsError(obj.error);
    }

    if (typeof obj.error === 'object' && obj.error !== null) {
      const nested = obj.error as Record<string, unknown>;
      if (typeof nested.message === 'string') {
        return translateRlsError(nested.message);
      }
    }
  }

  if (typeof err === 'string' && err) {
    return translateRlsError(err);
  }

  return fallback;
}

/**
 * Translates common Supabase/Postgres error messages to Portuguese.
 */
function translateRlsError(msg: string): string {
  if (msg.includes('row-level security policy')) {
    return 'Sem permissão para esta operação. Verifique se você está escalado no evento ou se tem a função necessária.';
  }
  if (msg.includes('JWT expired') || msg.includes('token is expired')) {
    return 'Sua sessão expirou. Faça login novamente.';
  }
  if (msg.includes('Invalid login credentials')) {
    return 'Email ou senha incorretos.';
  }
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return 'Este registro já existe. Verifique os dados e tente novamente.';
  }
  if (msg.includes('foreign key constraint') || msg.includes('violates foreign key')) {
    return 'Não é possível remover este registro pois existem dados vinculados a ele.';
  }
  if (msg.includes('Bucket not found') || msg.includes('The resource was not found')) {
    return 'Armazenamento não configurado no servidor. Contate o administrador.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }
  return msg;
}
