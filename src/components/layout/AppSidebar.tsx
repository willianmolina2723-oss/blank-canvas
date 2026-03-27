import { useAuth } from '@/contexts/AuthContext';
import { usePlanAccess } from '@/hooks/usePlanAccess';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid, FileText, Users, LogOut, Truck, Calendar, Archive,
  DollarSign, Briefcase, Crown, Settings, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarState } from './SidebarState';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function AppSidebar() {
  const { profile, signOut, isAdmin, isSuperAdmin, empresa } = useAuth();
  const { canAccess, currentPlanLabel } = usePlanAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarState();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const allNavItems = [
    { label: 'Operações', icon: LayoutGrid, path: '/', adminOnly: false, module: null },
    { label: 'Oportunidades', icon: Briefcase, path: '/opportunities', adminOnly: false, module: 'oportunidades' as const },
    { label: 'Prontuários', icon: FileText, path: '/admin/patients', adminOnly: true, module: null },
    { label: 'Usuários', icon: Users, path: '/admin/users', adminOnly: true, module: null },
    { label: 'Viaturas', icon: Truck, path: '/admin/ambulances', adminOnly: true, module: null },
    { label: 'Eventos', icon: Calendar, path: '/admin/events', adminOnly: true, module: null },
    { label: 'Relatórios', icon: Archive, path: '/admin/reports', adminOnly: true, module: null },
    { label: 'Pagamentos', icon: DollarSign, path: '/admin/payroll', adminOnly: true, module: 'pagamentos_freelancers' as const, hideOnPlan: 'GESTAO_COMPLETA' as const },
    { label: 'Financeiro', icon: DollarSign, path: '/admin/financial', adminOnly: true, module: 'dashboard_financeiro' as const },
    { label: 'Configurações', icon: Settings, path: '/admin/settings', adminOnly: true, module: null },
  ];

  const navItems = isSuperAdmin
    ? [{ label: 'Empresas', icon: Crown, path: '/super-admin', adminOnly: false, module: null }]
    : allNavItems.filter(item => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.module && !canAccess(item.module)) return false;
        if ('hideOnPlan' in item && item.hideOnPlan && empresa?.plano === item.hideOnPlan) return false;
        return true;
      });

  const NavButton = ({ item }: { item: typeof navItems[0] }) => {
    const active = item.path === '/' ? location.pathname === '/' : isActive(item.path);
    
    const button = (
      <button
        onClick={() => navigate(item.path)}
        className={cn(
          'flex items-center gap-3 w-full rounded-xl text-[13px] font-semibold tracking-wide transition-all min-h-[42px]',
          collapsed ? 'justify-center px-2' : 'px-3',
          active
            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
            : 'text-white/55 hover:text-white hover:bg-white/8'
        )}
      >
        <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" className="font-semibold">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-40 h-screen flex flex-col bg-[hsl(220,30%,15%)] transition-all duration-300 ease-in-out border-r border-white/5',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo + collapse toggle */}
      <div className={cn(
        'flex items-center border-b border-white/10 min-h-[56px]',
        collapsed ? 'justify-center px-2 py-3' : 'justify-between px-3 py-3'
      )}>
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(false)}
                className="flex items-center justify-center h-10 w-10 rounded-xl hover:bg-white/10 transition-all"
              >
                <Shield className="h-6 w-6 text-primary" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir menu</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="text-white font-bold">SAPH</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="flex items-center justify-center h-8 w-8 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* User info - only when expanded */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-white/10">
          {profile?.full_name && (
            <>
              <p className="text-sm font-semibold text-white truncate">{profile.full_name}</p>
              <p className="text-[11px] text-white/40 truncate">{profile.email}</p>
            </>
          )}
          {!isSuperAdmin && empresa && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-white/50 truncate">{empresa.nome_fantasia}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold flex-shrink-0">{currentPlanLabel}</span>
            </div>
          )}
        </div>
      )}

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navItems.map((item) => (
          <NavButton key={item.path} item={item} />
        ))}
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-white/10">
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex items-center justify-center w-full rounded-xl text-white/55 hover:text-white hover:bg-white/8 transition-all min-h-[42px]"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-semibold">Sair</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 rounded-xl text-[13px] font-semibold text-white/55 hover:text-white hover:bg-white/8 transition-all min-h-[42px]"
          >
            <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
            Sair
          </button>
        )}
      </div>
    </aside>
  );
}
