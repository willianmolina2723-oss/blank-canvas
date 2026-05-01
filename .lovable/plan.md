## Objetivo

Criar um local centralizado para visualizar (e baixar) os vídeos gravados no checklist (cabine, salão, externa), vinculando-os à viatura usada no evento.

## O que existe hoje

- Tabela `event_recordings` com `event_id`, `video_type` (cabine/salão/externa), `video_url`, `started_at`, `duration_seconds`, `latitude/longitude`, `user_id`.
- Tabela `events` tem `ambulance_id` (link com a viatura cadastrada).
- Bucket `checklist-videos` (privado) já guarda os MP4.
- Página `AmbulanceDetails` (`/admin/ambulances/:id`) já existe com abas (Detalhes, Manutenções etc.).

Hoje **não há tela** para listar/rever esses vídeos — eles só ficam acessíveis durante a gravação.

## O que vou construir

### 1. Nova página: Biblioteca de Vídeos do Checklist
Rota: `/admin/checklist-videos`

- Acesso apenas para Admin / Super Admin (PlanGate + isAdmin).
- Lista todos os vídeos da empresa, mais recentes primeiro.
- Cada card mostra: thumbnail/ícone do tipo, data/hora (Brasília), evento (código + local), **viatura (código + placa)**, profissional que gravou, duração, tipo (cabine/salão/externa).
- Filtros no topo:
  - **Viatura** (select com ambulâncias da empresa)
  - **Evento** (busca por código)
  - **Tipo de vídeo** (cabine/salão/externa)
  - **Período** (data início/fim)
- Botão "Reproduzir" abre dialog com `<video controls>` usando URL assinada (signed URL de 1h via `supabase.storage.from('checklist-videos').createSignedUrl`).
- Botão "Baixar" usa a mesma URL assinada com `download=true`.
- Paginação simples (20 por página).

### 2. Aba "Vídeos" na ficha da viatura
Em `/admin/ambulances/:id` adicionar nova aba mostrando apenas os vídeos dos eventos onde aquela ambulância foi usada (filtro automático por `ambulance_id`).

Reutiliza o mesmo componente de listagem da página principal, passando `ambulanceId` como prop.

### 3. Item no menu lateral
Adicionar em `AppSidebar` (seção Admin) um link "Vídeos do Checklist" com ícone de vídeo, visível só para admins.

## Detalhes técnicos

**Query principal** (sem novas FKs — segue a regra de evitar FKs em `event_recordings`):

```ts
// 1. Buscar recordings da empresa
const { data: recs } = await supabase
  .from('event_recordings')
  .select('id, event_id, video_type, video_url, started_at, duration_seconds, user_id, status')
  .eq('empresa_id', empresaId)
  .eq('status', 'completed')
  .order('started_at', { ascending: false });

// 2. Buscar events relacionados (in eventIds) com ambulance_id, code, location
// 3. Buscar ambulances (in ambulanceIds) com code, plate, model
// 4. Buscar profiles (in userIds) com full_name
// 5. Montar em memória
```

Filtro por viatura: filtra eventIds cujo `ambulance_id` bate, depois filtra recordings.

**Signed URL**:
```ts
const path = videoUrl.split('/checklist-videos/')[1];
const { data } = await supabase.storage
  .from('checklist-videos')
  .createSignedUrl(path, 3600);
```

**Sem migrations necessárias** — schema atual já suporta tudo (RLS de `event_recordings` permite admin ver via `is_admin()`).

## Arquivos a criar/editar

- **Criar** `src/pages/admin/ChecklistVideos.tsx` — página principal
- **Criar** `src/components/admin/ChecklistVideosList.tsx` — componente reutilizável (lista + filtros + player)
- **Criar** `src/components/admin/VideoPlayerDialog.tsx` — modal de reprodução
- **Editar** `src/App.tsx` — registrar rota `/admin/checklist-videos`
- **Editar** `src/pages/admin/AmbulanceDetails.tsx` — adicionar aba "Vídeos" usando `ChecklistVideosList` com `ambulanceId` filtrado
- **Editar** `src/components/layout/AppSidebar.tsx` — adicionar link no menu admin

## Fora do escopo (posso fazer depois se quiser)

- Exportar todos os vídeos de uma viatura em ZIP
- Marcar vídeos como "verificados" pelo admin
- Excluir vídeos antigos automaticamente