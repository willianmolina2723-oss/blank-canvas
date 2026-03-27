import { MainLayout } from '@/components/layout/MainLayout';
import { UserManagement } from '@/components/admin/UserManagement';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UsersPage() {
  const navigate = useNavigate();

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerenciar Usuários</h1>
            <p className="text-muted-foreground">Visualize e gerencie os usuários do sistema</p>
          </div>
        </div>

        <UserManagement />
      </div>
    </MainLayout>
  );
}
