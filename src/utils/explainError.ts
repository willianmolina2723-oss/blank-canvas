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
  const lower = msg.toLowerCase();

  // Auth / usuários
  if (
    lower.includes('user already registered') ||
    lower.includes('already been registered') ||
    lower.includes('email address has already been registered') ||
    lower.includes('email_exists') ||
    lower.includes('user_already_exists') ||
    lower.includes('a user with this email')
  ) {
    return 'Já existe um usuário cadastrado com este email.';
  }
  if (lower.includes('invalid email') || lower.includes('email_address_invalid')) {
    return 'Email inválido. Verifique o endereço informado.';
  }
  if (lower.includes('signup is disabled') || lower.includes('signups not allowed')) {
    return 'Cadastro de novos usuários está desabilitado no momento.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }
  if (lower.includes('user not found')) {
    return 'Usuário não encontrado.';
  }
  if (msg.includes('row-level security policy') || lower.includes('permission denied')) {
    return 'Sem permissão para esta operação. Verifique se você está escalado no evento ou se tem a função necessária.';
  }
  if (lower.includes('jwt expired') || lower.includes('token is expired') || lower.includes('jwt is invalid')) {
    return 'Sua sessão expirou. Faça login novamente.';
  }
  if (lower.includes('not authenticated') || lower.includes('unauthorized') || lower.includes('not authorized')) {
    return 'Você não está autenticado. Faça login novamente.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Email ou senha incorretos.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email ainda não confirmado. Verifique sua caixa de entrada.';
  }
  if (lower.includes('password') && (lower.includes('leaked') || lower.includes('pwned') || lower.includes('compromised') || lower.includes('data breach') || lower.includes('hibp'))) {
    return 'Esta senha foi encontrada em vazamentos de dados conhecidos. Por segurança, escolha uma senha diferente que nunca foi exposta.';
  }
  if (lower.includes('password should be at least') || lower.includes('password is too short')) {
    return 'A senha deve ter no mínimo 8 caracteres, incluindo letras e números.';
  }
  if (lower.includes('new password should be different') || lower.includes('same password')) {
    return 'A nova senha deve ser diferente da senha atual.';
  }

  // Postgres / banco
  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return 'Este registro já existe. Verifique os dados e tente novamente.';
  }
  if (lower.includes('foreign key constraint') || lower.includes('violates foreign key')) {
    return 'Não é possível remover este registro pois existem dados vinculados a ele.';
  }
  if (lower.includes('violates not-null') || lower.includes('null value in column')) {
    return 'Há campos obrigatórios não preenchidos.';
  }
  if (lower.includes('violates check constraint')) {
    return 'Os dados informados não atendem às regras de validação.';
  }
  if (lower.includes('value too long')) {
    return 'Um dos campos excede o tamanho máximo permitido.';
  }
  if (lower.includes('invalid input syntax')) {
    return 'Formato de dado inválido em um dos campos.';
  }
  if (lower.includes('relation') && lower.includes('does not exist')) {
    return 'Recurso não encontrado no servidor. Contate o administrador.';
  }
  if (lower.includes('column') && lower.includes('does not exist')) {
    return 'Configuração do servidor desatualizada. Recarregue a página.';
  }

  // Storage
  if (lower.includes('bucket not found') || lower.includes('the resource was not found')) {
    return 'Armazenamento não configurado no servidor. Contate o administrador.';
  }
  if (lower.includes('payload too large') || lower.includes('file size')) {
    return 'Arquivo muito grande. Reduza o tamanho e tente novamente.';
  }
  if (lower.includes('mime type') || lower.includes('invalid file type')) {
    return 'Tipo de arquivo não permitido.';
  }

  // Edge Functions
  if (lower.includes('non-2xx status code') || lower.includes('functionshttperror')) {
    return 'O servidor recusou a operação. Verifique os dados e tente novamente.';
  }
  if (lower.includes('functionsfetcherror') || lower.includes('failed to send')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
  }

  // Rede
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'A operação demorou demais para responder. Tente novamente.';
  }

  return msg;
}
