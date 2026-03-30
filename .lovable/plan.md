
Objetivo: fazer uma auditoria completa do app + Supabase e corrigir os problemas que hoje estão quebrando checklist de vídeos, push e alguns fluxos de navegação/plano.

Diagnóstico já confirmado
1. O problema principal do checklist não é mais “mistério”: no Supabase atual não existe a tabela `public.event_recordings` e não existe nenhum bucket de storage. Eu confirmei:
   - `event_recordings`: ausente
   - `storage.buckets`: vazio
   - por isso o `manage-recording` responde com `Tabela public.event_recordings ou bucket checklist-videos não configurados`
2. O frontend do checklist de vídeos já está tentando:
   - listar gravações via edge function
   - iniciar/parar gravação
   - subir arquivo para `checklist-videos`
   - salvar confirmação em `checklist_items`
   Mas toda a cadeia quebra porque a infraestrutura do Supabase não existe.
3. O timestamp no vídeo está parcialmente implementado no frontend:
   - o componente usa `canvas.captureStream()` e desenha timestamp em overlay
   - isso é a abordagem certa para “timestamp embutido”
   - porém no iPhone essa estratégia precisa tratamento extra, porque `MediaRecorder` + canvas + mp4/webm é justamente a parte mais frágil no iOS/Safari
4. Push notifications também não estão funcionando de verdade:
   - existe cadastro de subscription
   - existe `get-vapid-key`
   - mas a função `send-push-notification` não envia push real; ela só faz log e incrementa contador
   - além disso, não encontrei nenhum ponto do app disparando essa função
5. Há um problema de UX já alinhado com seu relato anterior sobre plano:
   - `PlanProtectedRoute` já redireciona para `/dashboard`
   - porém ainda existem componentes de bloqueio (`PlanBlockedPage`) e a navegação de menu ainda pode confundir em alguns cenários
6. Há duplicidade desnecessária:
   - `NotificationPermission` é renderizado no `App.tsx` e também no `MainLayout.tsx`
   - isso pode gerar prompts duplicados/comportamento inconsistente

O que eu vou corrigir
1. Infraestrutura Supabase do checklist de vídeos
   - criar migration idempotente para:
     - `public.event_recordings`
     - índices
     - RLS segura usando `is_event_participant(event_id)` para leitura/inserção
     - update do próprio autor da gravação
     - delete apenas admin/super admin
   - criar bucket `checklist-videos`
   - criar policies do storage para upload, leitura e remoção
   - evitar dependências frágeis que possam reintroduzir erro de schema cache

2. Edge function `manage-recording`
   - reforçar a validação de setup
   - validar também existência do bucket, não só da tabela
   - melhorar mensagens de erro por etapa:
     - tabela ausente
     - bucket ausente
     - upload/URL inválida
     - usuário sem perfil
   - revisar o bloco de delete, que hoje consulta RPCs redundantes e depois faz checagem manual

3. Checklist de vídeo no frontend
   - revisar fluxo de câmera para iPhone/Safari/PWA:
     - abertura da câmera apenas após gesto explícito do usuário
     - fallback de constraints para câmera traseira
     - tratamento de permissão negada/inexistente/em uso
   - endurecer fluxo de gravação:
     - checar suporte real de `MediaRecorder`
     - fallback de mime type por navegador
     - tratar caso iOS não aceite o formato atual
   - manter timestamp visual e garantir que o metadado salvo em `checklist_items` e `event_recordings` inclua:
     - hora de início
     - hora de fim
     - duração
     - hash
     - URL do arquivo
   - evitar estados quebrados ao cancelar gravação/upload

4. Push notifications
   - corrigir implementação para envio real, não apenas log
   - revisar schema/políticas de `push_subscriptions`
   - localizar pontos do sistema que deveriam disparar push e integrar a edge function
   - manter compatibilidade com o service worker atual
   - remover prompt duplicado de notificação

5. Navegação e bloqueio por plano
   - revisar menus desktop/mobile/sidebar para garantir coerência do plano atual
   - manter redirecionamento para página anterior/segura quando rota não permitida
   - reduzir superfícies onde “recurso bloqueado” ainda pode aparecer desnecessariamente

6. Auditoria adicional do app
   - revisar fluxos conectados ao Supabase mais críticos:
     - auth/profile/roles
     - checklist
     - oportunidades
     - notificações
   - apontar inconsistências de schema x código para evitar novos erros em runtime

Arquitetura proposta
```text
ChecklistVideoTab
  -> supabase.functions.invoke('manage-recording', action=start/list/finish/delete)
  -> supabase.storage.from('checklist-videos')
  -> checklist_items (status/confirmacao)
  -> event_recordings (metadados oficiais da gravação)

Push
  NotificationPermission
    -> get-vapid-key
    -> push_subscriptions
  eventos do sistema
    -> send-push-notification
    -> Service Worker
```

Principais riscos que vou tratar
- Safari/iPhone não suportar bem o encoder escolhido
- bucket/policies criados mas storage ainda negar upload
- inconsistência entre `checklist_items` e `event_recordings`
- prompts duplicados de push
- rotas bloqueadas ainda ficarem acessíveis por URL ou menu

Entregáveis da implementação
- migration completa do Supabase para `event_recordings` + bucket/policies
- edge function `manage-recording` revisada
- fluxo de câmera/gravação iOS-first ajustado
- timestamp persistido corretamente no vídeo/metadados
- push notifications reais ou, se houver limitação externa, ao menos fluxo funcional e verificável
- limpeza de UX em plano/bloqueio/notificações

Detalhes técnicos
- Não vou armazenar papéis em `profiles`; o projeto já usa `user_roles`, o que está correto do ponto de vista de segurança.
- Vou seguir o padrão atual de acesso com funções como `is_event_participant`, `is_admin` e `is_super_admin`.
- Como o problema central é estrutural no Supabase, a correção exige tanto código quanto migration.
- O ponto mais crítico de produção hoje é: o frontend existe, mas a infraestrutura de backend/storage necessária não existe no projeto conectado.

Resumo da auditoria
- Quebrado agora:
  - checklist de vídeos
  - storage de vídeos
  - envio real de push
- Parcial/inconsistente:
  - gravação com timestamp no iPhone
  - UX de prompts de notificação
  - bloqueios por plano em alguns fluxos
- Saudável:
  - auth básica
  - leitura de perfil/empresa/roles
  - estrutura geral do checklist de equipamentos e KM

Se você aprovar, a próxima etapa é implementar tudo isso de ponta a ponta e depois validar o fluxo no checklist com gravação, upload e confirmação.
