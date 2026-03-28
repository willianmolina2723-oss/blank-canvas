import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// Handle push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: { title: string; body: string; icon?: string; badge?: string; data?: any };
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
    vibrate: [200, 100, 200],
    tag: "saph-notification",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));

  // Play notification sound
  const clients = self.clients;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      windowClients.forEach((client) => {
        client.postMessage({
          type: "PLAY_NOTIFICATION_SOUND",
          sound: "/notification-sound.mp3",
        });
      });
    })
  );
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window or open new one
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      self.clients.openWindow(url);
    })
  );
});
