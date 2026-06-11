/* /api/jogo — gestão de jogos (somente admin)
   POST   { t, casa, fora, kickoff }   → cria jogo
   PUT    { t, jogoId, gh, ga }        → lança/limpa resultado
   DELETE { t, jogoId }                → remove jogo (e palpites em cascata) */

import { sql, autenticar, intOuNull } from "../lib/db.js";

export default async function handler(req, res) {
  const eu = await autenticar(req.body?.t);
  if (!eu) {
    res.status(401).json({ error: "Link inválido" });
    return;
  }
  if (!eu.isAdmin) {
    res.status(403).json({ error: "Só o organizador gerencia os jogos" });
    return;
  }

  if (req.method === "POST") {
    const casa = String(req.body?.casa || "").trim();
    const fora = String(req.body?.fora || "").trim();
    const kickoff = req.body?.kickoff ? new Date(req.body.kickoff) : null;
    if (!casa || !fora || casa.length > 60 || fora.length > 60) {
      res.status(400).json({ error: "Times inválidos" });
      return;
    }
    if (kickoff && Number.isNaN(kickoff.getTime())) {
      res.status(400).json({ error: "Data/hora inválida" });
      return;
    }
    const rows = await sql`
      INSERT INTO jogos (casa, fora, kickoff)
      VALUES (${casa}, ${fora}, ${kickoff})
      RETURNING id
    `;
    res.status(200).json({ ok: true, id: rows[0].id });
    return;
  }

  if (req.method === "PUT") {
    const jid = intOuNull(req.body?.jogoId);
    if (jid === null) {
      res.status(400).json({ error: "jogoId obrigatório" });
      return;
    }
    const gh = intOuNull(req.body?.gh);
    const ga = intOuNull(req.body?.ga);
    await sql`UPDATE jogos SET gh = ${gh}, ga = ${ga} WHERE id = ${jid}`;
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const jid = intOuNull(req.body?.jogoId);
    if (jid === null) {
      res.status(400).json({ error: "jogoId obrigatório" });
      return;
    }
    await sql`DELETE FROM jogos WHERE id = ${jid}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
