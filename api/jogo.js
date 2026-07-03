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
    const fase = req.body?.fase === "eliminatórias" ? "eliminatórias" : "grupos";
    /* peso de pontuação: aceita 1/2/4 explícito; senão deriva da fase
       (grupos 1×, mata-mata 2×). A final (4×) precisa vir explícita. */
    const pesoReq = intOuNull(req.body?.peso);
    const peso = [1, 2, 4].includes(pesoReq) ? pesoReq : (fase === "eliminatórias" ? 2 : 1);
    if (!casa || !fora || casa.length > 60 || fora.length > 60) {
      res.status(400).json({ error: "Times inválidos" });
      return;
    }
    if (kickoff && Number.isNaN(kickoff.getTime())) {
      res.status(400).json({ error: "Data/hora inválida" });
      return;
    }
    const rows = await sql`
      INSERT INTO jogos (casa, fora, kickoff, fase, peso)
      VALUES (${casa}, ${fora}, ${kickoff}, ${fase}, ${peso})
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
    /* encerrar=false → correção AO VIVO: mantém live=true. O cron (futebol.js) só
       volta a mexer no placar quando a football-data MUDAR o que reporta — a
       correção manual não toca api_gh/api_ga, então sobrevive ao atraso da API
       (é o que faz um gol anulado por VAR parar de voltar sozinho).
       encerrar=true (ou ausente) → finaliza o jogo (live=false). Default seguro
       é finalizar, pra clientes antigos / chamadas sem o campo. */
    const live = req.body?.encerrar === false;
    await sql`UPDATE jogos SET gh = ${gh}, ga = ${ga}, live = ${live} WHERE id = ${jid}`;
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
