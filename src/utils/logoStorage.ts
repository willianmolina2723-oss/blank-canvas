import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'app-assets';
const LEGACY_LOGO_FILE = 'logo.png';
const LEGACY_SETTINGS_FILE = 'pdf-settings.json';

async function getEmpresaPrefix(): Promise<string> {
  const { data } = await supabase.rpc('get_empresa_id');
  if (!data) throw new Error('Empresa não encontrada para o usuário atual');
  return data as string;
}

function logoPath(empresaId: string) {
  return `${empresaId}/logo.png`;
}

function settingsPath(empresaId: string) {
  return `${empresaId}/pdf-settings.json`;
}

function badgeTemplatePath(empresaId: string) {
  return `${empresaId}/badge-template.png`;
}

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function resolveExistingAssetUrl(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    const url = getPublicUrl(path);
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { method: 'HEAD' });
      if (res.ok) return `${url}?t=${Date.now()}`;
    } catch {
      // Try next path
    }
  }

  return null;
}

export async function uploadLogo(file: File): Promise<string> {
  const empresaId = await getEmpresaPrefix();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', logoPath(empresaId));

  const { data, error } = await supabase.functions.invoke('setup-storage', {
    body: formData,
  });

  if (error) throw error;
  return data.url;
}

export function getLogoPublicUrl(empresaId: string): string {
  return getPublicUrl(logoPath(empresaId));
}

export async function fetchLogoUrl(): Promise<string | null> {
  try {
    const empresaId = await getEmpresaPrefix();
    return await resolveExistingAssetUrl([logoPath(empresaId), LEGACY_LOGO_FILE]);
  } catch {
    return await resolveExistingAssetUrl([LEGACY_LOGO_FILE]);
  }
}

export async function deleteLogo(): Promise<void> {
  const empresaId = await getEmpresaPrefix();
  const { error } = await supabase.functions.invoke('setup-storage', {
    body: { action: 'delete', path: logoPath(empresaId) },
  });
  if (error) throw error;
}

export async function checkLogoExists(): Promise<{ exists: boolean; empresaId: string | null; url: string | null }> {
  try {
    const empresaId = await getEmpresaPrefix();
    const url = await resolveExistingAssetUrl([logoPath(empresaId), LEGACY_LOGO_FILE]);
    return { exists: !!url, empresaId, url };
  } catch {
    const url = await resolveExistingAssetUrl([LEGACY_LOGO_FILE]);
    return { exists: !!url, empresaId: null, url };
  }
}

export async function fetchLogoAsBase64(): Promise<string | null> {
  try {
    const url = await fetchLogoUrl();
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function saveOrgName(name: string): Promise<void> {
  const empresaId = await getEmpresaPrefix();
  const { error } = await supabase.functions.invoke('setup-storage', {
    body: { orgName: name, empresaId },
  });
  if (error) throw error;
}

export async function fetchOrgName(): Promise<string> {
  try {
    const empresaId = await getEmpresaPrefix();

    for (const path of [settingsPath(empresaId), LEGACY_SETTINGS_FILE]) {
      const res = await fetch(`${getPublicUrl(path)}?t=${Date.now()}`);
      if (!res.ok) continue;
      const json = await res.json();
      return json.orgName || '';
    }

    return '';
  } catch {
    try {
      const res = await fetch(`${getPublicUrl(LEGACY_SETTINGS_FILE)}?t=${Date.now()}`);
      if (!res.ok) return '';
      const json = await res.json();
      return json.orgName || '';
    } catch {
      return '';
    }
  }
}

// Badge template functions
export async function uploadBadgeTemplate(file: File): Promise<string> {
  const empresaId = await getEmpresaPrefix();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', badgeTemplatePath(empresaId));

  const { data, error } = await supabase.functions.invoke('setup-storage', {
    body: formData,
  });

  if (error) throw error;
  return data.url;
}

export function getBadgeTemplatePublicUrl(empresaId: string): string {
  return getPublicUrl(badgeTemplatePath(empresaId));
}

export async function deleteBadgeTemplate(): Promise<void> {
  const empresaId = await getEmpresaPrefix();
  const { error } = await supabase.functions.invoke('setup-storage', {
    body: { action: 'delete', path: badgeTemplatePath(empresaId) },
  });
  if (error) throw error;
}

export async function checkBadgeTemplateExists(): Promise<{ exists: boolean; empresaId: string | null }> {
  try {
    const empresaId = await getEmpresaPrefix();
    const url = getBadgeTemplatePublicUrl(empresaId);
    const res = await fetch(`${url}?t=${Date.now()}`, { method: 'HEAD' });
    return { exists: res.ok, empresaId };
  } catch {
    return { exists: false, empresaId: null };
  }
}

export async function fetchBadgeTemplateUrl(): Promise<string | null> {
  try {
    const empresaId = await getEmpresaPrefix();
    const url = getBadgeTemplatePublicUrl(empresaId);
    const res = await fetch(`${url}?t=${Date.now()}`, { method: 'HEAD' });
    if (!res.ok) return null;
    return `${url}?t=${Date.now()}`;
  } catch {
    return null;
  }
}
