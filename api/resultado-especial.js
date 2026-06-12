/* /api/resultado-especial — admin define o campeão real e o artilheiro real
   GET  ?t=TOKEN              → { campeao: {valor, confirmado}|null, artilheiro: ... }
   POST { t, tipo, valor }    → salva/atualiza (só se não confirmado)
   PUT  { t, tipo }           → confirma e trava para sempre */

import { sql, autenticar } from "../lib/db.js";

export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query.t : req.body?.t;
  const eu = await autenticar(token);
  if (!eu) { res.status(401).json({ error: "Link inválido" }); return; }
  if (!eu.isAdmin) { res.status(403).json({ error: "Só o organizador" }); return; }

  if (req.method === "GET") {
    const rows = await sql`SELECT tipo, valor, confirmado FROM resultado_especial`;
    const map = {};
    for (const r of rows) map[r.tipo] = { valor: r.valor, confirmado: r.confirmado };
    res.status(200).json({ campeao: map.campeao || null, artilheiro: map.artilheiro || null });
    return;
  }

  if (req.method === "POST") {
    const tipo = req.body?.tipo === "artilheiro" ? "artilheiro" : "campeao";
    const valor = String(req.body?.valor || "").trim();
    if (!valor || valor.length > 100) {
      res.status(400).json({ error: "Valor inválido" });
      return;
    }
    const existing = await sql`SELECT confirmado FROM resultado_especial WHERE tipo = ${tipo}`;
    if (existing.length > 0 && existing[0].confirmado) {
      res.status(403).json({ error: "Resultado já confirmado — não pode alterar" });
      return;
    }
    await sql`
      INSERT INTO resultado_especial (tipo, valor)
      VALUES (${tipo}, ${valor})
      ON CONFLICT (tipo) DO UPDATE SET valor = ${valor}
    `;
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "PUT") {
    const tipo = req.body?.tipo === "artilheiro" ? "artilheiro" : "campeao";
    const rows = await sql`SELECT valor, confirmado FROM resultado_especial WHERE tipo = ${tipo}`;
    if (rows.length === 0) {
      res.status(400).json({ error: "Defina o resultado antes de confirmar" });
      return;
    }
    if (rows[0].confirmado) {
      res.status(403).json({ error: "Já confirmado anteriormente" });
      return;
    }
    await sql`
      UPDATE resultado_especial
      SET confirmado = TRUE, confirmado_em = now()
      WHERE tipo = ${tipo}
    `;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
