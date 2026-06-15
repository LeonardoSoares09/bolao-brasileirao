/* /api/reacao — reações emoji em jogos
   POST { t, jogoId, emoji }  → toggle: insere ou remove a reação do usuário
   GET  ?t=TOKEN&jogoId=ID    → lista reações de um jogo (não usado agora, estado.js cobre) */

import { sql, autenticar } from "../lib/db.js";

const EMOJIS_VALIDOS = ["🔥", "😱", "💀", "🎯", "😂", "🤡", "🐐", "💪", "😭", "🫡", "⚽", "🏆"];

export default async function handler(req, res) {
  const eu = await autenticar(req.method === "GET" ? req.query.t : req.body?.t);
  if (!eu || eu.id === null) {
    res.status(401).json({ error: "Link inválido" });
    return;
  }

  if (req.method === "POST") {
    const jogoId = Number(req.body?.jogoId);
    const emoji  = req.body?.emoji;
    if (!jogoId || !EMOJIS_VALIDOS.includes(emoji)) {
      res.status(400).json({ error: "jogoId ou emoji inválido" });
      return;
    }

    /* verifica se jogo existe */
    const jogos = await sql`SELECT id FROM jogos WHERE id = ${jogoId}`;
    if (jogos.length === 0) {
      res.status(404).json({ error: "Jogo não encontrado" });
      return;
    }

    /* toggle: se já tem essa reação remove, senão insere (substituindo outra se existir) */
    const atual = await sql`
      SELECT emoji FROM reacoes
      WHERE jogo_id = ${jogoId} AND participante_id = ${eu.id}
    `;

    if (atual.length > 0 && atual[0].emoji === emoji) {
      await sql`DELETE FROM reacoes WHERE jogo_id = ${jogoId} AND participante_id = ${eu.id}`;
    } else {
      await sql`
        INSERT INTO reacoes (jogo_id, participante_id, emoji)
        VALUES (${jogoId}, ${eu.id}, ${emoji})
        ON CONFLICT (jogo_id, participante_id) DO UPDATE SET emoji = EXCLUDED.emoji
      `;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
