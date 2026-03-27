import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Loader2, Ambulance } from 'lucide-react';
import { validatePassword } from '@/utils/passwordValidation';
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator';

interface ForcePasswordChangeProps {
  onComplete: () => void;
}

export function ForcePasswordChange({ onComplete }: ForcePasswordChangeProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { valid, errors } = validatePassword(newPassword);
    if (!valid) {
      toast({ title: 'Senha fraca', description: errors[0], variant: 'destructive' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwError) throw pwError;

      // Clear the flag
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any).from('profiles')
          .update({ must_change_password: false })
          .eq('user_id', user.id);
      }

      // Log password change (fire-and-forget)
      supabase.functions.invoke('log-auth-event', {
        body: { event_type: 'password_changed', email: user?.email || '', success: true },
      }).catch(() => {});

      toast({ title: 'Senha alterada com sucesso!' });
      onComplete();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Ambulance className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">SAPH</h1>
        </div>

        <Card className="border-2">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Alterar Senha</CardTitle>
            <CardDescription className="text-center">
              Por segurança, você precisa criar uma nova senha antes de continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10 h-12"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <PasswordStrengthIndicator password={newPassword} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10 h-12"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Nova Senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
