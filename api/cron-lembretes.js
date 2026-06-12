/* /api/cron-lembretes — lembrete diário de palpites pendentes (Gatilho A).
   Chamado por cron-job.org às 11:00 BRT (14:00 UTC) com:
     Authorization: Bearer <CRON_SECRET>
   Envia notificação APENAS para quem tem palpite faltando em jogo de hoje. */

import { sql } from "../lib/db.js";
import { enviarPush } from "../lib/notificar.js";

/* Data de hoje em America/Sao_Paulo no formato YYYY-MM-DD */
function hojeEmSP() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const hoje = hojeEmSP();

    /* Jogos de hoje que ainda não têm resultado */
    const jogosHoje = await sql`
      SELECT id, casa, fora, kickoff
      FROM jogos
      WHERE DATE(kickoff AT TIME ZONE 'America/Sao_Paulo') = ${hoje}
        AND gh IS NULL AND ga IS NULL
        AND kickoff > now()
    `;

    if (jogosHoje.length === 0) {
      res.status(200).json({ ok: true, enviados: 0, motivo: "nenhum jogo aberto hoje" });
      return;
    }

    const jogoIds = jogosHoje.map((j) => j.id);

    /* Participantes com pelo menos um palpite faltando */
    const faltando = await sql`
      SELECT DISTINCT p.id AS participante_id
      FROM participantes p
      WHERE p.id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM unnest(${jogoIds}::int[]) AS jid(id)
          WHERE NOT EXISTS (
            SELECT 1 FROM palpites pl
            WHERE pl.participante_id = p.id AND pl.jogo_id = jid.id
          )
        )
    `;

    if (faltando.length === 0) {
      res.status(200).json({ ok: true, enviados: 0, motivo: "todos já palpitaram" });
      return;
    }

    const ids = faltando.map((r) => r.participante_id);

    /* Monta resumo dos jogos para o corpo da notificação */
    const resumo = jogosHoje
      .map((j) => {
        const hora = new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit", minute: "2-digit",
        }).format(new Date(j.kickoff));
        return `${j.casa} × ${j.fora} às ${hora}`;
      })
      .join(" | ");

    await enviarPush(
      ids,
      "⏰ Palpite pendente!",
      `Você ainda não palpitou: ${resumo}`,
      "/"
    );

    res.status(200).json({ ok: true, enviados: ids.length, jogos: jogosHoje.length });
  } catch (e) {
    console.error("cron-lembretes", e);
    res.status(500).json({ error: "falha no cron de lembretes" });
  }
}
