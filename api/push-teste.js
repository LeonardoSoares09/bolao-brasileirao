/* /api/push-teste — envia notificação de teste para o próprio admin (só admin) */

import { autenticar } from "../lib/db.js";
import { enviarPush } from "../lib/notificar.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não suportado" });

  const eu = await autenticar(req.body?.t);
  if (!eu || !eu.isAdmin) return res.status(403).json({ error: "Acesso negado" });

  await enviarPush(
    [eu.id],
    "🔔 Teste de push",
    "Se você está vendo isso, as notificações estão funcionando!",
    "/"
  );

  res.status(200).json({ ok: true });
}
