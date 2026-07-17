/* /api/futebol — integração com football-data.org (competição BSA, Série A).
   GET ?t=TOKEN&acao=jogos-hoje  → busca partidas do dia (fuso SP) e insere/adota
   GET ?t=TOKEN&acao=resultados  → grava placar final dos jogos FINISHED
   Somente admin. Auth via header X-Auth-Token (env FOOTBALL_DATA_KEY). */

import { sql, autenticar } from "../lib/db.js";
import { traduzirClube, pesoDoJogo } from "../lib/clubes.js";

/* normaliza pra comparação: sem acento, sem caixa, sem borda */
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const FOOTBALL_API = "https://api.football-data.org/v4/competitions/BSA/matches";
const FOOTBALL_API_COMPETICAO = "https://api.football-data.org/v4/competitions/BSA";

/* data "hoje" em America/Sao_Paulo, formato YYYY-MM-DD */
function hojeEmSP() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/* data SP (YYYY-MM-DD) de um ISO/Date qualquer */
function dataSP(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/* yyyy-mm-dd ± dias */
function addDias(yyyymmdd, dias) {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/* Placar que o bolão pontua: sempre os 90 minutos (fullTime). Jogo de pontos
   corridos não tem prorrogação nem pênaltis — fullTime já é o placar final
   em qualquer status. */
function placarBolao(score) {
  const ft = score?.fullTime || {};
  return { home: ft.home ?? null, away: ft.away ?? null };
}

async function buscarPartidas(query) {
  const r = await fetch(`${FOOTBALL_API}?${query}`, {
    headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_KEY },
  });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    console.error("football-data", r.status, detalhe);
    const err = new Error("football-data " + r.status);
    err.externo = true;
    throw err;
  }
  const data = await r.json();
  return Array.isArray(data.matches) ? data.matches : [];
}

/* rodada (matchday) que a football-data considera "atual" na temporada —
   fonte da verdade de qual rodada buscar, em vez de inferir por data. */
async function matchdayAtual() {
  const r = await fetch(FOOTBALL_API_COMPETICAO, {
    headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_KEY },
  });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    console.error("football-data", r.status, detalhe);
    const err = new Error("football-data " + r.status);
    err.externo = true;
    throw err;
  }
  const data = await r.json();
  return data?.currentSeason?.currentMatchday ?? null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Use GET" });
    return;
  }

  const eu = await autenticar(req.query.t);
  if (!eu) {
    res.status(401).json({ error: "Link inválido" });
    return;
  }
  if (!process.env.FOOTBALL_DATA_KEY) {
    res.status(500).json({ error: "FOOTBALL_DATA_KEY não configurada na Vercel" });
    return;
  }

  const acao = String(req.query.acao || "");
  try {
    /* placar-vivo: qualquer participante autenticado pode chamar */
    if (acao === "placar-vivo") {
      res.status(200).json(await acaoPlacares());
      return;
    }

    /* demais ações: somente admin */
    if (!eu.isAdmin) {
      res.status(403).json({ error: "Só o organizador usa a busca automática" });
      return;
    }

    if (acao === "jogos-hoje") {
      res.status(200).json(await acaoJogosHoje());
      return;
    }
    if (acao === "resultados") {
      res.status(200).json(await acaoPlacares());
      return;
    }
    res.status(400).json({ error: "acao inválida — use 'jogos-hoje', 'resultados' ou 'placar-vivo'" });
  } catch (e) {
    console.error(e);
    if (e.externo) {
      res.status(502).json({ error: "Não consegui falar com a football-data agora — tenta de novo em instantes." });
      return;
    }
    res.status(500).json({ error: "Erro interno — tenta de novo ou lança manualmente." });
  }
}

async function importarRodada(matchday, { comPlacar }) {
  const relevantes = await buscarPartidas(`matchday=${matchday}`);

  /* puxa todos os jogos uma vez só pra evitar N SELECTs no loop */
  const todos = await sql`
    SELECT id, casa, fora, kickoff, external_id FROM jogos
  `;
  const porExt = new Map();
  const legados = [];
  for (const j of todos) {
    if (j.external_id) porExt.set(j.external_id, j);
    else legados.push(j);
  }

  let adicionados = 0;
  let atualizados = 0;

  for (const m of relevantes) {
    const externalId = String(m.id);
    const casa = traduzirClube(m.homeTeam?.name);
    const fora = traduzirClube(m.awayTeam?.name);
    const kickoff = m.utcDate;
    const rodada = m.matchday ?? null;
    const peso = pesoDoJogo(rodada, casa, fora);
    if (!casa || !fora) continue;

    /* comPlacar: jogo de histórico já é FINISHED — grava o placar final direto
       (acaoPlacares não alcançaria essas rodadas, sua janela é só 14 dias). */
    const placar = comPlacar && m.status === "FINISHED" ? placarBolao(m.score) : null;
    const gh = placar ? placar.home : null;
    const ga = placar ? placar.away : null;

    /* (a) já carimbado — atualiza kickoff, rodada, peso e placar (se veio) */
    const achado = porExt.get(externalId);
    if (achado) {
      const rows = await sql`
        UPDATE jogos
           SET kickoff = ${kickoff}, rodada = ${rodada}, peso = ${peso},
               gh = COALESCE(${gh}, gh), ga = COALESCE(${ga}, ga)
         WHERE id = ${achado.id}
           AND (kickoff IS DISTINCT FROM ${kickoff} OR rodada IS DISTINCT FROM ${rodada} OR peso IS DISTINCT FROM ${peso}
                OR gh IS DISTINCT FROM COALESCE(${gh}, gh) OR ga IS DISTINCT FROM COALESCE(${ga}, ga))
        RETURNING id
      `;
      if (rows.length > 0) atualizados++;
      continue;
    }

    /* (b) adoção de legado — cadastro manual prévio do mesmo confronto */
    const idx = legados.findIndex(
      (j) =>
        norm(j.casa) === norm(casa) &&
        norm(j.fora) === norm(fora) &&
        (j.kickoff == null || dataSP(j.kickoff) === dataSP(kickoff))
    );
    if (idx >= 0) {
      const cand = legados[idx];
      await sql`
        UPDATE jogos
           SET external_id = ${externalId},
               kickoff = COALESCE(kickoff, ${kickoff}),
               rodada = ${rodada},
               peso = ${peso},
               gh = COALESCE(gh, ${gh}),
               ga = COALESCE(ga, ${ga})
         WHERE id = ${cand.id}
      `;
      legados.splice(idx, 1);
      atualizados++;
      continue;
    }

    /* (c) novo */
    await sql`
      INSERT INTO jogos (casa, fora, kickoff, external_id, rodada, peso, gh, ga)
      VALUES (${casa}, ${fora}, ${kickoff}, ${externalId}, ${rodada}, ${peso}, ${gh}, ${ga})
    `;
    adicionados++;
  }

  return { adicionados, atualizados, total: relevantes.length };
}

export async function acaoJogosHoje() {
  /* rodada atual da temporada (ex.: 19) — busca TODOS os jogos dela de uma
     vez, não só os "de hoje". Isso deixa a rodada inteira disponível pra
     palpitar com antecedência, em vez de ir liberando jogo por jogo
     conforme cada dia chega. */
  const rodadaAtual = await matchdayAtual();
  if (rodadaAtual == null) return { adicionados: 0, atualizados: 0, total: 0 };
  return importarRodada(rodadaAtual, { comPlacar: false });
}

/* acaoPlacares: atualiza FINISHED (placar final) e IN_PLAY/PAUSED/LIVE (placar ao vivo)
   OBS: a football-data pode mandar o status como "LIVE" (não só "IN_PLAY") com a
   bola rolando — os dois têm que cair no mesmo ramo, senão o placar fica parado.
   Deduplicação: a football-data.org só é consultada uma vez por minuto,
   independente de quantos clientes chamem simultaneamente. */
async function acaoPlacares() {
  /* Lock atômico: só UMA chamada concorrente consegue avançar o timestamp.
     O check-then-act anterior (SELECT + INSERT) não era atômico — dois clientes
     liam o timestamp antigo ao mesmo tempo, ambos passavam e ambos chamavam a
     football-data, estourando o rate limit (10 req/min do free tier → 429 →
     placares ao vivo somem pra todos). Aqui a condição vive no WHERE do
     ON CONFLICT, avaliada sob lock da linha: o segundo a chegar re-avalia contra
     a linha já atualizada, não bate, e RETURNING vem vazio. O INSERT também cobre
     o cold-start (linha ainda não existe num banco recém-criado do schema.sql). */
  const ganhou = await sql`
    INSERT INTO config (chave, atualizado_em)
      VALUES ('ultima_busca_live', NOW())
      ON CONFLICT (chave) DO UPDATE SET atualizado_em = NOW()
        WHERE config.atualizado_em IS NULL
           OR config.atualizado_em < NOW() - INTERVAL '55 seconds'
    RETURNING chave
  `;
  if (ganhou.length === 0) {
    return { atualizados: 0, vivos: 0, cached: true };
  }

  const hoje = hojeEmSP();
  /* janela dos últimos 14 dias para não perder resultados atrasados */
  let partidas;
  try {
    partidas = await buscarPartidas(
      `dateFrom=${addDias(hoje, -14)}&dateTo=${addDias(hoje, +1)}`
    );
  } catch (e) {
    /* O lock já avançou ANTES do fetch (pra evitar chamadas concorrentes à
       football-data). Se o fetch falha (timeout, 429, instabilidade), sem isto
       todas as chamadas receberiam "cached" por 55s sem nada ter atualizado —
       falha silenciosa. Liberamos o lock (atualizado_em = NULL) pra a próxima
       chamada (~1 min) já tentar de novo, em vez de esperar a janela inteira. */
    await sql`UPDATE config SET atualizado_em = NULL WHERE chave = 'ultima_busca_live'`;
    throw e;
  }

  let atualizados = 0;
  let vivos = 0;

  for (const m of partidas) {
    const externalId = String(m.id);
    const status = m.status;

    if (status === "FINISHED") {
      const { home: gh, away: ga } = placarBolao(m.score);
      if (gh == null || ga == null) continue;
      const rows = await sql`
        UPDATE jogos
           SET gh = ${gh}, ga = ${ga}, live = false
         WHERE external_id = ${externalId}
           AND (gh IS DISTINCT FROM ${gh} OR ga IS DISTINCT FROM ${ga} OR live = true)
        RETURNING id
      `;
      if (rows.length > 0) {
        atualizados++;
      }
    } else if (status === "IN_PLAY" || status === "PAUSED" || status === "LIVE") {
      /* mesmo critério do final: pênaltis fora. Durante o jogo penalties é nulo
         (fica = fullTime); só no shootout o desconto entra, evitando que o ao
         vivo conte os pênaltis enquanto a partida ainda está "a confirmar". */
      const pb = placarBolao(m.score);
      const gh = pb.home ?? 0;
      const ga = pb.away ?? 0;
      /* Regra do ao vivo (reescrita 02/07/2026 — bug do gol anulado): o cron só
         mexe no placar quando a PRÓPRIA API muda o que reporta. api_gh/api_ga
         guardam o último placar que a API mandou. Uma correção manual do admin
         (jogo.js) NÃO toca api_*, então enquanto a API repetir o mesmo placar
         atrasado o cron não desfaz a correção — é isso que faz um GOL ANULADO por
         VAR (admin baixa 2-1 → 1-1) PARAR de voltar sozinho. Quando a API enfim
         muda (reflete o VAR, ou sai um gol novo) o cron aplica o novo placar dela;
         o FINISHED corrige o final de qualquer jeito. Isso substitui a antiga
         trava ">= nunca regride", que protegia correção pra cima mas regravava a
         correção pra baixo (a causa do bug).
         Travas mantidas:
         (1) jogo JÁ FINALIZADO (live=false com placar — pela rama FINISHED ou
             pelo botão Encerrar) não volta a ao vivo.
         (2) jogo com kickoff > 4h atrás (mesma janela do JANELA_VIVO no front):
             nenhuma partida real segue em jogo tão tarde — é status fantasma. */
      await sql`
        UPDATE jogos
           SET gh = ${gh}, ga = ${ga}, live = true, api_gh = ${gh}, api_ga = ${ga}
         WHERE external_id = ${externalId}
           AND NOT (live = false AND gh IS NOT NULL AND ga IS NOT NULL)
           AND kickoff > NOW() - INTERVAL '4 hours'
           AND (api_gh IS DISTINCT FROM ${gh} OR api_ga IS DISTINCT FROM ${ga})
      `;
      vivos++;
    }
  }

  return { atualizados, vivos };
}

/* mantém exportação para cron-resultados.js */
export async function acaoResultados() {
  return acaoPlacares();
}
