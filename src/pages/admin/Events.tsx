 import { MainLayout } from '@/components/layout/MainLayout';
 import { EventManagement } from '@/components/admin/EventManagement';
 import { Button } from '@/components/ui/button';
 import { ArrowLeft, Plus } from 'lucide-react';
 import { useNavigate } from 'react-router-dom';
 import { useEffect } from 'react';
 import { useAuth } from '@/contexts/AuthContext';
 import { useReadOnly } from '@/hooks/useReadOnly';
 
 export default function EventsPage() {
    const navigate = useNavigate();
    const { isAdmin, isLoading } = useAuth();
    const { isReadOnly } = useReadOnly();
 
   useEffect(() => {
     if (!isLoading && !isAdmin) {
       navigate('/');
     }
   }, [isAdmin, isLoading, navigate]);
 
   if (isLoading) {
     return (
       <MainLayout>
         <div className="flex items-center justify-center py-12">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
         </div>
       </MainLayout>
     );
   }
 
   if (!isAdmin) {
     return null;
   }
 
   return (
     <MainLayout>
       <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Lista de Eventos</h1>
                <p className="text-sm text-muted-foreground">Visualize e gerencie todos os eventos</p>
              </div>
            </div>
             {!isReadOnly && (
               <Button onClick={() => navigate('/admin/events/new')} className="w-full sm:w-auto">
                 <Plus className="h-4 w-4 mr-2" />
                 Novo Evento
               </Button>
             )}
          </div>
 
         <EventManagement />
       </div>
     </MainLayout>
   );
 }