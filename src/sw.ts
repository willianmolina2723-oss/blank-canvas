/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

precacheAndRoute(self.__WB_MANIFEST);

// Handle push notifications
self.addEventListener("push", ((event: PushEvent) => {
  if (!event.data) return;

  let payload: { title: string; body: string; icon?: string; badge?: string; data?: Record<string, unknown> };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "SAPH", body: event.data.text() };
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/icon-72x72.png",
    data: payload.data,
    tag: "saph-notification",
  };

  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).registration.showNotification(payload.title, options)
  );

  // Play notification sound
  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients: readonly Client[]) => {
        windowClients.forEach((client) => {
          client.postMessage({
            type: "PLAY_NOTIFICATION_SOUND",
            sound: "/notification-sound.mp3",
          });
        });
      })
  );
}) as EventListener);

// Handle notification click
self.addEventListener("notificationclick", ((event: NotificationEvent) => {
  event.notification.close();

  const url = (event.notification.data as Record<string, string>)?.url || "/dashboard";

  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients: readonly Client[]) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            (client as WindowClient).focus();
            (client as WindowClient).navigate(url);
            return;
          }
        }
        (self as unknown as ServiceWorkerGlobalScope).clients.openWindow(url);
      })
  );
}) as EventListener);
