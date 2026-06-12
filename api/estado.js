/* GET /api/estado?t=TOKEN
   Retorna o estado completo pro usuário do token.
   Regra anti-cópia: palpites dos OUTROS só aparecem depois que o
   jogo começou (kickoff <= now) ou já tem resultado. Os próprios
   palpites sempre aparecem. Admin vê tudo (precisa corrigir erros). */

import { sql, autenticar } from "../lib/db.js";

export default async function handler(req, res) {
  const eu = await autenticar(req.query.t);
  if (!eu) {
    res.status(401).json({ error: "Link inválido — peça seu link ao organizador." });
    return;
  }

  const [participantes, jogos, contagens, palpitesCampeao, palpitesArtilheiro, resultadoEspecialRows, premiadosArtilheiro] = await Promise.all([
    sql`SELECT id, nome, is_admin, avatar_emoji, avatar_cor FROM participantes ORDER BY nome`,
    sql`SELECT id, casa, fora, kickoff, gh, ga, fase FROM jogos ORDER BY kickoff NULLS LAST, id`,
    sql`SELECT jogo_id, COUNT(*)::int AS total FROM palpites GROUP BY jogo_id`,
    sql`SELECT participante_id, selecao FROM palpite_campeao WHERE confirmado = TRUE`,
    eu.isAdmin
      ? sql`SELECT participante_id, jogador FROM palpite_artilheiro ORDER BY participante_id`
      : sql`SELECT participante_id, jogador FROM palpite_artilheiro WHERE confirmado = TRUE`,
    sql`SELECT tipo, valor, confirmado FROM resultado_especial`,
    sql`SELECT participante_id FROM artilheiro_premiado`,
  ]);

  const reMap = {};
  for (const r of resultadoEspecialRows) reMap[r.tipo] = { valor: r.valor, confirmado: r.confirmado };

  const palpites = eu.isAdmin
    ? await sql`SELECT jogo_id, participante_id, h, a FROM palpites`
    : await sql`
        SELECT p.jogo_id, p.participante_id, p.h, p.a
        FROM palpites p
        JOIN jogos j ON j.id = p.jogo_id
        WHERE p.participante_id = ${eu.id ?? -1}
           OR (j.kickoff IS NOT NULL AND j.kickoff <= now())
           OR (j.gh IS NOT NULL AND j.ga IS NOT NULL)
      `;

  res.status(200).json({
    eu: { id: eu.id, nome: eu.nome, isAdmin: eu.isAdmin },
    participantes: participantes.map((p) => ({
      id: p.id, nome: p.nome,
      avatarEmoji: p.avatar_emoji, avatarCor: p.avatar_cor,
    })),
    jogos,
    palpites,
    contagens,
    palpitesCampeao,
    palpitesArtilheiro,
    premiadosArtilheiro: premiadosArtilheiro.map((r) => r.participante_id),
    resultadoEspecial: { campeao: reMap.campeao || null, artilheiro: reMap.artilheiro || null },
    agora: new Date().toISOString(),
  });
}
