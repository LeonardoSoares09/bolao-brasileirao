/* Cron de placares — atualiza placares ao vivo/finais sozinho, sem depender
   de ninguém com o app aberto. Disparado por:
     - Vercel Cron Jobs (vercel.json) → manda "Authorization: Bearer <CRON_SECRET>"
     - Cron externo (ex.: cron-job.org) → pode mandar o mesmo header OU o segredo
       na URL: ?key=<CRON_SECRET> (mais simples de configurar num agendador).
   Só passa quem mandar o segredo correto. Reaproveita acaoResultados() de
   futebol.js: mesma lógica do botão manual. O dedup de 55s lá dentro protege
   o rate limit da football-data mesmo que o cron bata de minuto em minuto. */

import { acaoResultados } from "./futebol.js";

export default async function handler(req, res) {
  /* DIAGNÓSTICO TEMPORÁRIO — remover depois. Não vaza o valor: só comprimentos
     e se bate. Ajuda a ver se a env CRON_SECRET chegou neste deploy. */
  if (req.query?.diag === "1") {
    const env = process.env.CRON_SECRET || "";
    const key = String(req.query?.key || "");
    res.status(200).json({
      envPresent: !!process.env.CRON_SECRET,
      envLen: env.length,
      keyLen: key.length,
      exactMatch: env === key,
      trimMatch: env.trim() === key.trim(),
      hasFootballKey: !!process.env.FOOTBALL_DATA_KEY,
    });
    return;
  }

  const auth = req.headers.authorization || "";
  const viaHeader = auth === `Bearer ${process.env.CRON_SECRET}`;
  const viaQuery = req.query?.key === process.env.CRON_SECRET ||
                   req.query?.secret === process.env.CRON_SECRET;
  if (!process.env.CRON_SECRET || (!viaHeader && !viaQuery)) {
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
