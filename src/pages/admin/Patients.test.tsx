import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatientsPage from './Patients';

const state = vi.hoisted(() => ({
  patients: [] as object[],
  from: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: true, isLoading: false, profile: { id: 'admin-1', empresa_id: 'company' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from } }));
vi.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/utils/exportPatientPDF', () => ({ exportPatientPDF: vi.fn() }));

const PATIENTS = [
  { id: '1', event_id: 'e1', name: 'Ana Souza', cpf: '123.456.789-09', age: 34, gender: 'feminino', birth_date: null, main_complaint: null, brief_history: null, allergies: null, current_medications: null, created_by: null, empresa_id: 'company', created_at: '2026-01-01T10:00:00.000Z', updated_at: '2026-01-01T10:00:00.000Z' },
  { id: '2', event_id: 'e1', name: 'Bruno Lima', cpf: '987.654.321-00', age: 51, gender: 'masculino', birth_date: null, main_complaint: null, brief_history: null, allergies: null, current_medications: null, created_by: null, empresa_id: 'company', created_at: '2026-01-02T10:00:00.000Z', updated_at: '2026-01-02T10:00:00.000Z' },
  { id: '3', event_id: 'e2', name: 'Carla Dias', cpf: null, age: 27, gender: 'feminino', birth_date: null, main_complaint: null, brief_history: null, allergies: null, current_medications: null, created_by: null, empresa_id: 'company', created_at: '2026-01-03T10:00:00.000Z', updated_at: '2026-01-03T10:00:00.000Z' },
];

function searchBox(view: ReturnType<typeof render>) {
  return view.getByRole('textbox', { name: 'Buscar por nome ou CPF' });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.patients = PATIENTS;
  state.from.mockImplementation(() => {
    const query: Record<string, unknown> = {
      select: () => query,
      eq: () => query,
      order: () => query,
      then: (resolve: (value: object) => unknown) =>
        Promise.resolve({ data: state.patients, error: null }).then(resolve),
    };
    return query;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Patients search', () => {
  it('lists every patient and the total count before searching', async () => {
    const view = render(<PatientsPage />);
    await waitFor(() => expect(view.getByText('Ana Souza')).toBeTruthy());
    expect(view.getByText('Bruno Lima')).toBeTruthy();
    expect(view.getByText('Carla Dias')).toBeTruthy();
    expect(view.getByText('3 pacientes cadastrados')).toBeTruthy();
  });

  it('filters the list by name while typing', async () => {
    const view = render(<PatientsPage />);
    await waitFor(() => expect(view.getByText('Ana Souza')).toBeTruthy());

    fireEvent.change(searchBox(view), { target: { value: 'bru' } });

    await waitFor(() => expect(view.getByText('1 de 3 pacientes encontrados')).toBeTruthy());
    expect(view.getByText('Bruno Lima')).toBeTruthy();
    expect(view.queryByText('Ana Souza')).toBeNull();
    expect(view.queryByText('Carla Dias')).toBeNull();
  });

  it('finds a patient by CPF digits typed without formatting', async () => {
    const view = render(<PatientsPage />);
    await waitFor(() => expect(view.getByText('Ana Souza')).toBeTruthy());

    fireEvent.change(searchBox(view), { target: { value: '78909' } });

    await waitFor(() => expect(view.getByText('1 de 3 pacientes encontrados')).toBeTruthy());
    expect(view.getByText('Ana Souza')).toBeTruthy();
    expect(view.queryByText('Bruno Lima')).toBeNull();
  });

  it('shows a friendly empty state with a button that clears the search', async () => {
    const view = render(<PatientsPage />);
    await waitFor(() => expect(view.getByText('Ana Souza')).toBeTruthy());

    fireEvent.change(searchBox(view), { target: { value: 'zezinho' } });

    await waitFor(() => expect(view.getByText('Nenhum paciente encontrado')).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: /Limpar busca/i }));

    await waitFor(() => expect(searchBox(view).value).toBe(''));
    await waitFor(() => expect(view.getByText('3 pacientes cadastrados')).toBeTruthy());
    await waitFor(() => expect(view.getByText('Ana Souza')).toBeTruthy());
    expect(view.getByText('Bruno Lima')).toBeTruthy();
    expect(view.getByText('Carla Dias')).toBeTruthy();
  });

  it('waits for the debounce delay before filtering', async () => {
    vi.useFakeTimers();
    const view = render(<PatientsPage />);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.getByText('Ana Souza')).toBeTruthy();

    fireEvent.change(searchBox(view), { target: { value: 'Ana' } });
    expect(view.getByText('3 de 3 pacientes encontrados')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(300);
    expect(view.getByText('1 de 3 pacientes encontrados')).toBeTruthy();
  });
});
