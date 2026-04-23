

# Regras de Deslocamento e Horários por Função

Implementar duas regras grandes que se combinam para mudar como horas pagas são calculadas: (1) controle de quem recebe deslocamento e (2) horários diferentes por função dentro do mesmo evento.

## Etapa 1 — Banco de dados

Migrações idempotentes:

1. `app_config` — adicionar chaves por função:
   - `deslocamento_default_condutor`, `..._enfermeiro`, `..._tecnico`, `..._medico` (valor `'true'`/`'false'`)

2. `profiles` — nova coluna:
   - `recebe_deslocamento_override text` (valores: `'inherit'` | `'true'` | `'false'`, default `'inherit'`)

3. Nova tabela `event_role_schedules`:
   - `id uuid PK`, `event_id uuid`, `role app_role`, `quantity int`
   - `use_event_default boolean default true`
   - `start_time timestamptz`, `end_time timestamptz`
   - `empresa_id uuid`, timestamps
   - RLS: admin gerencia (mesma empresa); participantes do evento podem ver
   - Índice em `(event_id, role)`

4. Nova tabela `event_assignments`:
   - `id`, `event_id`, `profile_id`, `role app_role`
   - `scheduled_start timestamptz`, `scheduled_end timestamptz`
   - `schedule_source text` (`event_default` | `role_schedule` | `manual`)
   - `paid_start timestamptz`, `paid_end timestamptz`
   - `paid_duration_minutes int`
   - `recebe_deslocamento_resolvido boolean`
   - `empresa_id uuid`, timestamps
   - RLS: admin gerencia; participante vê próprio registro

5. Função SQL `resolve_recebe_deslocamento(_profile_id uuid, _role app_role) returns boolean` — aplica regra inherit → app_config; true/false → override.

## Etapa 2 — Configurações (Admin → Settings)

Em `DefaultRatesSettings.tsx` (ou novo componente `DeslocamentoSettings.tsx`): adicionar bloco "Recebimento de deslocamento por função" com 4 toggles (condutor, enfermeiro, técnico, médico) salvando em `app_config`.

## Etapa 3 — Perfil do colaborador (EditUserDialog / Profile)

Adicionar select "Recebe deslocamento":
- Herdar da função (padrão)
- Sempre sim
- Nunca
Salva em `profiles.recebe_deslocamento_override` via Edge Function `update-profile` (campo whitelisted).

## Etapa 4 — Cadastro/Edição de Evento (NewEvent / EventEdit)

Nova seção "Horários por função":

```text
┌─────────────────────────────────────────────┐
│ Função     Qtd  Usar horário do evento  ☑   │
│ Condutor   2    [Início] [Fim]              │
│ Médico     1    ☐  [08:00] [18:00]          │
└─────────────────────────────────────────────┘
```

Para cada função vinculada: toggle `use_event_default`. Se desligado, exibir inputs de início/fim (auto-advance se fim < início, conforme padrão). Validações: `end_time > start_time`; se `use_event_default = false`, exigir horários. Persiste em `event_role_schedules`.

## Etapa 5 — Escala (vinculação de colaborador ao evento)

Ao adicionar participante via `event_participants`:
1. Lookup em `event_role_schedules` pela função → se existir e `use_event_default=false`, usar esses horários (`source = role_schedule`).
2. Senão, usar `events.departure_time / arrival_time` (`source = event_default`).
3. Inserir/atualizar `event_assignments` com `scheduled_start/end` + `schedule_source`.
4. UI mostra horário aplicado, badge da origem, botão "Ajustar manualmente" (vira `source = manual`).

## Etapa 6 — Cálculo de horas pagas

Função utilitária `computePaidHours(assignment, event, transport)`:

```text
1) base_start/end:
   manual         → scheduled_*
   role_schedule  → scheduled_*
   event_default  → event.departure_time / arrival_time

2) recebe_desloc = resolve_recebe_deslocamento(profile, role)

3) Se recebe_desloc:
     paid_start = checklist.started_at (real)
     paid_end   = transport.arrival_time (real / base)
     se faltar real → fallback para base + warning
   Senão:
     paid_start = base_start
     paid_end   = base_end

4) paid_duration_minutes = diff(paid_end - paid_start)
```

Disparar recálculo: ao escalar, ao finalizar checklist, ao finalizar transporte, ao editar manualmente. Salvar em `event_assignments.paid_*` + `recebe_deslocamento_resolvido`.

## Etapa 7 — Aplicação no financeiro/relatórios

- `EarningsForecast.tsx`: substituir `calcMinutes(departure, arrival)` por leitura de `event_assignments.paid_duration_minutes` do colaborador logado. Fallback ao cálculo atual se assignment não existir.
- `event_staff_costs` / `Payroll`: usar `paid_duration_minutes` × `valor_hora` resolvido.
- Card de evento expandido exibe: "Horário previsto", "Horário pago", "Com/sem deslocamento", "Total de horas".

## Etapa 8 — Validações & avisos

- Bloquear `end_time < start_time` (form + DB trigger opcional).
- Aviso amarelo no card quando deslocamento ativo mas faltam horários reais ("Horários reais insuficientes para calcular deslocamento — usando horário previsto").

## Detalhes técnicos

- Atualizar `src/types/database.ts` com tipos `EventRoleSchedule`, `EventAssignment`, enum `ScheduleSource`.
- Tudo respeitar `empresa_id` + RLS (admin manage, participante ver o próprio).
- Migrações com `IF NOT EXISTS` e `NOTIFY pgrst, 'reload schema'`.
- Atualizar memória `mem://finance/hourly-rate-logic` e `mem://features/earnings-forecast` para refletir nova fonte (paid_duration_minutes) ao final.

## Escopo fora desta entrega

- Recalculo retroativo de eventos antigos finalizados (só aplica a eventos novos / em andamento).
- Edição em massa de horários por função em vários eventos.

