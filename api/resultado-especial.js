/* /api/resultado-especial — admin define o campeão real e o artilheiro real
   GET  ?t=TOKEN              → { campeao: {valor, confirmado}|null, artilheiro: ... }
   POST { t, tipo, valor }    → salva/atualiza (só se não confirmado)
   PUT  { t, tipo }           → confirma e trava para sempre */

import { sql, autenticar, intOuNull } from "../lib/db.js";

/* dados "ao vivo" administrados na mão, guardados na tabela config (JSON):
   'artilheiro_gols' (ranking do artilheiro) e 'selecoes_eliminadas' (visual na
   aba Campeão). Ficam AQUI (e não num endpoint novo) porque o plano Hobby limita
   a 12 Serverless Functions — uma a mais estoura e vira 404. */
async function salvarConfig(chave, valorObj) {
  const json = JSON.stringify(valorObj);
  await sql`
    INSERT INTO config (chave, valor, atualizado_em)
    VALUES (${chave}, ${json}, now())
    ON CONFLICT (chave) DO UPDATE SET valor = ${json}, atualizado_em = now()
  `;
}

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
    const tipoRaw = String(req.body?.tipo || "");

    if (tipoRaw === "artilheiro-gols") {
      const gols = req.body?.gols;
      if (gols == null || typeof gols !== "object" || Array.isArray(gols)) {
        res.status(400).json({ error: "gols inválido" });
        return;
      }
      const limpo = {};
      for (const [k, v] of Object.entries(gols)) {
        const n = Math.floor(Number(v));
        if (typeof k === "string" && k && Number.isFinite(n) && n >= 0 && n <= 99) {
          limpo[k.slice(0, 100)] = n;
        }
      }
      await salvarConfig("artilheiro_gols", limpo);
      res.status(200).json({ ok: true });
      return;
    }

    if (tipoRaw === "selecoes-eliminadas") {
      const codigos = req.body?.codigos;
      if (!Array.isArray(codigos)) {
        res.status(400).json({ error: "codigos inválido" });
        return;
      }
      const limpo = [...new Set(
        codigos.filter((c) => typeof c === "string" && c).map((c) => c.slice(0, 10))
      )];
      await salvarConfig("selecoes_eliminadas", limpo);
      res.status(200).json({ ok: true });
      return;
    }

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
    if (rows.length > 0 && rows[0].confirmado) {
      res.status(403).json({ error: "Já confirmado anteriormente" });
      return;
    }
    if (tipo === "campeao" && rows.length === 0) {
      res.status(400).json({ error: "Defina o resultado antes de confirmar" });
      return;
    }
    if (rows.length === 0) {
      await sql`INSERT INTO resultado_especial (tipo, valor, confirmado, confirmado_em) VALUES (${tipo}, '', TRUE, now())`;
    } else {
      await sql`UPDATE resultado_especial SET confirmado = TRUE, confirmado_em = now() WHERE tipo = ${tipo}`;
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "PATCH") {
    const id = intOuNull(req.body?.participanteId);
    if (id === null) { res.status(400).json({ error: "participanteId obrigatório" }); return; }
    const lock = await sql`SELECT confirmado FROM resultado_especial WHERE tipo = 'artilheiro'`;
    if (lock.length > 0 && lock[0].confirmado) {
      res.status(403).json({ error: "Artilheiro já confirmado — não pode alterar" });
      return;
    }
    const existing = await sql`SELECT 1 FROM artilheiro_premiado WHERE participante_id = ${id}`;
    if (existing.length > 0) {
      await sql`DELETE FROM artilheiro_premiado WHERE participante_id = ${id}`;
    } else {
      await sql`INSERT INTO artilheiro_premiado (participante_id) VALUES (${id})`;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
