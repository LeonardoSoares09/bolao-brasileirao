/* /api/push — gerência de subscriptions Web Push
   GET  ?t=TOKEN          → retorna a VAPID public key (sem auth obrigatória)
   POST { t, subscription } → inscreve / atualiza o dispositivo (upsert por endpoint)
   DELETE { t, endpoint }   → cancela inscrição */

import { sql, autenticar } from "../lib/db.js";

export default async function handler(req, res) {
  /* GET — chave pública VAPID, necessária pelo front para montar a subscription */
  if (req.method === "GET") {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) {
      res.status(503).json({ error: "Push não configurado no servidor" });
      return;
    }
    res.status(200).json({ vapidPublicKey: key });
    return;
  }

  /* POST e DELETE exigem token válido */
  const token = req.method === "POST" ? req.body?.t : req.body?.t;
  const eu = await autenticar(token);
  if (!eu || eu.id === null) {
    res.status(401).json({ error: "Token inválido ou token mestre não suportado" });
    return;
  }

  if (req.method === "POST") {
    const sub = req.body?.subscription;
    if (!sub || typeof sub !== "object" || !sub.endpoint) {
      res.status(400).json({ error: "subscription inválida" });
      return;
    }
    await sql`
      INSERT INTO push_subscriptions (participante_id, subscription, endpoint)
      VALUES (${eu.id}, ${JSON.stringify(sub)}, ${sub.endpoint})
      ON CONFLICT (endpoint) DO UPDATE
        SET subscription    = EXCLUDED.subscription,
            participante_id = EXCLUDED.participante_id
    `;
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      res.status(400).json({ error: "endpoint obrigatório" });
      return;
    }
    await sql`
      DELETE FROM push_subscriptions
      WHERE endpoint = ${endpoint} AND participante_id = ${eu.id}
    `;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
