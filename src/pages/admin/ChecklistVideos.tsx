import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Video } from 'lucide-react';
import { ChecklistVideosList } from '@/components/admin/ChecklistVideosList';

export default function ChecklistVideosPage() {
  const navigate = useNavigate();

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in p-4 md:p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Video className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Vídeos do Checklist</h1>
            <p className="text-sm text-muted-foreground">
              Acesse todas as gravações realizadas durante a vistoria das viaturas.
            </p>
          </div>
        </div>

        <ChecklistVideosList />
      </div>
    </MainLayout>
  );
}
