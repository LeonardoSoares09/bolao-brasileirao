/* /api/participante — gestão da galera (somente admin)
   GET    ?t=TOKEN                  → lista com tokens (pra copiar os links)
   POST   { t, nome, admin? }       → cria participante, gera token aleatório
   DELETE { t, id }                 → remove participante (e palpites em cascata) */

import { randomBytes } from "node:crypto";
import { sql, autenticar, intOuNull } from "../lib/db.js";

export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query.t : req.body?.t;
  const eu = await autenticar(token);
  if (!eu) {
    res.status(401).json({ error: "Link inválido" });
    return;
  }

  /* PATCH — qualquer participante pode atualizar seu próprio avatar */
  if (req.method === "PATCH") {
    if (eu.id === null) {
      res.status(400).json({ error: "Token mestre não tem perfil" });
      return;
    }
    const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.slice(0, 8).trim() : null;
    const cor = typeof req.body?.cor === "string" && /^#[0-9a-f]{6}$/i.test(req.body.cor)
      ? req.body.cor : null;
    await sql`
      UPDATE participantes SET avatar_emoji = ${emoji}, avatar_cor = ${cor}
      WHERE id = ${eu.id}
    `;
    res.status(200).json({ ok: true });
    return;
  }

  if (!eu.isAdmin) {
    res.status(403).json({ error: "Só o organizador gerencia participantes" });
    return;
  }

  if (req.method === "GET") {
    const rows = await sql`
      SELECT id, nome, token, is_admin, avatar_emoji, avatar_cor
      FROM participantes ORDER BY nome
    `;
    res.status(200).json({
      participantes: rows.map((p) => ({
        id: p.id, nome: p.nome, token: p.token,
        isAdmin: p.is_admin, avatarEmoji: p.avatar_emoji, avatarCor: p.avatar_cor,
      })),
    });
    return;
  }

  if (req.method === "POST") {
    const nome = String(req.body?.nome || "").trim();
    if (!nome || nome.length > 40) {
      res.status(400).json({ error: "Nome inválido" });
      return;
    }
    const novoToken = randomBytes(12).toString("hex");
    const ehAdmin = req.body?.admin === true;
    const rows = await sql`
      INSERT INTO participantes (nome, token, is_admin)
      VALUES (${nome}, ${novoToken}, ${ehAdmin})
      RETURNING id, nome, token, is_admin
    `;
    res.status(200).json({ ok: true, participante: rows[0] });
    return;
  }

  if (req.method === "DELETE") {
    const id = intOuNull(req.body?.id);
    if (id === null) {
      res.status(400).json({ error: "id obrigatório" });
      return;
    }
    await sql`DELETE FROM participantes WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
