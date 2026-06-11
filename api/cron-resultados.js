/* Cron da Vercel — atualiza placares finais sozinho.
   Disparado pelo Vercel Cron Jobs no horário definido em vercel.json.
   A Vercel envia o header "Authorization: Bearer <CRON_SECRET>" — só
   passa quem mandar o segredo correto. Reaproveita acaoResultados()
   de futebol.js: mesma lógica do botão manual. */

import { acaoResultados } from "./futebol.js";

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!process.env.FOOTBALL_DATA_KEY) {
    res.status(500).json({ error: "FOOTBALL_DATA_KEY ausente" });
    return;
  }
  try {
    const r = await acaoResultados();
    res.status(200).json({ ok: true, ...r });
  } catch (e) {
    console.error("cron-resultados", e);
    res.status(500).json({ error: "falha no cron" });
  }
}
