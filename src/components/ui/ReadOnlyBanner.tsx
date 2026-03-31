import { AlertTriangle, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ReadOnlyBannerProps {
  /** Custom message. Defaults to generic. */
  message?: string;
  /** Whether to show the banner. */
  show: boolean;
}

/**
 * Displays a consistent read-only banner when the user lacks edit permissions.
 */
export function ReadOnlyBanner({ message, show }: ReadOnlyBannerProps) {
  if (!show) return null;

  return (
    <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700">
      <CardContent className="py-3">
        <p className="text-sm text-center flex items-center justify-center gap-2 text-amber-800 dark:text-amber-300">
          <Lock className="h-4 w-4 flex-shrink-0" />
          {message || 'Você está visualizando em modo somente leitura.'}
        </p>
      </CardContent>
    </Card>
  );
}
