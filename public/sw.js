/* Service Worker — Bolão da Copa 2026
   Recebe notificações push e abre o app ao clicar. */

self.addEventListener("push", (event) => {
  let titulo = "Bolão da Copa 2026";
  let corpo  = "Você tem uma atualização no bolão!";
  let url    = "/";

  try {
    const data = event.data?.json();
    if (data?.titulo) titulo = data.titulo;
    if (data?.corpo)  corpo  = data.corpo;
    if (data?.url)    url    = data.url;
  } catch { /* payload não é JSON — usa defaults */ }

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: "/icone bolao.png",
      badge: "/icone bolao.png",
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
        /* Se o app já está aberto, foca a aba existente */
        const aberta = lista.find((c) => c.url.startsWith(self.location.origin));
        if (aberta) return aberta.focus();
        /* Senão abre uma nova janela */
        return clients.openWindow(self.location.origin + url);
      })
  );
});
