/* /api/push — gerência de subscriptions Web Push
   GET  ?t=TOKEN                        → retorna VAPID public key
   POST { t, subscription }             → inscreve / atualiza dispositivo
   POST { t, teste: true }              → envia push de teste (só admin)
   DELETE { t, endpoint }               → cancela inscrição */

import { sql, autenticar } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: "Push não configurado no servidor" });
    return res.status(200).json({ vapidPublicKey: key });
  }

  const token = req.body?.t;
  const eu = await autenticar(token);
  if (!eu || eu.id === null) {
    return res.status(401).json({ error: "Token inválido" });
  }

  if (req.method === "POST" && req.body?.teste) {
    if (!eu.isAdmin) return res.status(403).json({ error: "Acesso negado" });
    const { enviarPush } = await import("../lib/notificar.js");
    await enviarPush([eu.id], "🔔 Teste de push", "Se você está vendo isso, as notificações estão funcionando!", "/", "bolao-teste");
    return res.status(200).json({ ok: true });
  }

  if (req.method === "POST") {
    const sub = req.body?.subscription;
    if (!sub || typeof sub !== "object" || !sub.endpoint) {
      return res.status(400).json({ error: "subscription inválida" });
    }
    await sql`
      INSERT INTO push_subscriptions (participante_id, subscription, endpoint)
      VALUES (${eu.id}, ${JSON.stringify(sub)}, ${sub.endpoint})
      ON CONFLICT (endpoint) DO UPDATE
        SET subscription    = EXCLUDED.subscription,
            participante_id = EXCLUDED.participante_id
    `;
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: "endpoint obrigatório" });
    await sql`
      DELETE FROM push_subscriptions
      WHERE endpoint = ${endpoint} AND participante_id = ${eu.id}
    `;
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Método não suportado" });
}
