/* Service Worker — Bolão da Copa 2026 */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  let titulo = "Bolão da Copa 2026";
  let corpo  = "Você tem uma atualização no bolão!";
  let url    = "/";
  let tag    = "bolao-geral";

  try {
    const data = event.data?.json();
    if (data?.titulo) titulo = data.titulo;
    if (data?.corpo)  corpo  = data.corpo;
    if (data?.url)    url    = data.url;
    if (data?.tag)    tag    = data.tag;
  } catch { /* payload não é JSON — usa defaults */ }

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: "/icone bolao.png",
      badge: "/icone bolao.png",
      tag,
      renotify: true,
      requireInteraction: false,
      data: { url },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((lista) => {
        const aberta = lista.find((c) => c.url.startsWith(self.location.origin));
        if (aberta) {
          aberta.focus();
          if ("navigate" in aberta) aberta.navigate(self.location.origin + url);
          return;
        }
        return clients.openWindow(self.location.origin + url);
      })
  );
});
