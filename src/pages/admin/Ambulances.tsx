import { useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AmbulanceManagement } from '@/components/admin/AmbulanceManagement';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useReadOnly } from '@/hooks/useReadOnly';

export default function AmbulancesPage() {
  const navigate = useNavigate();
  const openAddRef = useRef<(() => void) | null>(null);
  const { isReadOnly } = useReadOnly();

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Truck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Viaturas</h1>
                <p className="text-sm text-muted-foreground">Cadastre e gerencie as viaturas</p>
              </div>
            </div>
          </div>
          {!isReadOnly && (
            <Button
              className="gap-2"
              onClick={() => openAddRef.current?.()}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nova Viatura</span>
            </Button>
          )}
        </div>

        <AmbulanceManagement onAdd={fn => { openAddRef.current = fn; }} />
      </div>
    </MainLayout>
  );
}
