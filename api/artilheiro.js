/* /api/artilheiro — palpite do artilheiro da Copa
   GET  ?t=TOKEN          → palpite próprio + todos os confirmados
   POST { t, jogador }    → salva/atualiza (só se não confirmado)
   PUT  { t }             → confirma e trava para sempre */

import { sql, autenticar } from "../lib/db.js";

export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query.t : req.body?.t;
  const eu = await autenticar(token);
  if (!eu) {
    res.status(401).json({ error: "Link inválido" });
    return;
  }

  if (req.method === "GET") {
    const confirmados = await sql`
      SELECT pa.participante_id, p.nome, pa.jogador
      FROM palpite_artilheiro pa
      JOIN participantes p ON p.id = pa.participante_id
      WHERE pa.confirmado = TRUE
      ORDER BY p.nome
    `;

    let meu = null;
    if (eu.id !== null) {
      const rows = await sql`
        SELECT jogador, confirmado
        FROM palpite_artilheiro
        WHERE participante_id = ${eu.id}
      `;
      if (rows.length > 0) meu = { jogador: rows[0].jogador, confirmado: rows[0].confirmado };
    }

    res.status(200).json({ meu, confirmados });
    return;
  }

  if (req.method === "POST") {
    if (eu.id === null) {
      res.status(400).json({ error: "Token mestre não participa do bolão" });
      return;
    }

    const jogador = String(req.body?.jogador || "").trim();
    if (!jogador || jogador.length > 100) {
      res.status(400).json({ error: "Nome de jogador inválido" });
      return;
    }

    const existing = await sql`
      SELECT confirmado FROM palpite_artilheiro WHERE participante_id = ${eu.id}
    `;
    if (existing.length > 0 && existing[0].confirmado) {
      res.status(403).json({ error: "Palpite já confirmado — não é possível alterar" });
      return;
    }

    await sql`
      INSERT INTO palpite_artilheiro (participante_id, jogador)
      VALUES (${eu.id}, ${jogador})
      ON CONFLICT (participante_id)
      DO UPDATE SET jogador = ${jogador}, atualizado_em = now()
    `;

    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "PUT") {
    if (eu.id === null) {
      res.status(400).json({ error: "Token mestre não participa do bolão" });
      return;
    }

    const rows = await sql`
      SELECT jogador, confirmado FROM palpite_artilheiro WHERE participante_id = ${eu.id}
    `;

    if (rows.length === 0) {
      res.status(400).json({ error: "Escolha um jogador antes de confirmar" });
      return;
    }
    if (rows[0].confirmado) {
      res.status(403).json({ error: "Palpite já confirmado anteriormente" });
      return;
    }

    await sql`
      UPDATE palpite_artilheiro
      SET confirmado = TRUE, atualizado_em = now()
      WHERE participante_id = ${eu.id}
    `;

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
