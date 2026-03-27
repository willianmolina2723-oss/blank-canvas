import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanAccess } from '@/hooks/usePlanAccess';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  FileText,
  Users,
  LogOut,
  Truck,
  Calendar,
  Archive,
  Menu,
  X,
  DollarSign,
  Briefcase,
  Crown,
  Settings,
} from 'lucide-react';
import { Shield } from 'lucide-react';

export function Header() {
  const { profile, signOut, isAdmin, isSuperAdmin, empresa } = useAuth();
  const { canAccess, currentPlanLabel } = usePlanAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Filter nav items based on role and plan
  const navItems = isSuperAdmin
    ? [{ label: 'Empresas', icon: Crown, path: '/super-admin', adminOnly: false, module: null }]
    : allNavItems.filter(item => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.module && !canAccess(item.module)) return false;
        if ('hideOnPlan' in item && item.hideOnPlan && empresa?.plano === item.hideOnPlan) return false;
        return true;
      });

  const handleNavigate = (path: string) => {
    navigate(path);
    setSidebarOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full">
        <div className="bg-[hsl(220,30%,15%)] mx-0 px-3 lg:px-5 py-2.5">
          <div className="flex items-center gap-4">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex lg:hidden items-center justify-center h-10 w-10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity flex-shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                <Shield className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="hidden lg:block text-white font-bold text-lg">SAPH</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
              {navItems.map((item) => {
                const active = item.path === '/' ? location.pathname === '/' : isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all min-h-[44px] ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Spacer for mobile */}
            <div className="flex-1 lg:hidden" />

            {/* Empresa info + User & Logout */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Empresa badge - only for non-super-admin */}
              {!isSuperAdmin && empresa && (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-[10px] font-semibold text-white/70 truncate max-w-[120px]">{empresa.nome_fantasia}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">{currentPlanLabel}</span>
                </div>
              )}
              {profile?.full_name && (
                <span className="hidden lg:block text-xs text-white/50 max-w-[120px] truncate">
                  {profile.full_name}
                </span>
              )}
              <button
                onClick={signOut}
                className="flex items-center justify-center h-10 w-10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all"
                title="Sair"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-[hsl(220,30%,15%)] transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                <Shield className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-white font-bold text-lg">SAPH</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex items-center justify-center h-10 w-10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* User info */}
          <div className="px-4 py-3 border-b border-white/10">
            {profile?.full_name && (
              <>
                <p className="text-sm font-semibold text-white truncate">{profile.full_name}</p>
                <p className="text-xs text-white/40 truncate">{profile.email}</p>
              </>
            )}
            {!isSuperAdmin && empresa && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-white/60 truncate">{empresa.nome_fantasia}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">{currentPlanLabel}</span>
              </div>
            )}
          </div>

          {/* Nav Items */}
          <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
            {navItems.map((item) => {
              const active = item.path === '/' ? location.pathname === '/' : isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all min-h-[48px] ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="p-3 border-t border-white/10">
            <button
              onClick={() => { signOut(); setSidebarOpen(false); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-all min-h-[48px]"
            >
              <LogOut className="h-5 w-5" />
              Sair
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
