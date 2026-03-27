import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS / browsers that don't fire beforeinstallprompt
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;

    if (!isStandalone && !dismissed) {
      // Show a manual prompt after 2s for iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        const timer = setTimeout(() => setShowPrompt(true), 2000);
        return () => {
          clearTimeout(timer);
          window.removeEventListener('beforeinstallprompt', handler);
        };
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (!showPrompt) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl animate-in slide-in-from-bottom-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Download className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg">Instalar SAPH</h3>
              <p className="text-sm text-muted-foreground">Acesso rápido pelo celular</p>
            </div>
          </div>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-5">
          Instale o SAPH na tela inicial do seu dispositivo para acesso rápido e uma experiência otimizada.
        </p>

        {isIOS && !deferredPrompt ? (
          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <p>
              Toque em <strong>Compartilhar</strong> (ícone de quadrado com seta) e depois em{' '}
              <strong>"Adicionar à Tela de Início"</strong>.
            </p>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleDismiss}>
              Agora não
            </Button>
            <Button className="flex-1" onClick={handleInstall}>
              <Download className="h-4 w-4 mr-2" />
              Instalar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
