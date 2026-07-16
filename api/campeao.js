/* /api/campeao — palpite do time campeão
   GET  ?t=TOKEN          → palpite próprio + todos os confirmados
   POST { t, selecao }    → salva/atualiza (só se não confirmado)
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
      SELECT pc.participante_id, p.nome, pc.selecao
      FROM palpite_campeao pc
      JOIN participantes p ON p.id = pc.participante_id
      WHERE pc.confirmado = TRUE
      ORDER BY p.nome
    `;

    let meu = null;
    if (eu.id !== null) {
      const rows = await sql`
        SELECT selecao, confirmado
        FROM palpite_campeao
        WHERE participante_id = ${eu.id}
      `;
      if (rows.length > 0) meu = { selecao: rows[0].selecao, confirmado: rows[0].confirmado };
    }

    res.status(200).json({ meu, confirmados });
    return;
  }

  if (req.method === "POST") {
    if (eu.id === null) {
      res.status(400).json({ error: "Token mestre não participa do bolão" });
      return;
    }

    const selecao = String(req.body?.selecao || "").trim();
    if (!selecao || selecao.length > 100) {
      res.status(400).json({ error: "Time inválido" });
      return;
    }

    const existing = await sql`
      SELECT confirmado FROM palpite_campeao WHERE participante_id = ${eu.id}
    `;
    if (existing.length > 0 && existing[0].confirmado) {
      res.status(403).json({ error: "Palpite já confirmado — não é possível alterar" });
      return;
    }

    await sql`
      INSERT INTO palpite_campeao (participante_id, selecao)
      VALUES (${eu.id}, ${selecao})
      ON CONFLICT (participante_id)
      DO UPDATE SET selecao = ${selecao}, atualizado_em = now()
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
      SELECT selecao, confirmado FROM palpite_campeao WHERE participante_id = ${eu.id}
    `;

    if (rows.length === 0) {
      res.status(400).json({ error: "Escolha um time antes de confirmar" });
      return;
    }
    if (rows[0].confirmado) {
      res.status(403).json({ error: "Palpite já confirmado anteriormente" });
      return;
    }

    await sql`
      UPDATE palpite_campeao
      SET confirmado = TRUE, atualizado_em = now()
      WHERE participante_id = ${eu.id}
    `;

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
