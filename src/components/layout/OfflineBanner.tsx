import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="offline-banner flex items-center justify-center gap-2">
      <WifiOff className="h-4 w-4" />
      <span>Você está offline. Os dados serão sincronizados quando a conexão for restaurada.</span>
    </div>
  );
}
