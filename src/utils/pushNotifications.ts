import { supabase } from '@/integrations/supabase/client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidPublicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-vapid-key');
  if (error) throw error;
  return data.publicKey;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.ready;
  const publicKey = await getVapidPublicKey();

  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const subJson = subscription.toJSON();
  const { error } = await (supabase as any).from('push_subscriptions').insert({
    user_id: user.id,
    endpoint: subJson.endpoint!,
    p256dh: subJson.keys!.p256dh!,
    auth: subJson.keys!.auth!,
  });

  // Ignore duplicate key errors
  if (error && !error.message?.includes('duplicate')) {
    console.error('Error saving push subscription:', error);
    return false;
  }

  return true;
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
