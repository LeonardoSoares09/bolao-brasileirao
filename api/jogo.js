/* /api/jogo — gestão de jogos (somente admin)
   POST   { t, casa, fora, kickoff, rodada, peso?, adiado? } → cria jogo
   PUT    { t, jogoId, gh, ga }        → lança/limpa resultado
   PATCH  { t, jogoId, adiado }        → marca/desmarca jogo como adiado
   DELETE { t, jogoId }                → remove jogo (e palpites em cascata) */

import { sql, autenticar, intOuNull } from "../lib/db.js";
import { okEscrita } from "../lib/snapshot.js";
import { pesoDoJogo, ADIADO } from "../lib/clubes.js";

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
    /* adiado nasce SEM data de propósito: a graça do status é justamente não
       ter data ainda. Se a data já é conhecida, o jogo não está adiado. */
    const adiado = req.body?.adiado === true;
    const kickoff = adiado ? null : (req.body?.kickoff ? new Date(req.body.kickoff) : null);
    const rodada = intOuNull(req.body?.rodada);
    /* peso de pontuação: aceita 1..3 explícito; senão deriva de rodada +
       clássico (ver lib/clubes.js:pesoDoJogo). */
    const pesoReq = intOuNull(req.body?.peso);
    const peso = [1, 2, 3].includes(pesoReq) ? pesoReq : pesoDoJogo(rodada, casa, fora);
    if (!casa || !fora || casa.length > 60 || fora.length > 60) {
      res.status(400).json({ error: "Times inválidos" });
      return;
    }
    if (kickoff && Number.isNaN(kickoff.getTime())) {
      res.status(400).json({ error: "Data/hora inválida" });
      return;
    }
    const rows = await sql`
      INSERT INTO jogos (casa, fora, kickoff, rodada, peso, status)
      VALUES (${casa}, ${fora}, ${kickoff}, ${rodada}, ${peso}, ${adiado ? ADIADO : null})
      RETURNING id
    `;
    await okEscrita(res, { ok: true, id: rows[0].id });
    return;
  }

  /* Marca/desmarca jogo já existente como adiado. Existe pra não obrigar o
     organizador a apagar e recadastrar — apagar cascateia em palpites
     (schema.sql), e o motivo de todo este recurso é justamente parar de
     perder palpite por causa de remarcação da CBF.
     Marcar zera a data: adiado é "sem data conhecida". Desmarcar só limpa o
     status; a data volta pela tela normal de edição ou pelo import. */
  if (req.method === "PATCH") {
    const jid = intOuNull(req.body?.jogoId);
    if (jid === null) {
      res.status(400).json({ error: "jogoId obrigatório" });
      return;
    }
    const adiado = req.body?.adiado === true;
    if (adiado) {
      await sql`UPDATE jogos SET status = ${ADIADO}, kickoff = NULL, live = false WHERE id = ${jid}`;
    } else {
      await sql`UPDATE jogos SET status = NULL WHERE id = ${jid}`;
    }
    await okEscrita(res);
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
    await okEscrita(res);

    return;
  }

  if (req.method === "DELETE") {
    const jid = intOuNull(req.body?.jogoId);
    if (jid === null) {
      res.status(400).json({ error: "jogoId obrigatório" });
      return;
    }
    await sql`DELETE FROM jogos WHERE id = ${jid}`;
    await okEscrita(res);
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
