/* /api/futebol — integração com football-data.org (free tier cobre o WC).
   GET ?t=TOKEN&acao=jogos-hoje  → busca partidas do dia (fuso SP) e insere/adota
   GET ?t=TOKEN&acao=resultados  → grava placar final dos jogos FINISHED
   Somente admin. Auth via header X-Auth-Token (env FOOTBALL_DATA_KEY). */

import { sql, autenticar } from "../lib/db.js";

/* Mapa pt-BR das seleções que podem cair em Copa do Mundo.
   Não-mapeado cai no fallback: usa o próprio nome em inglês. */
const TRADUCAO = {
  // CONMEBOL
  "Brazil": "Brasil",
  "Argentina": "Argentina",
  "Uruguay": "Uruguai",
  "Colombia": "Colômbia",
  "Ecuador": "Equador",
  "Paraguay": "Paraguai",
  "Peru": "Peru",
  "Venezuela": "Venezuela",
  "Bolivia": "Bolívia",
  "Chile": "Chile",
  // CONCACAF
  "United States": "Estados Unidos",
  "USA": "Estados Unidos",
  "Mexico": "México",
  "Canada": "Canadá",
  "Costa Rica": "Costa Rica",
  "Panama": "Panamá",
  "Jamaica": "Jamaica",
  "Honduras": "Honduras",
  "El Salvador": "El Salvador",
  "Guatemala": "Guatemala",
  "Trinidad and Tobago": "Trinidad e Tobago",
  "Curaçao": "Curaçao",
  "Curacao": "Curaçao",
  "Haiti": "Haiti",
  // UEFA
  "Germany": "Alemanha",
  "France": "França",
  "Spain": "Espanha",
  "England": "Inglaterra",
  "Portugal": "Portugal",
  "Italy": "Itália",
  "Netherlands": "Holanda",
  "Belgium": "Bélgica",
  "Croatia": "Croácia",
  "Switzerland": "Suíça",
  "Denmark": "Dinamarca",
  "Poland": "Polônia",
  "Austria": "Áustria",
  "Sweden": "Suécia",
  "Norway": "Noruega",
  "Czech Republic": "República Tcheca",
  "Czechia": "República Tcheca",
  "Serbia": "Sérvia",
  "Turkey": "Turquia",
  "Türkiye": "Turquia",
  "Ukraine": "Ucrânia",
  "Wales": "País de Gales",
  "Scotland": "Escócia",
  "Republic of Ireland": "Irlanda",
  "Ireland": "Irlanda",
  "Northern Ireland": "Irlanda do Norte",
  "Hungary": "Hungria",
  "Romania": "Romênia",
  "Greece": "Grécia",
  "Russia": "Rússia",
  "Slovakia": "Eslováquia",
  "Slovenia": "Eslovênia",
  "Albania": "Albânia",
  "Bosnia and Herzegovina": "Bósnia e Herzegovina",
  "Bosnia-Herzegovina": "Bósnia e Herzegovina",
  "Iceland": "Islândia",
  "Finland": "Finlândia",
  "Bulgaria": "Bulgária",
  "Montenegro": "Montenegro",
  "North Macedonia": "Macedônia do Norte",
  // CAF
  "Morocco": "Marrocos",
  "Senegal": "Senegal",
  "Tunisia": "Tunísia",
  "Algeria": "Argélia",
  "Egypt": "Egito",
  "Nigeria": "Nigéria",
  "Ghana": "Gana",
  "Cameroon": "Camarões",
  "Ivory Coast": "Costa do Marfim",
  "Côte d'Ivoire": "Costa do Marfim",
  "South Africa": "África do Sul",
  "Mali": "Mali",
  "Burkina Faso": "Burkina Faso",
  "Cape Verde": "Cabo Verde",
  "Cape Verde Islands": "Cabo Verde",
  "DR Congo": "República Democrática do Congo",
  "Democratic Republic of the Congo": "República Democrática do Congo",
  // AFC
  "Japan": "Japão",
  "South Korea": "Coreia do Sul",
  "Korea Republic": "Coreia do Sul",
  "Iran": "Irã",
  "IR Iran": "Irã",
  "Saudi Arabia": "Arábia Saudita",
  "Australia": "Austrália",
  "Qatar": "Catar",
  "United Arab Emirates": "Emirados Árabes Unidos",
  "UAE": "Emirados Árabes Unidos",
  "Iraq": "Iraque",
  "Uzbekistan": "Uzbequistão",
  "Jordan": "Jordânia",
  "China": "China",
  "China PR": "China",
  // OFC
  "New Zealand": "Nova Zelândia",
};

const traduzir = (nome) => (nome && TRADUCAO[nome]) || nome || "";

const mapearFase = (stage) =>
  (!stage || stage === "GROUP_STAGE") ? "grupos" : "eliminatórias";

/* peso de pontuação por fase: erro no começo pesa menos, acerto no fim vale mais.
   Escala a partir das quartas de 2026: 16-avos/oitavas 2×, quartas 3×, semi e
   3º lugar 4×, final 5×.
   Os aliases cobrem variações de rótulo da football-data entre competições
   (LAST_8 x QUARTER_FINALS etc.) sem depender de um único nome exato.
   Rótulo de mata-mata desconhecido cai no fallback 2× — nunca infla pontuação
   por causa de um nome que a API passe a mandar. */
const PESO_POR_STAGE = {
  GROUP_STAGE: 1,
  LAST_32: 2, ROUND_OF_32: 2,
  LAST_16: 2, ROUND_OF_16: 2,
  QUARTER_FINALS: 3, QUARTER_FINAL: 3, LAST_8: 3,
  SEMI_FINALS: 4, SEMI_FINAL: 4, LAST_4: 4,
  THIRD_PLACE: 4, THIRD_PLACE_PLAYOFF: 4,
  FINAL: 5,
};
export const pesoDaStage = (stage) => {
  if (!stage) return 1;
  return PESO_POR_STAGE[stage] ?? 2;
};

/* Placar que o bolão pontua: 90min + prorrogação, PÊNALTIS FORA.
   ATENÇÃO (corrigido 29/06/2026): na football-data v4 o score.fullTime INCLUI
   os pênaltis num jogo decidido no shootout — gravar fullTime direto fazia o
   Alemanha 1×1 Paraguai virar 4×5. Tentei fullTime − penalties, mas o dado real
   da API vem INCONSISTENTE (Germany: fullTime 4-5, penalties 4-4, winner null —
   os pênaltis não fecham). A fonte CONFIÁVEL do fim da prorrogação é
   `regularTime + extraTime` (1-1 + 0-0 = 1-1), que não depende do campo de
   pênaltis bagunçado. Quando a partida não foi à prorrogação, a API não manda
   regularTime → cai no fullTime, que aí já é o placar certo (90min).
   Ref: https://docs.football-data.org/general/v4/overtime.html */
function placarBolao(score) {
  const ft = score?.fullTime || {};
  const rt = score?.regularTime;
  const et = score?.extraTime;
  /* teve prorrogação/pênaltis → soma 90min + prorrogação, ignora pênaltis */
  if (rt && rt.home != null && rt.away != null) {
    return {
      home: rt.home + (et?.home ?? 0),
      away: rt.away + (et?.away ?? 0),
    };
  }
  /* partida normal: fullTime é o placar certo */
  return { home: ft.home ?? null, away: ft.away ?? null };
}

/* normaliza pra comparação: sem acento, sem caixa, sem borda */
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const FOOTBALL_API = "https://api.football-data.org/v4/competitions/WC/matches";

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
    /* TEMP DIAGNÓSTICO — remover após medir o ao vivo no próximo jogo. Mostra o
       status CRU da football-data, pra checar se ela manda IN_PLAY com a bola rolando. */
    if (acao === "debug-status") {
      const hoje = hojeEmSP();
      const partidas = await buscarPartidas(`dateFrom=${addDias(hoje, -1)}&dateTo=${addDias(hoje, +2)}`);
      res.status(200).json({
        total: partidas.length,
        matches: partidas.map((m) => ({
          id: m.id, status: m.status, utcDate: m.utcDate, stage: m.stage,
          home: m.homeTeam?.name, away: m.awayTeam?.name,
          /* score completo p/ conferir a regra do mata-mata: fullTime já inclui
             prorrogação; duration=PENALTY_SHOOTOUT indica que foi pros pênaltis
             (e o fullTime deve ser o placar EMPATADO do fim da prorrogação). */
          fullTime: m.score?.fullTime, halfTime: m.score?.halfTime,
          regularTime: m.score?.regularTime, extraTime: m.score?.extraTime,
          penalties: m.score?.penalties,
          duration: m.score?.duration, winner: m.score?.winner,
          placarBolao: placarBolao(m.score), /* o que o bolão grava (pênaltis fora) */
        })),
      });
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

export async function acaoJogosHoje() {
  const hoje = hojeEmSP();
  /* janela ampla pra trás (adoção retroativa) + 1 dia pra frente (borda de fuso) */
  const partidas = await buscarPartidas(
    `dateFrom=${addDias(hoje, -14)}&dateTo=${addDias(hoje, +1)}`
  );
  /* só processa até hoje em SP — não pré-carrega futuro */
  const relevantes = partidas.filter((m) => dataSP(m.utcDate) <= hoje);

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
    const casa = traduzir(m.homeTeam?.name);
    const fora = traduzir(m.awayTeam?.name);
    const kickoff = m.utcDate;
    const fase = mapearFase(m.stage);
    const peso = pesoDaStage(m.stage);
    const ehHoje = dataSP(m.utcDate) === hoje;
    if (!casa || !fora) continue;

    /* (a) já carimbado — atualiza kickoff, fase e peso se mudou */
    const achado = porExt.get(externalId);
    if (achado) {
      const rows = await sql`
        UPDATE jogos
           SET kickoff = ${kickoff}, fase = ${fase}, peso = ${peso}
         WHERE id = ${achado.id}
           AND (kickoff IS DISTINCT FROM ${kickoff} OR fase IS DISTINCT FROM ${fase} OR peso IS DISTINCT FROM ${peso})
        RETURNING id
      `;
      if (rows.length > 0) atualizados++;
      continue;
    }

    /* (b) adoção de legado — qualquer dia da janela */
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
               fase = ${fase},
               peso = ${peso}
         WHERE id = ${cand.id}
      `;
      legados.splice(idx, 1);
      atualizados++;
      continue;
    }

    /* (c) novo — só pra hoje (não ressuscita jogos antigos não cadastrados) */
    if (ehHoje) {
      await sql`
        INSERT INTO jogos (casa, fora, kickoff, external_id, fase, peso)
        VALUES (${casa}, ${fora}, ${kickoff}, ${externalId}, ${fase}, ${peso})
      `;
      adicionados++;
    }
  }

  return { adicionados, atualizados, total: relevantes.length };
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
