## Problema

O card **"Pago Freelancers"** na tela `/admin/financial` está exibindo `summary.totalStaffCosts` — que é o **custo total previsto** da equipe no mês (soma de `event_staff_costs`), e não o que foi efetivamente pago. Isso causa divergência com o módulo de Folha de Pagamento, onde só pagamentos marcados como "pago" deveriam contar.

## Solução

Trocar a fonte do card para usar somente registros de `freelancer_payments` com `status = 'pago'` e `cancelled = false` no mês selecionado — valor que já é calculado na variável `paidFreelancerTotal`, mas hoje é descartado.

## Mudanças em `src/pages/admin/Financial.tsx`

1. **Adicionar `totalPaidFreelancers` ao state `summary`** (novo campo numérico).
2. **No `loadFinancialData`**: já existe `paidFreelancerTotal` (linha 265). Salvar esse valor em `summary.totalPaidFreelancers`.
3. **Recalcular `totalCosts`**: continuar usando `totalStaffCosts` (custo previsto) para refletir o custo real do mês — mantém Lucro Bruto fiel à operação. *(Sem mudança aqui, apenas confirmar.)*
4. **Card "Pago Freelancers"** (linha 347): trocar `value: summary.totalStaffCosts` por `value: summary.totalPaidFreelancers`.
5. **Card "Pend. Freelancers"** (linha 352): manter como está (`totalStaffCosts - paidFreelancerTotal`), pois agora os dois cards ficam coerentes (Previsto = Pago + Pendente).

## Resultado

- "Pago Freelancers" = soma de `freelancer_payments.total_amount` com status `pago` no mês.
- "Pend. Freelancers" = previsto − pago (já estava correto).
- Os dois somam o custo total da equipe, sem divergência com a tela de Folha de Pagamento.
