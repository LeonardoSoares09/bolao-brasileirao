/* /api/manifest?t=TOKEN — manifest dinâmico com start_url contendo o token
   Permite que a PWA instalada no iOS abra com o token correto de cada participante. */

export default function handler(req, res) {
  const t = req.query.t || "";
  const startUrl = t ? `/?t=${encodeURIComponent(t)}` : "/";

  const manifest = {
    id: "/bolao-copa-2026",
    name: "Bolão da Copa 2026",
    short_name: "Bolão Copa",
    description: "Acompanhe o bolão da Copa do Mundo 2026",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#071a0e",
    theme_color: "#071a0e",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icone bolao.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icone bolao.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(manifest);
}
