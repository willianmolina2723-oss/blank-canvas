import { useState, lazy, Suspense } from 'react';
import heroImage from '@/assets/hero-ambulance.jpg';
import logoBlackShield from '@/assets/logo-black-shield.png';
import { Link } from 'react-router-dom';
const ReviewsSection = lazy(() => import('@/components/reviews/ReviewsSection'));
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Shield, Ambulance, ClipboardList, Users, BarChart3,
  Bell, FileText, LogIn, MessageCircle, CheckCircle,
  ChevronRight, Star, Check, Zap, Lock, Wifi, WifiOff,
  Clock, TrendingUp, HeartPulse, ArrowRight
} from 'lucide-react';

const features = [
  {
    icon: ClipboardList,
    title: 'Checklist Inteligente',
    description: 'Controle completo de materiais, medicamentos e equipamentos com rastreabilidade total e alertas automáticos.',
  },
  {
    icon: Users,
    title: 'Gestão de Equipe',
    description: 'Escalas, oportunidades de plantão e controle de profissionais em tempo real com notificações push.',
  },
  {
    icon: Ambulance,
    title: 'Frota de Ambulâncias',
    description: 'Gestão de veículos, manutenção preventiva, controle de quilometragem e combustível em um só lugar.',
  },
  {
    icon: FileText,
    title: 'Prontuário Digital',
    description: 'Fichas de atendimento, evolução médica e de enfermagem com assinatura digital juridicamente válida.',
  },
  {
    icon: BarChart3,
    title: 'Financeiro Completo',
    description: 'Dashboard financeiro, contas a receber, pagamentos de freelancers e custos detalhados por evento.',
  },
  {
    icon: Bell,
    title: 'Notificações Push',
    description: 'Alertas em tempo real para novas oportunidades, atualizações de eventos e mudanças de escala.',
  },
];

const stats = [
  { value: '+500', label: 'Eventos gerenciados', icon: Zap },
  { value: '+50', label: 'Empresas atendidas', icon: Users },
  { value: '+1.000', label: 'Profissionais ativos', icon: HeartPulse },
  { value: '24/7', label: 'Funciona offline', icon: WifiOff },
];

const benefits = [
  { text: 'Multiempresa com isolamento total de dados', icon: Lock },
  { text: 'Funciona offline como aplicativo (PWA)', icon: WifiOff },
  { text: 'Relatórios e exportação em PDF', icon: FileText },
  { text: 'Assinatura digital com validade jurídica', icon: Shield },
  { text: 'Controle de acesso por perfil (Admin, Médico, Enfermeiro, Motorista)', icon: Users },
  { text: 'Auditoria completa de todas as ações', icon: ClipboardList },
];

const plans = [
  {
    id: 'OPERACIONAL',
    name: 'Operacional',
    price: 397,
    description: 'Para operações essenciais do dia a dia',
    features: [
      'Gestão de eventos e escalas',
      'Checklist de materiais e medicamentos',
      'Prontuário digital (fichas de atendimento)',
      'Relatórios e exportação em PDF',
      'Oportunidades de plantão',
      'Notificações push',
    ],
  },
  {
    id: 'GESTAO_EQUIPE',
    name: 'Gestão de Equipe',
    price: 597,
    popular: true,
    description: 'Inclui gestão financeira da equipe',
    features: [
      'Tudo do plano Operacional',
      'Pagamento de freelancers',
      'Controle de custos por profissional',
      'Agrupamento semanal de pagamentos',
      'Exportação de folha de pagamento',
    ],
  },
  {
    id: 'GESTAO_COMPLETA',
    name: 'Gestão Completa',
    price: 897,
    description: 'Controle financeiro total da operação',
    features: [
      'Tudo do plano Gestão de Equipe',
      'Dashboard financeiro completo',
      'Contas a receber por evento',
      'Custos operacionais detalhados',
      'Gestão de contratantes',
      'Relatórios financeiros avançados',
    ],
  },
];


const faqs = [
  {
    q: 'Preciso instalar algum aplicativo?',
    a: 'Não! O SAPH é um PWA (Progressive Web App). Basta acessar pelo navegador e adicionar à tela inicial do celular. Funciona como um app nativo, inclusive offline.',
  },
  {
    q: 'Meus dados ficam seguros?',
    a: 'Sim. Utilizamos criptografia de ponta a ponta, isolamento total entre empresas (multitenancy) e auditoria completa de todas as ações no sistema.',
  },
  {
    q: 'Posso testar antes de contratar?',
    a: 'Sim! Entre em contato pelo WhatsApp e configuramos um ambiente de demonstração para você conhecer todas as funcionalidades.',
  },
  {
    q: 'Quantos usuários posso ter?',
    a: 'Todos os planos incluem usuários ilimitados. Médicos, enfermeiros, motoristas e administradores — toda a equipe pode usar o sistema.',
  },
];

function AnimatedCounter({ target, suffix = '' }: { target: string; suffix?: string }) {
  return <span>{target}{suffix}</span>;
}

export default function LandingPage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const whatsappNumber = '5548998331762';

  const getWhatsAppUrl = (planId?: string) => {
    const plan = planId ? plans.find(p => p.id === planId) : null;
    const message = plan
      ? `Olá! Tenho interesse no sistema SAPH, plano *${plan.name}* (R$ ${plan.price}/mês). Gostaria de solicitar acesso.`
      : 'Olá! Tenho interesse no sistema SAPH e gostaria de solicitar acesso.';
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-md">
              <img src={logoBlackShield} alt="SAPH" className="h-7 w-7 object-contain brightness-0 invert" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">SAPH</span>
              <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">Sistema de Atendimento Pré-Hospitalar</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Contato</span>
              </Button>
            </a>
            <Link to="/auth">
              <Button size="sm" className="gap-2">
                <LogIn className="h-4 w-4" />
                Entrar
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Equipe de atendimento pré-hospitalar" className="h-full w-full object-cover" fetchPriority="high" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-44">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary backdrop-blur-sm">
              <HeartPulse className="h-4 w-4 animate-pulse" />
              Plataforma #1 de Gestão Pré-Hospitalar
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Gerencie seus eventos{' '}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                com excelência
              </span>
              {' '}e{' '}
              <span className="bg-gradient-to-r from-primary/60 to-primary bg-clip-text text-transparent">
                segurança total
              </span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Checklists, prontuários, equipe, ambulâncias e financeiro — tudo em um só lugar.
              Elimine o papel e profissionalize sua operação de APH.
            </p>
            <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row">
              <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="gap-2 px-8 text-base shadow-lg shadow-primary/25 transition-transform hover:scale-105">
                  <MessageCircle className="h-5 w-5" />
                  Solicitar Acesso Gratuito
                </Button>
              </a>
              <Link to="/auth">
                <Button variant="outline" size="lg" className="gap-2 px-8 text-base backdrop-blur-sm">
                  <LogIn className="h-5 w-5" />
                  Já tenho conta
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              ✓ Sem cartão de crédito &nbsp; ✓ Setup em minutos &nbsp; ✓ Suporte dedicado
            </p>
          </div>
        </div>
      </section>

      {/* Social Proof Stats */}
      <section className="relative -mt-12 z-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="border-border/50 bg-card/95 backdrop-blur-sm">
                <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
                  <stat.icon className="h-6 w-6 text-primary" />
                  <span className="text-2xl font-extrabold tracking-tight sm:text-3xl">{stat.value}</span>
                  <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Chega de planilhas, papel e WhatsApp
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Se você ainda gerencia eventos com papel, planilhas ou grupos de WhatsApp, 
              está perdendo tempo, dinheiro e correndo riscos desnecessários.
            </p>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            {/* Before */}
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-8">
                <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-destructive">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-sm">✕</span>
                  Sem o SAPH
                </h3>
                <ul className="space-y-4">
                  {[
                    'Checklists em papel que se perdem',
                    'Prontuários escritos à mão sem padrão',
                    'Escalas gerenciadas por WhatsApp',
                    'Sem controle financeiro por evento',
                    'Informações dispersas e sem rastreabilidade',
                    'Risco jurídico por falta de documentação',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 shrink-0 text-destructive">✕</span>
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            {/* After */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-8">
                <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-primary">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm">✓</span>
                  Com o SAPH
                </h3>
                <ul className="space-y-4">
                  {[
                    'Checklists digitais com rastreabilidade',
                    'Prontuário eletrônico padronizado e assinado',
                    'Escalas e oportunidades com notificação push',
                    'Dashboard financeiro completo por evento',
                    'Tudo centralizado e auditável em tempo real',
                    'Assinatura digital com validade jurídica',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/50 bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-wider text-primary">Funcionalidades</span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Tudo que você precisa em um só sistema
            </h2>
            <p className="mt-4 text-muted-foreground">
              Funcionalidades pensadas para a realidade do atendimento pré-hospitalar em eventos.
            </p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="group border-border/50 transition-all duration-300 hover:border-primary/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5">
                <CardContent className="flex flex-col gap-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-lg group-hover:shadow-primary/25">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews / Avaliações */}
      <Suspense fallback={<div className="py-20" />}>
        <ReviewsSection />
      </Suspense>

      {/* Pricing */}
      <section className="border-t border-border/50 bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-wider text-primary">Planos Flexíveis</span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Escolha o plano ideal para sua empresa
            </h2>
            <p className="mt-4 text-muted-foreground">
              Todos os planos incluem suporte dedicado, atualizações e usuários ilimitados.
            </p>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`relative flex flex-col transition-all duration-300 ${
                  plan.popular
                    ? 'border-primary shadow-xl shadow-primary/10 scale-[1.03] lg:scale-105'
                    : 'border-border/50 hover:border-primary/30 hover:shadow-lg'
                } ${selectedPlan === plan.id ? 'ring-2 ring-primary' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/25">
                      Mais popular
                    </span>
                  </div>
                )}
                <CardContent className="flex flex-1 flex-col p-8">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <span className="text-5xl font-extrabold tracking-tight">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Usuários ilimitados inclusos</p>
                  <ul className="mt-8 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={getWhatsAppUrl(plan.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-8 block"
                  >
                    <Button
                      className={`w-full gap-2 transition-transform hover:scale-[1.02] ${plan.popular ? 'shadow-lg shadow-primary/25' : ''}`}
                      variant={plan.popular ? 'default' : 'outline'}
                      size="lg"
                      onClick={() => setSelectedPlan(plan.id)}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Contratar via WhatsApp
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t border-border/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-wider text-primary">Diferenciais</span>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Por que escolher o SAPH?
              </h2>
              <p className="mt-4 text-muted-foreground">
                Desenvolvido por quem entende a rotina do atendimento pré-hospitalar.
              </p>
              <ul className="mt-8 space-y-5">
                {benefits.map((benefit) => (
                  <li key={benefit.text} className="flex items-start gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <benefit.icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm sm:text-base">{benefit.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-6">
              <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-primary/10 to-transparent">
                <CardContent className="p-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <Zap className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold">Comece em Minutos</h3>
                  <p className="mt-3 text-muted-foreground">
                    Escolha seu plano e entre em contato pelo WhatsApp. Configuramos sua empresa e criamos suas credenciais na hora.
                  </p>
                  <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
                    <Button className="mt-6 gap-2 shadow-lg shadow-primary/25 transition-transform hover:scale-105" size="lg">
                      Começar Agora
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </a>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-6 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium">
                    <Lock className="h-4 w-4 text-primary" />
                    <span>Seus dados protegidos com criptografia de ponta</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/50 bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-wider text-primary">Dúvidas</span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Perguntas Frequentes
            </h2>
          </div>
          <div className="mt-12 space-y-4">
            {faqs.map((faq, i) => (
              <Card
                key={i}
                className="cursor-pointer border-border/50 transition-all hover:border-primary/20"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold sm:text-base">{faq.q}</h3>
                    <ChevronRight className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${openFaq === i ? 'rotate-90' : ''}`} />
                  </div>
                  {openFaq === i && (
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                      {faq.a}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/50 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <HeartPulse className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Pronto para modernizar <br className="hidden sm:inline" />sua operação de APH?
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Junte-se às empresas que já eliminaram o papel e estão gerenciando seus eventos com eficiência e segurança.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2 px-10 text-base shadow-xl shadow-primary/25 transition-transform hover:scale-105">
                <MessageCircle className="h-5 w-5" />
                Solicitar Acesso via WhatsApp
              </Button>
            </a>
            <Link to="/auth">
              <Button variant="ghost" size="lg" className="gap-2 text-base">
                Já tenho conta
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Configuração rápida • Suporte dedicado • Sem fidelidade
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>© {new Date().getFullYear()} SAPH — Sistema de Gestão Pré-Hospitalar</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Todos os direitos reservados</span>
              <span>•</span>
              <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 transition-colors hover:text-primary">
                <MessageCircle className="h-3 w-3" />
                Contato
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
