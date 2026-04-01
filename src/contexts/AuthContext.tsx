import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, AppRole, Empresa, SaaSModule, PlanoEmpresa } from '@/types/database';
import { PLAN_MODULES } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  empresa: Empresa | null;
  isSuperAdmin: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  clearMustChangePassword: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  checkModuleAccess: (modulo: SaaSModule) => boolean;
  isSubscriptionActive: boolean;
  isReadOnly: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

      if (session?.user) {
          Promise.all([
            fetchProfile(session.user.id),
            fetchRoles(session.user.id),
            checkSuperAdmin(session.user.id),
          ]);
        } else {
          setProfile(null);
          setRoles([]);
          setEmpresa(null);
          setIsSuperAdmin(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([
          fetchProfile(session.user.id),
          fetchRoles(session.user.id),
          checkSuperAdmin(session.user.id),
        ]);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const profileData = data as any;
      setProfile(profileData as Profile);
      if (profileData.empresa_id) {
        fetchEmpresa(profileData.empresa_id);
      }
    } else if (!error && !data) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário';
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ user_id: userId, full_name: fullName, email: user.email } as any)
          .select()
          .maybeSingle();
        if (newProfile) setProfile(newProfile as any as Profile);
      }
    }
  };

  const fetchEmpresa = async (empresaId: string) => {
    // Use raw fetch since types.ts may not have empresas yet
    const { data, error } = await (supabase.from as any)('empresas')
      .select('*')
      .eq('id', empresaId)
      .maybeSingle();

    if (!error && data) {
      setEmpresa(data as Empresa);
    }
  };

  const fetchRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (!error && data) {
      setRoles(data.map(r => r.role as AppRole));
    }
  };

  const checkSuperAdmin = async (userId: string) => {
    const { data, error } = await (supabase.from as any)('super_admins')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    setIsSuperAdmin(!error && !!data);
  };

  const logAuthEvent = async (eventType: string, email: string, success: boolean, errorMessage?: string) => {
    try {
      // Fire-and-forget, don't block auth flow
      supabase.functions.invoke('log-auth-event', {
        body: {
          event_type: eventType,
          email,
          success,
          error_message: errorMessage,
        },
      });
    } catch {
      // Silently fail - logging should never block auth
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    logAuthEvent(
      error ? 'login_failure' : 'login_success',
      email,
      !error,
      error?.message
    );
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    return { error };
  };

  const signOut = async () => {
    logAuthEvent('logout', user?.email || '', true);
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setEmpresa(null);
    setIsSuperAdmin(false);
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  const isAdmin = hasRole('admin') || isSuperAdmin;

  const checkModuleAccess = (modulo: SaaSModule): boolean => {
    if (isSuperAdmin) return true;
    if (!empresa) return false;

    const { plano, status_assinatura } = empresa;
    if (status_assinatura === 'SUSPENSA' || status_assinatura === 'CANCELADA') return false;

    const allowedModules: SaaSModule[] = PLAN_MODULES[plano] || [];
    return allowedModules.includes(modulo);
  };

  const mustChangePassword = !!profile && !!(profile as any).must_change_password;

  const clearMustChangePassword = () => {
    if (profile) {
      setProfile({ ...profile, must_change_password: false } as Profile);
    }
  };

  const isSubscriptionActive = isSuperAdmin || !empresa ||
    ['ATIVA', 'TRIAL', 'PENDENTE'].includes(empresa?.status_assinatura || '');

  const isReadOnly = !!empresa &&
    ['SUSPENSA', 'CANCELADA'].includes(empresa.status_assinatura) &&
    !isSuperAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        empresa,
        isSuperAdmin,
        isLoading,
        mustChangePassword,
        clearMustChangePassword,
        signIn,
        signUp,
        signOut,
        hasRole,
        isAdmin,
        checkModuleAccess,
        isSubscriptionActive,
        isReadOnly,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
