import { useEffect, useState } from 'react';
import { formatDateBR } from '@/utils/dateFormat';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { LogoUpload } from '@/components/admin/LogoUpload';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Settings as SettingsIcon, CreditCard, CheckCircle, ArrowUpCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { PlanoEmpresa } from '@/types/database';
import { PLANO_LABELS } from '@/types/database';

const PLANS: { plano: PlanoEmpresa; price: number; features: string[] }[] = [
  {
    plano: 'OPERACIONAL',
    price: 397,
    features: ['Eventos', 'Escalas', 'Fichas Clínicas', 'Relatórios', 'Checklist', 'Oportunidades'],
  },
  {
    plano: 'GESTAO_EQUIPE',
    price: 597,
    features: ['Tudo do Operacional', 'Pagamento de Freelancers'],
  },
  {
    plano: 'GESTAO_COMPLETA',
    price: 897,
    features: ['Tudo do Gestão de Equipe', 'Receita por Evento', 'Contas a Receber', 'Dashboard Financeiro', 'Exportação Contábil'],
  },
];

export default function Settings() {
  const { isAdmin, isLoading, empresa, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    subscribed: boolean;
    plano: string | null;
    subscription_end: string | null;
  } | null>(null);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, isLoading, navigate]);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      toast.success('Assinatura realizada com sucesso!');
      checkSubscription().then(() => {
        // Reload the page to refresh all available features
        window.location.href = window.location.pathname;
      });
    } else if (checkout === 'cancel') {
      toast.info('Checkout cancelado.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading && isAdmin) {
      checkSubscription();
    }
  }, [isLoading, isAdmin]);

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) throw error;
      setSubscriptionInfo(data);
      return data;
    } catch (err) {
      console.error('Error checking subscription:', err);
      return null;
    }
  };

  const handleRefreshSubscription = async () => {
    const data = await checkSubscription();
    if (data) {
      // Reload to refresh all features based on new plan
      window.location.reload();
    }
  };

  const handleCheckout = async (plano: PlanoEmpresa) => {
    setCheckoutLoading(plano);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { plano },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      toast.error('Erro ao iniciar checkout: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      toast.error('Erro ao abrir portal: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setPortalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) return null;

  const isSubscribed = subscriptionInfo?.subscribed;

  return (
    <MainLayout>
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <SettingsIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Configurações</h1>
            <p className="text-muted-foreground">
              Personalize sua organização e gerencie sua assinatura
            </p>
          </div>
        </div>

        {/* Subscription Section */}
        {!isSuperAdmin && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Assinatura
            </h2>

            {isSubscribed && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-6 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="font-semibold">
                      Plano ativo: {PLANO_LABELS[subscriptionInfo?.plano as PlanoEmpresa] || subscriptionInfo?.plano}
                    </p>
                    {subscriptionInfo?.subscription_end && (
                      <p className="text-sm text-muted-foreground">
                        Próxima renovação: {formatDateBR(subscriptionInfo.subscription_end)}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                  >
                    {portalLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Gerenciar Assinatura
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLANS.map(({ plano, price, features }) => {
                const isActive = isSubscribed && subscriptionInfo?.plano === plano;

                return (
                  <Card
                    key={plano}
                    className={`relative ${isActive ? 'border-primary ring-2 ring-primary/20' : ''}`}
                  >
                    {isActive && (
                      <Badge className="absolute -top-2.5 left-4 bg-primary">
                        Seu Plano
                      </Badge>
                    )}
                    <CardHeader>
                      <CardTitle className="text-lg">{PLANO_LABELS[plano]}</CardTitle>
                      <CardDescription>
                        <span className="text-2xl font-bold text-foreground">
                          R$ {price}
                        </span>
                        <span className="text-muted-foreground">/mês</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-2 text-sm">
                        {features.map((f) => (
                          <li key={f} className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isActive ? (
                        <Button variant="outline" className="w-full" disabled>
                          Plano Atual
                        </Button>
                      ) : (
                        <Button
                          className="w-full gap-2"
                          onClick={() => handleCheckout(plano)}
                          disabled={!!checkoutLoading}
                        >
                          {checkoutLoading === plano ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowUpCircle className="h-4 w-4" />
                          )}
                          {isSubscribed ? 'Trocar Plano' : 'Assinar'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshSubscription}
              className="text-muted-foreground"
            >
              Atualizar status da assinatura
            </Button>
          </div>
        )}

        {/* Logo/Identity Section */}
        <LogoUpload />
      </div>
    </MainLayout>
  );
}