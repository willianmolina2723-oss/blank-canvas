

## Plan: Move summary + confirm button to top & keep materials as select-only

### What changes

1. **Move "Resumo do Consumo" + confirm button to right after the patient selector** (before the search bar and material list). This way the user sees their selected items and can confirm without scrolling down.

2. **Keep current behavior** where materials start at quantity 0 and the user only fills in the ones they need (no mandatory fill-all). Only items with quantity > 0 are saved.

### File: `src/pages/MaterialConsumption.tsx`

Reorder the JSX sections from:
```text
Header → Patient → Warning → Search → Materials List → Custom Items → Add Custom → Summary → Confirm
```
To:
```text
Header → Patient → Warning → Summary + Confirm → Search → Materials List → Custom Items → Add Custom
```

The Summary card and Confirm button block (lines 401-439) will be moved to appear right after the `!canEdit` warning card (line 273), before the search input. No logic changes needed -- just JSX reordering.

