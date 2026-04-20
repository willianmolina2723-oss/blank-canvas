import { useEffect } from 'react';
import { formatDateBR } from '@/utils/dateFormat';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { LogoUpload } from '@/components/admin/LogoUpload';
import { SettingsReviewSection } from '@/components/reviews/SettingsReviewSection';
import { DefaultRatesSettings } from '@/components/admin/DefaultRatesSettings';
import { useAuth } from '@/contexts/AuthContext';
import { Settings as SettingsIcon, CreditCard, CheckCircle, AlertCircle, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PlanoEmpresa } from '@/types/database';
import { PLANO_LABELS } from '@/types/database';

const SUPPORT_WHATSAPP = '5548998331762';

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

const buildWhatsAppUrl = (nome: string, empresa: string, plano: string, motivo: 'contratar' | 'regularizar') => {
  const msg = motivo === 'regularizar'
    ? `Olá! Sou *${nome}* da empresa *${empresa}*. Gostaria de regularizar minha assinatura do plano *${plano}*.`
    : `Olá! Sou *${nome}* da empresa *${empresa}*. Tenho interesse em contratar o plano *${plano}*.`;

  const text = encodeURIComponent(msg);
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return isMobile
    ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`
    : `https://web.whatsapp.com/send?phone=${SUPPORT_WHATSAPP}&text=${text}`;
};

const openWhatsAppLink = async (url: string) => {
  const popup = window.open(url, '_blank', 'noopener,noreferrer');

  if (popup) {
    popup.opener = null;
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    window.alert('Não foi possível abrir o WhatsApp automaticamente. O link foi copiado para você abrir manualmente.');
  } catch {
    window.alert('Não foi possível abrir o WhatsApp automaticamente.');
  }
};

export default function Settings() {
  const { isAdmin, isLoading, empresa, isSuperAdmin, profile } = useAuth();
  const navigate = useNavigate();

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

  if (!isAdmin) return null;

  const planoAtual = empresa?.plano as PlanoEmpresa | undefined;
  const status = empresa?.status_assinatura;
  const vencimento = empresa?.data_vencimento;
  const isVencido = status === 'SUSPENSA' || status === 'CANCELADA';
  const userName = profile?.full_name || 'Administrador';
  const empresaName = empresa?.nome_fantasia || 'minha empresa';

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

        {!isSuperAdmin && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Assinatura
            </h2>

            {planoAtual && (
              <Card className={isVencido ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5'}>
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-semibold">
                      Plano ativo: {PLANO_LABELS[planoAtual]}
                    </p>
                    <Badge variant={isVencido ? 'destructive' : 'default'}>
                      {status}
                    </Badge>
                  </div>
                  {vencimento && (
                    <p className="text-sm text-muted-foreground">
                      {isVencido ? 'Vencido em: ' : 'Vencimento: '}
                      {formatDateBR(vencimento)}
                    </p>
                  )}
                  {isVencido && (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-sm">
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <span>
                          Sua assinatura está suspensa. Entre em contato com o suporte para regularizar o pagamento e reativar o acesso completo.
                        </span>
                      </div>
                      <Button
                        type="button"
                        className="w-full sm:w-auto bg-primary hover:bg-primary/90"
                        onClick={() => openWhatsAppLink(buildWhatsAppUrl(userName, empresaName, PLANO_LABELS[planoAtual], 'regularizar'))}
                      >
                        <MessageCircle className="h-4 w-4" />
                        Falar com suporte no WhatsApp
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLANS.map(({ plano, price, features }) => {
                const isActive = planoAtual === plano;

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
                      <Button
                        type="button"
                        variant={isActive ? 'outline' : 'default'}
                        className="w-full"
                        onClick={() => openWhatsAppLink(buildWhatsAppUrl(userName, empresaName, PLANO_LABELS[plano], isActive ? 'regularizar' : 'contratar'))}
                      >
                        <MessageCircle className="h-4 w-4" />
                        {isActive ? 'Falar sobre meu plano' : 'Quero este plano'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              Ao clicar, abriremos uma conversa no WhatsApp com seu nome, empresa e plano selecionado.
            </p>
          </div>
        )}

        <LogoUpload />
        <DefaultRatesSettings />
        <SettingsReviewSection />
      </div>
    </MainLayout>
  );
}
