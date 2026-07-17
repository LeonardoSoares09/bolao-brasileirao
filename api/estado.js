/* GET /api/estado?t=TOKEN
   Retorna o estado completo pro usuário do token.
   Regra anti-cópia: palpites dos OUTROS só aparecem depois que o
   jogo começou (kickoff <= now) ou já tem resultado. Os próprios
   palpites sempre aparecem. Admin vê tudo (precisa corrigir erros). */

import { sql, autenticar, motivoBloqueioPagamento } from "../lib/db.js";
import { RODADA_LIMITE_ARTILHEIRO, PRAZO_PAGAMENTO_FIXO } from "../lib/clubes.js";

export default async function handler(req, res) {
  const eu = await autenticar(req.query.t);
  if (!eu) {
    /* distingue "link nunca existiu" de "bloqueado por falta de pagamento"
       só aqui (tela inicial) — os outros endpoints ficam com a mensagem
       genérica, sem problema: nessa altura o usuário nem chega neles. */
    if (await motivoBloqueioPagamento(req.query.t)) {
      res.status(403).json({ error: "Seu acesso foi bloqueado por falta de pagamento — fale com o organizador pra reativar." });
      return;
    }
    res.status(401).json({ error: "Link inválido — peça seu link ao organizador." });
    return;
  }

  const [participantes, jogos, contagens, palpitesCampeao, palpitesArtilheiro, resultadoEspecialRows, premiadosArtilheiro, antecedenciaRows, reacoesRows, configRows, prazoRows] = await Promise.all([
    sql`SELECT id, nome, is_admin, avatar_emoji, avatar_cor, pagou FROM participantes ORDER BY nome`,
    sql`SELECT id, casa, fora, kickoff, gh, ga, rodada, peso, live FROM jogos ORDER BY kickoff NULLS LAST, id`,
    sql`SELECT jogo_id, COUNT(*)::int AS total FROM palpites GROUP BY jogo_id`,
    sql`SELECT participante_id, selecao FROM palpite_campeao WHERE confirmado = TRUE`,
    eu.isAdmin
      ? sql`SELECT participante_id, jogador FROM palpite_artilheiro ORDER BY participante_id`
      : sql`SELECT participante_id, jogador FROM palpite_artilheiro WHERE confirmado = TRUE`,
    sql`SELECT tipo, valor, confirmado FROM resultado_especial`,
    sql`SELECT participante_id FROM artilheiro_premiado`,
    /* Desempate (5º critério): ANTECEDÊNCIA MÉDIA — quão antes do kickoff a
       pessoa costuma palpitar, em segundos (kickoff - atualizado_em), média
       sobre todos os jogos que ela palpitou e que têm horário. Maior = mais
       rápida. Usa atualizado_em (NÃO criado_em) de propósito: se a pessoa edita
       o palpite mais perto do jogo (já com escalação/notícias), o horário que
       vale é o da EDIÇÃO — senão dava pra cravar cedo só pra marcar tempo e
       depois trocar com mais info, levando vantagem indevida no desempate.
       Premia consistência (não a data de entrada), então não penaliza quem
       entrou depois do 1º jogo. Só jogos com kickoff definido entram. */
    sql`
      SELECT p.participante_id,
             AVG(EXTRACT(EPOCH FROM (j.kickoff - p.atualizado_em))) AS antecedencia_seg
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      WHERE j.kickoff IS NOT NULL
      GROUP BY p.participante_id
    `,
    sql`SELECT jogo_id, participante_id, emoji FROM reacoes`,
    /* dados "ao vivo" administrados pelo admin: gols atuais dos artilheiros
       escolhidos e times marcados como fora da disputa pelo título. */
    sql`SELECT chave, valor FROM config WHERE chave IN ('artilheiro_gols', 'times_fora_disputa')`,
    /* prazo do palpite de artilheiro — trava no kickoff do 1º jogo da rodada
       RODADA_LIMITE_ARTILHEIRO. NULL se essa rodada ainda não foi cadastrada
       (cron ainda não chegou nela). */
    sql`SELECT MIN(kickoff) AS inicio FROM jogos WHERE rodada = ${RODADA_LIMITE_ARTILHEIRO}`,
  ]);

  const cfg = {};
  for (const r of configRows) {
    try { cfg[r.chave] = r.valor ? JSON.parse(r.valor) : null; } catch { cfg[r.chave] = null; }
  }

  const reMap = {};
  for (const r of resultadoEspecialRows) reMap[r.tipo] = { valor: r.valor, confirmado: r.confirmado };

  const palpites = eu.isAdmin
    ? await sql`SELECT jogo_id, participante_id, h, a, atualizado_em FROM palpites`
    : await sql`
        SELECT p.jogo_id, p.participante_id, p.h, p.a, p.atualizado_em
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
      avatarEmoji: p.avatar_emoji, avatarCor: p.avatar_cor, pagou: p.pagou,
    })),
    jogos,
    palpites,
    contagens,
    palpitesCampeao,
    palpitesArtilheiro,
    reacoes: reacoesRows,
    premiadosArtilheiro: premiadosArtilheiro.map((r) => r.participante_id),
    antecedenciaMedia: antecedenciaRows.map((r) => ({ participante_id: r.participante_id, segundos: Number(r.antecedencia_seg) })),
    resultadoEspecial: { campeao: reMap.campeao || null, artilheiro: reMap.artilheiro || null },
    artilheiroGols: cfg.artilheiro_gols && typeof cfg.artilheiro_gols === "object" ? cfg.artilheiro_gols : {},
    timesForaDaDisputa: Array.isArray(cfg.times_fora_disputa) ? cfg.times_fora_disputa : [],
    prazoBonus: prazoRows[0]?.inicio ? new Date(prazoRows[0].inicio).toISOString() : null,
    /* data fixa (não depende de jogos cadastrados) — ver PRAZO_PAGAMENTO_FIXO em lib/clubes.js */
    prazoPagamento: new Date(PRAZO_PAGAMENTO_FIXO).toISOString(),
    agora: new Date().toISOString(),
  });
}
