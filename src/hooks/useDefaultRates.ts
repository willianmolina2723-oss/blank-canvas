import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/database';

const HARDCODED_DEFAULTS: Record<string, number> = {
  condutor: 18,
  enfermeiro: 18,
  tecnico: 18,
  medico: 80,
  admin: 0,
};

const CONFIG_KEYS: Record<string, string> = {
  condutor: 'default_rate_condutor',
  enfermeiro: 'default_rate_enfermeiro',
  tecnico: 'default_rate_tecnico',
  medico: 'default_rate_medico',
};

export function useDefaultRates() {
  const [rates, setRates] = useState<Record<string, number>>(HARDCODED_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRates();
  }, []);

  const loadRates = async () => {
    try {
      const keys = Object.values(CONFIG_KEYS);
      const { data } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', keys);

      if (data && data.length > 0) {
        const newRates = { ...HARDCODED_DEFAULTS };
        for (const row of data) {
          const role = Object.entries(CONFIG_KEYS).find(([, k]) => k === row.key)?.[0];
          if (role) {
            const val = parseFloat(row.value);
            if (!isNaN(val) && val > 0) newRates[role] = val;
          }
        }
        setRates(newRates);
      }
    } catch (err) {
      console.error('Error loading default rates:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveRates = async (newRates: Record<string, number>) => {
    const upserts = Object.entries(CONFIG_KEYS).map(([role, key]) => ({
      key,
      value: String(newRates[role] ?? HARDCODED_DEFAULTS[role] ?? 0),
    }));

    const { error } = await (supabase as any)
      .from('app_config')
      .upsert(upserts, { onConflict: 'key' });

    if (error) throw error;
    setRates({ ...HARDCODED_DEFAULTS, ...newRates });
  };

  const getRate = (role: string, profileValorHora?: number): number => {
    if (profileValorHora && profileValorHora > 0) return profileValorHora;
    return rates[role] ?? HARDCODED_DEFAULTS[role] ?? 18;
  };

  return { rates, loading, saveRates, getRate, CONFIG_KEYS };
}
