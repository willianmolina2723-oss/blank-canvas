import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Checklist from './Checklist';

const state = vi.hoisted(() => ({
  datesLoading: false,
  canEdit: false,
  isAdmin: false,
  checkedCount: 0,
  insert: vi.fn(),
  from: vi.fn(),
  toast: vi.fn(),
  profile: { id: 'driver-profile', empresa_id: 'company' },
}));

vi.mock('react-router-dom', () => ({ useParams: () => ({ eventId: 'event' }), useNavigate: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: state.profile, roles: ['condutor'] }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canEditVehicleChecklist: state.canEdit, isFullAdmin: state.isAdmin }) }));
vi.mock('@/hooks/useEventDates', () => ({ useEventDates: () => ({ dates: [], activeId: state.datesLoading ? null : 'selected-date', setActiveId: vi.fn(), isLoading: state.datesLoading }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from } }));
vi.mock('@/components/layout/MainLayout', () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/checklist/UTIConditionsTab', () => ({ UTIConditionsTab: () => null }));
vi.mock('@/components/checklist/ChecklistVideoTab', () => ({ ChecklistVideoTab: () => null }));
vi.mock('@/components/checklist/ChecklistFuelTab', () => ({ ChecklistFuelTab: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  state.datesLoading = false;
  state.canEdit = false;
  state.isAdmin = false;
  state.checkedCount = 0;
  state.insert.mockImplementation((rows) => ({ select: async () => ({ data: rows.map((r: object, i: number) => ({ ...r, id: `${i}`, checked_at: i < state.checkedCount ? '2026-01-01T00:00:00.000Z' : null })), error: null }) }));
  state.from.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query, or: () => query,
      maybeSingle: async () => ({ data: { role: 'condutor' } }),
      then: (resolve: (value: object) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      insert: state.insert,
    };
    return query;
  });
});
afterEach(cleanup);

describe('Checklist initialization', () => {
  it('creates equipment when driver permission resolves after the initial empty load', async () => {
    const view = render(<Checklist />);
    await waitFor(() => expect(view.getByText(/Nenhum item foi cadastrado/)).toBeTruthy());
    expect(state.insert).not.toHaveBeenCalled();
    state.canEdit = true;
    view.rerender(<Checklist />);
    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
    expect(state.insert.mock.calls[0][0]).toHaveLength(10);
    expect(state.insert.mock.calls[0][0][0].event_date_id).toBe('selected-date');
  });

  it('does not initialize legacy items while the selected date is still loading', async () => {
    state.canEdit = true;
    state.datesLoading = true;
    const view = render(<Checklist />);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.from.mock.calls.some(([table]) => table === 'checklist_items')).toBe(false);
    state.datesLoading = false;
    view.rerender(<Checklist />);
    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
    expect(state.insert.mock.calls[0][0].every((row: { event_date_id: string }) => row.event_date_id === 'selected-date')).toBe(true);
  });
});

describe('Checklist progress bar', () => {
  it('counts how many items were checked', async () => {
    state.canEdit = true;
    state.checkedCount = 3;
    const view = render(<Checklist />);
    await waitFor(() => expect(view.getByText('3 de 10 itens conferidos')).toBeTruthy());
    expect(view.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3');
  });

  it('shows zero items conferidos when nothing is marked yet', async () => {
    state.canEdit = true;
    const view = render(<Checklist />);
    await waitFor(() => expect(view.getByText('0 de 10 itens conferidos')).toBeTruthy());
  });
});

describe('Checklist empty state', () => {
  it('offers admins a way to manage checklist items when none exist', async () => {
    state.canEdit = true;
    state.isAdmin = true;
    state.insert.mockImplementation(() => ({ select: async () => ({ data: null, error: { message: 'insert failed' } }) }));
    const view = render(<Checklist />);
    await waitFor(() => expect(view.getByText(/Nenhum item foi cadastrado/)).toBeTruthy());
    expect(view.getByRole('button', { name: /Gerenciar Checklist/i })).toBeTruthy();
  });

  it('does not offer the management button to non-admins', async () => {
    const view = render(<Checklist />);
    await waitFor(() => expect(view.getByText(/Nenhum item foi cadastrado/)).toBeTruthy());
    expect(view.queryByRole('button', { name: /Gerenciar Checklist/i })).toBeNull();
  });
});
