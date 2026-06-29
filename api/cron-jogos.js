/* Cron de jogos do dia — cadastra/adota as partidas da Copa de hoje sozinho,
   sem depender de o organizador lembrar de abrir o app e clicar em "Jogos de
   hoje". Disparado por:
     - Vercel Cron Jobs (vercel.json) → manda "Authorization: Bearer <CRON_SECRET>"
     - Cron externo (ex.: cron-job.org) → pode mandar o mesmo header OU o segredo
       na URL: ?key=<CRON_SECRET> (mais simples de configurar num agendador).
   Só passa quem mandar o segredo correto. Reaproveita acaoJogosHoje() de
   futebol.js: mesma lógica do botão manual "⚡ Jogos de hoje", que continua
   existindo como fallback caso esta automação falhe. acaoJogosHoje() é
   idempotente (só conta adicionados/atualizados quando algo muda), então rodar
   de novo no mesmo dia é seguro. */

import { acaoJogosHoje } from "./futebol.js";

export default async function handler(req, res) {
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
    const r = await acaoJogosHoje();
    res.status(200).json({ ok: true, ...r });
  } catch (e) {
    console.error("cron-jogos", e);
    res.status(500).json({ error: "falha no cron" });
  }
}
