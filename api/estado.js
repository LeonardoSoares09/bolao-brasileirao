/* GET /api/estado?t=TOKEN
   Retorna o estado completo pro usuário do token.
   Regra anti-cópia: palpites dos OUTROS só aparecem depois que o
   jogo começou (kickoff <= now) ou já tem resultado. Os próprios
   palpites sempre aparecem. Admin vê tudo (precisa corrigir erros).

   Esta é a rota mais chamada do app e não toca mais o Postgres quando o
   snapshot está quente — nem para autenticar. É o que permite o compute do
   Neon dormir entre os jogos; ver o comentário de lib/snapshot.js. A regra
   anti-cópia continua aplicada no servidor, dentro de montarEstado(). */

import { lerSnapshot, autenticarNoSnapshot, montarEstado } from "../lib/snapshot.js";
import { PRAZO_PAGAMENTO_FIXO, PRAZO_ARTILHEIRO_FIXO } from "../lib/clubes.js";

export default async function handler(req, res) {
  const snap = await lerSnapshot();

  const eu = autenticarNoSnapshot(snap, req.query.t);
  if (!eu) {
    res.status(401).json({ error: "Link inválido — peça seu link ao organizador." });
    return;
  }

  res.status(200).json(
    montarEstado(snap, eu, {
      prazoBonus: PRAZO_ARTILHEIRO_FIXO,
      prazoPagamento: PRAZO_PAGAMENTO_FIXO,
    })
  );
}
