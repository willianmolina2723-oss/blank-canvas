import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { subscribeToPush, isSubscribedToPush } from '@/utils/pushNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export function NotificationPermission() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!('Notification' in window) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;

    const dismissed = localStorage.getItem('push-prompt-dismissed');
    if (dismissed) return;

    if (Notification.permission === 'granted') {
      isSubscribedToPush().then(subscribed => {
        if (!subscribed) setShow(true);
      });
    } else {
      setShow(true);
    }
  }, [user]);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const success = await subscribeToPush();
      if (success) {
        toast({ title: 'Notificações ativadas com sucesso!' });
        setShow(false);
      } else {
        toast({ title: 'Não foi possível ativar as notificações.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro ao ativar notificações.', variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('push-prompt-dismissed', 'true');
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-card border rounded-lg shadow-lg p-4">
      <div className="flex items-start gap-3">
        <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Ativar notificações</p>
          <p className="text-xs text-muted-foreground mt-1">
            Receba alertas sobre novas oportunidades e lembretes de eventos.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={handleEnable} disabled={loading}>
              {loading ? 'Ativando...' : 'Ativar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Depois
            </Button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
