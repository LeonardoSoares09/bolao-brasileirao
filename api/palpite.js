/* POST /api/palpite  { t, jogoId, h, a, participanteId? }
   Grava (upsert) o palpite do próprio usuário.
   A REGRA DE OURO é validada aqui, no servidor: depois do kickoff
   ou com resultado lançado, palpite não entra — não importa o que
   o frontend diga. Admin pode editar palpites de qualquer um
   (participanteId), pra corrigir erro de digitação. */

import { sql, autenticar, intOuNull } from "../lib/db.js";
import { okEscrita } from "../lib/snapshot.js";
import { jogoAdiado, jogoCancelado } from "../lib/clubes.js";

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

  const jogos = await sql`SELECT id, kickoff, gh, ga, status FROM jogos WHERE id = ${jid}`;
  if (jogos.length === 0) {
    res.status(404).json({ error: "Jogo não encontrado" });
    return;
  }
  const jogo = jogos[0];

  /* Os três casos abaixo, juntos, são exatamente jogoAceitaPalpite() de
     lib/clubes.js — a mesma regra que filtra a tela de Palpites. Estão
     abertos aqui só pra devolver a mensagem certa em cada caso; se mexer em
     um lado, mexa no outro.

     Jogo adiado não aceita palpite — nem do admin. Não é frescura de tela: a
     antecedência média (5º critério de desempate) é kickoff menos
     atualizado_em, então palpite gravado enquanto o jogo está sem data
     renderia uma antecedência enorme no dia em que a CBF remarcasse. Quem
     palpitasse em tudo que está adiado ganharia o desempate de graça.
     Quando a data nova chegar, o jogo reabre pra todos ao mesmo tempo. */
  if (jogoCancelado(jogo)) {
    res.status(403).json({ error: "Jogo cancelado — não vale mais pro bolão" });
    return;
  }
  if (jogoAdiado(jogo)) {
    res.status(403).json({ error: "Jogo adiado ⏳ — palpite reabre quando a nova data sair" });
    return;
  }
  /* Rede de segurança para jogo SEM DATA que não foi marcado como adiado
     (cadastro manual do organizador, por exemplo): sem kickoff não existe
     prazo pra fazer valer, e o palpite guardado hoje renderia antecedência
     enorme no dia em que a data fosse preenchida — a mesma distorção do caso
     adiado. Sem data, palpite fechado; assim vale pra todo mundo igual. */
  if (!jogo.kickoff) {
    res.status(403).json({ error: "Jogo sem data definida — palpite abre quando a data for marcada" });
    return;
  }

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

  await okEscrita(res);
}
