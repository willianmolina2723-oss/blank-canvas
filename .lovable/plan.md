
# Fechamento — Deslocamento e Horários por Função

Três últimos passos para concluir o plano original.

## 1. Aplicar `paid_duration_minutes` no `EventFinancial` / Payroll

**Arquivos:** `src/pages/admin/EventFinancial.tsx`, `src/pages/admin/Payroll.tsx`

- Em `loadData()` carregar também `event_assignments` do evento (`select('*').eq('event_id', id)`).
- Para cada participante, montar `paidMinutesByProfile[role+profile] = assignment.paid_duration_minutes`.
- Substituir o uso hoje legado de `transportMinutes` (mesmo valor para todos) ao calcular custo de pessoal:
  - `base = (paidMinutes / 60) * valor_hora_resolvido`
  - Fallback ao cálculo antigo se assignment ainda não existir (eventos antigos).
- Mostrar abaixo de cada linha de pessoal: "Horário previsto: X – Y" e "Horário pago: A – B" + chip "Com deslocamento" / "Sem deslocamento" lendo `recebe_deslocamento_resolvido`.
- Botão "Recalcular horas" no topo que chama `recomputeAllAssignmentsForEvent(id)` e recarrega.
- Em `Payroll.tsx`: ler `paid_duration_minutes` agregado por colaborador no período em vez de minutos do transporte.

## 2. Badge de origem do horário ao escalar (Etapa 5 do plano)

**Arquivos:** `src/pages/admin/EventEdit.tsx`, `src/pages/admin/NewEvent.tsx`, novo `src/components/events/AssignmentSummary.tsx`

- Após salvar o evento, mostrar (ou já dentro do form em modo edição) bloco "Resumo da escala":
  - Lista de participantes selecionados.
  - Para cada um exibir: nome, função, horário aplicado e badge:
    - cinza "Horário do evento" (`event_default`)
    - azul "Horário da função" (`role_schedule`)
    - âmbar "Manual" (`manual`)
  - Botão pequeno "Ajustar manualmente" que abre Dialog com inputs `datetime-local` (start/end) → grava `event_assignments` com `schedule_source='manual'` e dispara `recomputeAssignmentPaidHours`.
- Resolução do horário aplicado segue: manual → role_schedule (se `use_event_default=false`) → event_default.
- Persistir manualmente é opcional; o botão só aparece em `EventEdit` (precisa de evento já salvo).

## 3. Avisos quando deslocamento ativo sem horário real (Etapa 8)

**Arquivos:** `AssignmentSummary.tsx` (novo) e `EventFinancial.tsx`

- Para cada assignment com `recebe_deslocamento_resolvido = true`:
  - Buscar `transport_records` do evento.
  - Se `departure_time` ou `arrival_time` ausentes/iguais ao previsto, mostrar `Alert variant="warning"` âmbar:
    > "Horários reais de transporte ausentes — usando horário previsto para o cálculo de deslocamento."
- No `EventFinancial`, mostrar mesmo alerta no card de pessoal quando aplicável.

## Detalhes técnicos

- Sem novas migrações — toda lógica usa tabelas já existentes (`event_assignments`, `event_role_schedules`, `transport_records`).
- Reaproveitar `recomputeAssignmentPaidHours` / `recomputeAllAssignmentsForEvent` de `src/utils/computePaidHours.ts`.
- `valor_hora_resolvido`: manter hierarquia atual (`profile.valor_hora` → `useDefaultRates` por função → fallback).
- Atualizar memória `mem://features/deslocamento-horarios-funcao` ao final acrescentando: "EventFinancial e Payroll consomem `paid_duration_minutes`; UI exibe origem do horário e alerta quando deslocamento ativo sem dados reais de transporte."

## Fora de escopo

- Edição em massa de horários por função.
- Recalculo retroativo de eventos finalizados há muito tempo (continua só novos/em andamento).
