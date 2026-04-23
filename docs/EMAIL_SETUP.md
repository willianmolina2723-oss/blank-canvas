# Configuração de E-mail — SAPH (Resend + Hostinger)

Este documento explica como configurar o domínio remetente para que os e-mails transacionais do SAPH sejam entregues com alta deliverability.

## 1. Pré-requisitos

- Conta no [Resend](https://resend.com) (gratuita até 3.000 e-mails/mês)
- API Key gerada em Resend → API Keys (já cadastrada como secret `RESEND_API_KEY`)
- Acesso ao painel DNS da **Hostinger**
- Domínio definido (recomendado: `notify.sistemasaph.com.br` ou `sistemasaph.com.br`)

## 2. Adicionar o domínio no Resend

1. Acesse [Resend → Domains](https://resend.com/domains)
2. Clique em **Add Domain**
3. Informe o domínio (ex: `notify.sistemasaph.com.br`)
4. Selecione a região mais próxima (ex: South America)
5. O Resend exibirá os registros DNS que você precisa adicionar

## 3. Registros DNS na Hostinger

Acesse o painel DNS do seu domínio na Hostinger e adicione:

### SPF (TXT)
- **Nome / Host**: `@` (ou o subdomínio se for o caso)
- **Valor**: `v=spf1 include:_spf.resend.com ~all`
- **TTL**: 3600

### DKIM (CNAME)
O Resend gera automaticamente os 3 registros CNAME ao adicionar o domínio. Eles têm o formato:
- `resend._domainkey` → `resend._domainkey.resend.com`
- (e mais 2 variações fornecidas pelo Resend)

Copie cada registro exatamente como mostrado no painel do Resend.

### DMARC (TXT) — recomendado
- **Nome / Host**: `_dmarc`
- **Valor**: `v=DMARC1; p=none; rua=mailto:dmarc@sistemasaph.com.br`
- **TTL**: 3600

### MX (opcional)
Apenas se quiser receber respostas via Resend (geralmente não é necessário):
- **Nome**: `@` (ou subdomínio)
- **Valor**: `feedback-smtp.resend.com`
- **Prioridade**: 10

## 4. Verificar o domínio

Após adicionar os registros:
1. Volte ao painel do Resend → Domains
2. Clique em **Verify**
3. Aguarde a propagação DNS (geralmente 15min, no máximo 24h)
4. O status deve mudar para **Verified**

## 5. Secrets configurados no Supabase

Estes secrets já estão configurados no projeto SAPH:

| Secret | Valor exemplo | Função |
|---|---|---|
| `RESEND_API_KEY` | `re_xxxxx...` | Autenticação na API do Resend |
| `EMAIL_FROM` | `SAPH <no-reply@sistemasaph.com.br>` | Endereço remetente exibido |
| `APP_URL` | `https://sistemasaph.com.br` | URL base usada nos links dos e-mails |

⚠️ O endereço em `EMAIL_FROM` **deve usar o domínio que foi verificado no Resend**. Caso contrário, o envio falhará com `403 — Domain is not verified`.

## 6. Testar o envio

1. Acesse o painel admin → **Usuários** → criar um usuário com seu próprio e-mail
2. Verifique a caixa de entrada
3. Em paralelo, abra **Painel admin → Logs de E-mail** para ver o status (`pending` → `sent` ou `failed`)
4. Em caso de falha, a coluna `error_message` mostra o motivo

## 7. Tipos de e-mail enviados

| Tipo | Quando dispara | Template |
|---|---|---|
| `invite` | Admin cria novo usuário | `_shared/email-templates/invite.ts` |
| `resend_invite` | Admin clica em "Reenviar" | `_shared/email-templates/invite.ts` (modo reenvio) |
| `password_reset` | Usuário usa "Esqueci minha senha" | `_shared/email-templates/password-reset.ts` |
| `opportunity` | Admin publica nova oportunidade | `_shared/email-templates/opportunity.ts` |

## 8. Segurança

- A `RESEND_API_KEY` está armazenada **apenas em secrets do Supabase**. Nunca aparece no frontend.
- Todo envio passa pela edge function `send-email`, que registra `email_logs`.
- O fluxo de recuperação aplica **rate limit** (3 tentativas / hora por e-mail+IP) e sempre retorna mensagem genérica para não revelar se o e-mail existe.
- Cada e-mail é validado por permissão de admin/super_admin antes do disparo manual (resend, notify-opportunity).

## 9. Multiempresa

- Logs e disparos respeitam `empresa_id`.
- `notify-opportunity` envia apenas para usuários da empresa dona da oportunidade.

## 10. Resolução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Status `failed` com "Domain not verified" | DNS não propagou ou domínio não está em Verified no Resend | Aguardar propagação e clicar em Verify novamente |
| Status `failed` com "Invalid API key" | Chave incorreta ou revogada | Atualizar `RESEND_API_KEY` no Supabase |
| E-mail nunca chega, mas status é `sent` | Provavelmente foi para spam | Adicionar SPF/DKIM/DMARC corretamente; aquecer o domínio |
| `403` ao chamar resend-invite | Usuário não é admin | Garantir role `admin` ou `super_admin` |
