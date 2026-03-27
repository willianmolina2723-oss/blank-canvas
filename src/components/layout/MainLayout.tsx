import { ReactNode, useEffect } from 'react';
import { AppSidebar } from './AppSidebar';
import { MobileHeader } from './MobileHeader';
import { OfflineBanner } from './OfflineBanner';
import { SubscriptionBanner } from '@/components/plan/SubscriptionBanner';
import { NotificationPermission } from '@/components/notifications/NotificationPermission';
import { SidebarStateProvider, useSidebarState } from './SidebarState';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: ReactNode;
}

function LayoutContent({ children }: MainLayoutProps) {
  const { collapsed } = useSidebarState();

  // Listen for push notification sound messages from service worker
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PLAY_NOTIFICATION_SOUND' && event.data?.sound) {
        const audio = new Audio(event.data.sound);
        audio.volume = 0.7;
        audio.play().catch(() => {
          // Autoplay may be blocked by browser
        });
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <OfflineBanner />
      <SubscriptionBanner />
      
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      {/* Mobile header */}
      <MobileHeader />

      {/* Main content */}
      <main
        className={cn(
          'px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-6xl transition-[margin] duration-300',
          collapsed ? 'lg:ml-16' : 'lg:ml-60'
        )}
      >
        {children}
      </main>

      <NotificationPermission />
    </div>
  );
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarStateProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarStateProvider>
  );
}
