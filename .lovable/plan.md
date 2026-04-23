

# Sistema de E-mails Transacionais SAPH (Resend + Supabase + Hostinger)

## Visão geral

Implementar envio de e-mails server-side via **Resend**, com domínio próprio configurado na **Hostinger**, cobrindo: convite de acesso, recuperação de senha, notificação de oportunidades e reenvio de convite. Logs completos no banco e painel admin para acompanhamento.

## Pré-requisitos do usuário

Antes de começar, você precisa:

1. **Criar conta no Resend** em https://resend.com (gratuito até 3.000 e-mails/mês)
2. **Gerar API Key** em Resend → API Keys (será adicionada como secret `RESEND_API_KEY`)
3. **Definir o domínio remetente** (ex: `notify.sistemasaph.com.br` ou `sistemasaph.com.br`)
4. **Acesso ao painel DNS da Hostinger** para adicionar registros SPF/DKIM/DMARC

A configuração DNS será documentada em um arquivo dentro do projeto.

## Arquitetura

```text
[Frontend React]
      │ (invoca via supabase.functions.invoke)
      ▼
[Edge Function: send-email]  ──► [Resend API]
      │  (sempre registra)
      ▼
[Tabela: email_logs]              [Tabela: user_invites]
      ▲                                   ▲
      │                                   │
[Triggers de negócio]:
 - create-user (já existe) → envia convite
 - reset-password (novo)   → envia link de reset
 - CreateOpportunityDialog → envia notificação aos elegíveis
 - resend-invite (novo)    → reenvia convite
```

## 1. Banco de dados (migration)

### Tabela `email_logs`
```text
id uuid PK
user_id uuid (nullable, FK lógica para profiles.user_id)
empresa_id uuid (nullable)
recipient_email text NOT NULL
type text NOT NULL  -- 'invite' | 'password_reset' | 'opportunity' | 'resend_invite'
subject text
status text NOT NULL  -- 'pending' | 'sent' | 'failed'
provider_id text  -- ID retornado pelo Resend
error_message text
metadata jsonb
created_at timestamptz default now()
```
RLS: super_admin vê tudo; admin vê da sua empresa; usuário vê só os próprios.

### Tabela `user_invites`
```text
id uuid PK
user_id uuid NOT NULL
empresa_id uuid
invite_status text  -- 'pending' | 'accepted' | 'expired'
sent_at timestamptz
last_sent_at timestamptz
accepted_at timestamptz
created_at timestamptz default now()
```

### Tabela `password_reset_attempts` (rate limit)
```text
email text
ip text
created_at timestamptz
```
Índice por `(email, created_at)` — máximo 3 tentativas/hora.

### Coluna nova em `profiles`
- `invite_status text default 'pending'` (preenche `accepted` no primeiro login bem-sucedido após `must_change_password = false`)

## 2. Secrets necessários

- `RESEND_API_KEY` — solicitarei via add_secret
- `EMAIL_FROM` — ex: `SAPH <no-reply@sistemasaph.com.br>` (configurável via secret)
- `APP_URL` — ex: `https://sistemasaph.com.br` (para montar links nos e-mails)

## 3. Edge Functions

### Nova: `send-email` (núcleo reutilizável)
- Recebe: `{ type, to, subject, html, user_id?, empresa_id?, metadata? }`
- Valida JWT do chamador (admin/super_admin para envios manuais; service-role para chamadas internas)
- Insere `email_logs` com `status='pending'`
- Chama Resend API
- Atualiza log para `sent` (com `provider_id`) ou `failed` (com `error_message`)
- Retorna `{ success, log_id }`

### Modificar: `create-user`
- Após criar usuário, chamar `send-email` com template **Convite**
- Inserir em `user_invites` com `sent_at = now()`
- Resposta inclui `email_sent: true|false`

### Nova: `send-password-reset`
- Recebe `{ email }` (público, sem auth)
- Aplica rate limit via `password_reset_attempts`
- Sempre retorna sucesso genérico (não revela se e-mail existe)
- Se existir, usa `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })` para gerar link seguro
- Envia e-mail via `send-email` com template **Recuperação**

### Nova: `resend-invite`
- Recebe `{ user_id }` (apenas admin/super_admin)
- Gera nova senha temporária OU link de definição via `generateLink({ type: 'invite' })`
- Atualiza `must_change_password = true`
- Atualiza `user_invites.last_sent_at`
- Envia e-mail via `send-email`

### Nova: `notify-opportunity`
- Recebe `{ opportunity_id }` (admin/super_admin)
- Busca usuários elegíveis (mesma `empresa_id`, `deleted_at IS NULL`, não suspensos, com role compatível)
- Para cada destinatário, chama `send-email` com template **Oportunidade**
- Pode ser chamada automaticamente após `INSERT` em `opportunities` (toggle no dialog)

## 4. Templates HTML (em `supabase/functions/_shared/email-templates/`)

Arquivos `.ts` exportando funções que retornam HTML inline-styled, responsivo, com:
- Cabeçalho com logo da empresa (busca `app-assets` bucket) ou nome SAPH
- Cores do design system (azul/verde SAPH)
- Botão CTA destacado
- Rodapé com aviso "este é um e-mail automático" + link de suporte

Templates:
1. `invite.ts` — saudação, e-mail de login, **link "Definir senha"** (preferido) + senha provisória de fallback, instrução de alterar no 1º login
2. `password-reset.ts` — link de redefinição com expiração (1h)
3. `opportunity.ts` — título, local, data, horário, resumo, botão "Ver oportunidade"
4. `resend-invite.ts` — variação do convite com aviso "reenvio"

## 5. Frontend

### `src/pages/ForgotPassword.tsx` (já existe — reformular)
- Form simples com campo e-mail
- Chama `send-password-reset` edge function
- Exibe mensagem genérica de sucesso sempre

### `src/pages/ResetPassword.tsx` (já existe)
- Verificar fluxo com link gerado pelo Supabase Auth (já compatível)

### `src/components/admin/CreateUserDialog.tsx`
- Após criar, exibir toast: "Usuário criado e e-mail enviado" ou erro com botão "Reenviar"

### `src/components/admin/UserAccessActions.tsx` (estender)
- Adicionar botão **"Reenviar convite"** (ícone Mail)
- Mostrar badge de status do convite: `Pendente` / `Ativo` / `Erro no envio`

### `src/components/opportunities/CreateOpportunityDialog.tsx`
- Adicionar checkbox **"Notificar usuários elegíveis por e-mail"** (default: ligado)
- Após criar, chama `notify-opportunity`

### Nova página: `src/pages/admin/EmailLogs.tsx`
- Tabela com filtros: tipo, status, data, destinatário
- Colunas: data, destinatário, tipo, assunto, status (badge colorido), erro
- Ação "Reenviar" para logs com status `failed`
- Acessível via aba "E-mails" no painel admin

### Nova aba em `src/pages/admin/Settings.tsx`
- Seção "Configuração de E-mail"
- Mostra: domínio configurado, status (verificado/pendente), instruções DNS
- Inclui link para o doc

## 6. Documentação DNS (Hostinger)

Arquivo `docs/EMAIL_SETUP.md` (e link na tela de configurações) com:

```text
Domínio: sistemasaph.com.br (ou subdomínio notify.sistemasaph.com.br)

Registros a adicionar no painel DNS da Hostinger:

1. SPF (TXT @)
   v=spf1 include:_spf.resend.com ~all

2. DKIM (3 registros CNAME — fornecidos pelo Resend ao adicionar domínio)
   resend._domainkey  →  resend._domainkey.resend.com
   (etc)

3. DMARC (TXT _dmarc)
   v=DMARC1; p=none; rua=mailto:dmarc@sistemasaph.com.br

4. MX (opcional, apenas se quiser receber respostas)
   feedback-smtp.resend.com  prioridade 10

Após configurar:
- Acesse Resend → Domains → "Verify"
- Aguarde propagação (até 24h, geralmente 15min)
```

## 7. Segurança

- `RESEND_API_KEY` apenas em secrets (nunca no client)
- Todas as chamadas a Resend partem de Edge Functions
- Validação de role (admin/super_admin) antes de envios manuais
- Rate limit em `send-password-reset` (3/hora por e-mail+IP)
- Mensagens genéricas no fluxo de recuperação
- RLS estrito em `email_logs` por empresa
- Sanitização de variáveis nos templates (escape HTML)

## 8. Multiempresa

- `empresa_id` propagado em todos os logs e filtros
- `notify-opportunity` busca apenas usuários da `empresa_id` da oportunidade
- Templates podem futuramente buscar logo/nome da empresa via `empresas` table

## Detalhes técnicos

**Stack:** Edge Functions (Deno) + `npm:resend@4` + Supabase service role para queries e geração de links auth.

**Idempotência:** `send-email` aceita `idempotency_key` opcional para evitar duplicatas em retries.

**Tratamento de erros:** Todo envio falho é registrado em `email_logs` com `error_message`. Frontend usa `explainError.ts` para tradução PT-BR.

**Performance:** `notify-opportunity` envia em paralelo (`Promise.allSettled`) com limite de 50 destinatários por batch.

**Compatibilidade:** Não interfere com `notify.sistemasaph.com.br` (auth emails Supabase) já configurado — Resend usa domínio/subdomínio próprio que você definir.

## Ações requeridas após aprovação

1. Você fornece a `RESEND_API_KEY` (vou solicitar via secret)
2. Você define o domínio remetente (ex: `no-reply@sistemasaph.com.br`)
3. Você adiciona os registros DNS na Hostinger (vou fornecer os valores exatos)
4. Você verifica o domínio no painel do Resend
5. Sistema fica operacional

