/* POST /api/palpite  { t, jogoId, h, a, participanteId? }
   Grava (upsert) o palpite do próprio usuário.
   A REGRA DE OURO é validada aqui, no servidor: depois do kickoff
   ou com resultado lançado, palpite não entra — não importa o que
   o frontend diga. Admin pode editar palpites de qualquer um
   (participanteId), pra corrigir erro de digitação. */

import { sql, autenticar, intOuNull } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const { t, jogoId, participanteId } = req.body || {};
  const eu = await autenticar(t);
  if (!eu) {
    res.status(401).json({ error: "Link inválido" });
    return;
  }

  const h = intOuNull(req.body?.h);
  const a = intOuNull(req.body?.a);
  const jid = intOuNull(jogoId);
  if (h === null || a === null || jid === null || h > 99 || a > 99) {
    res.status(400).json({ error: "Palpite inválido" });
    return;
  }

  /* admin pode palpitar por outro participante; usuário comum, só por si */
  let alvo = eu.id;
  if (eu.isAdmin && intOuNull(participanteId) !== null) alvo = intOuNull(participanteId);
  if (alvo === null) {
    res.status(400).json({ error: "O token mestre não participa do bolão — informe participanteId" });
    return;
  }

  const jogos = await sql`SELECT id, kickoff, gh, ga FROM jogos WHERE id = ${jid}`;
  if (jogos.length === 0) {
    res.status(404).json({ error: "Jogo não encontrado" });
    return;
  }
  const jogo = jogos[0];

  const comecou = jogo.kickoff && new Date(jogo.kickoff) <= new Date();
  const encerrado = jogo.gh !== null && jogo.ga !== null;
  if ((comecou || encerrado) && !eu.isAdmin) {
    res.status(403).json({ error: "Jogo já começou — palpites travados ⏱" });
    return;
  }

  await sql`
    INSERT INTO palpites (jogo_id, participante_id, h, a)
    VALUES (${jid}, ${alvo}, ${h}, ${a})
    ON CONFLICT (jogo_id, participante_id)
    DO UPDATE SET h = ${h}, a = ${a}, atualizado_em = now()
  `;

  res.status(200).json({ ok: true });
}
