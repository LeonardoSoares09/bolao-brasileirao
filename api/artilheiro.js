/* /api/artilheiro — palpite do artilheiro do turno
   GET  ?t=TOKEN          → palpite próprio + todos os confirmados
   POST { t, jogador }    → salva/atualiza (só se não confirmado e prazo aberto)
   PUT  { t }             → confirma e trava para sempre (só se prazo aberto)
   Prazo: trava no kickoff do 1º jogo da rodada RODADA_LIMITE_ARTILHEIRO —
   depois disso nem escolher nem confirmar é mais aceito, mesmo que o
   participante nunca tenha escolhido nada. */

import { sql, autenticar } from "../lib/db.js";
import { RODADA_LIMITE_ARTILHEIRO } from "../lib/clubes.js";

async function prazoEncerrado() {
  const rows = await sql`SELECT MIN(kickoff) AS inicio FROM jogos WHERE rodada = ${RODADA_LIMITE_ARTILHEIRO}`;
  const inicio = rows[0]?.inicio;
  return !!inicio && new Date(inicio).getTime() <= Date.now();
}

export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query.t : req.body?.t;
  const eu = await autenticar(token);
  if (!eu) {
    res.status(401).json({ error: "Link inválido" });
    return;
  }

  if (req.method === "GET") {
    const confirmados = await sql`
      SELECT pa.participante_id, p.nome, pa.jogador
      FROM palpite_artilheiro pa
      JOIN participantes p ON p.id = pa.participante_id
      WHERE pa.confirmado = TRUE
      ORDER BY p.nome
    `;

    let meu = null;
    if (eu.id !== null) {
      const rows = await sql`
        SELECT jogador, confirmado
        FROM palpite_artilheiro
        WHERE participante_id = ${eu.id}
      `;
      if (rows.length > 0) meu = { jogador: rows[0].jogador, confirmado: rows[0].confirmado };
    }

    res.status(200).json({ meu, confirmados });
    return;
  }

  if (req.method === "POST") {
    if (eu.id === null) {
      res.status(400).json({ error: "Token mestre não participa do bolão" });
      return;
    }
    if (await prazoEncerrado()) {
      res.status(403).json({ error: `Prazo encerrado — o palpite de artilheiro travou no início da rodada ${RODADA_LIMITE_ARTILHEIRO}.` });
      return;
    }

    const jogador = String(req.body?.jogador || "").trim();
    if (!jogador || jogador.length > 100) {
      res.status(400).json({ error: "Nome de jogador inválido" });
      return;
    }

    const existing = await sql`
      SELECT confirmado FROM palpite_artilheiro WHERE participante_id = ${eu.id}
    `;
    if (existing.length > 0 && existing[0].confirmado) {
      res.status(403).json({ error: "Palpite já confirmado — não é possível alterar" });
      return;
    }

    await sql`
      INSERT INTO palpite_artilheiro (participante_id, jogador)
      VALUES (${eu.id}, ${jogador})
      ON CONFLICT (participante_id)
      DO UPDATE SET jogador = ${jogador}, atualizado_em = now()
    `;

    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === "PUT") {
    if (eu.id === null) {
      res.status(400).json({ error: "Token mestre não participa do bolão" });
      return;
    }
    if (await prazoEncerrado()) {
      res.status(403).json({ error: `Prazo encerrado — o palpite de artilheiro travou no início da rodada ${RODADA_LIMITE_ARTILHEIRO}.` });
      return;
    }

    const rows = await sql`
      SELECT jogador, confirmado FROM palpite_artilheiro WHERE participante_id = ${eu.id}
    `;

    if (rows.length === 0) {
      res.status(400).json({ error: "Escolha um jogador antes de confirmar" });
      return;
    }
    if (rows[0].confirmado) {
      res.status(403).json({ error: "Palpite já confirmado anteriormente" });
      return;
    }

    await sql`
      UPDATE palpite_artilheiro
      SET confirmado = TRUE, atualizado_em = now()
      WHERE participante_id = ${eu.id}
    `;

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método não suportado" });
}
