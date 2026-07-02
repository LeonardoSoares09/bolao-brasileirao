/* /api/live-admin — dados "ao vivo" que o admin administra na mão, guardados na
   tabela config (chave/valor JSON). Somente admin. POST com discriminador `tipo`:
     tipo="artilheiro-gols"   { gols: { [nomeNormalizado]: gols } }
     tipo="selecoes-eliminadas" { codigos: [ "ba", "us", ... ] }  // códigos de bandeira
   O cliente sempre manda o mapa/lista COMPLETO (idempotente) — sem toggle parcial. */

import { sql, autenticar } from "../lib/db.js";

async function salvarConfig(chave, valorObj) {
  const json = JSON.stringify(valorObj);
  await sql`
    INSERT INTO config (chave, valor, atualizado_em)
    VALUES (${chave}, ${json}, now())
    ON CONFLICT (chave) DO UPDATE SET valor = ${json}, atualizado_em = now()
  `;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  const eu = await autenticar(req.body?.t);
  if (!eu) { res.status(401).json({ error: "Link inválido" }); return; }
  if (!eu.isAdmin) { res.status(403).json({ error: "Só o organizador" }); return; }

  const tipo = String(req.body?.tipo || "");

  if (tipo === "artilheiro-gols") {
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

  if (tipo === "selecoes-eliminadas") {
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

  res.status(400).json({ error: "tipo inválido" });
}
