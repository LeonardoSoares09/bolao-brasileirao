/* /api/futebol — integração com football-data.org (free tier cobre o WC).
   GET ?t=TOKEN&acao=jogos-hoje  → busca partidas do dia (fuso SP) e insere/adota
   GET ?t=TOKEN&acao=resultados  → grava placar final dos jogos FINISHED
   Somente admin. Auth via header X-Auth-Token (env FOOTBALL_DATA_KEY). */

import { sql, autenticar } from "../lib/db.js";
import { enviarPush } from "../lib/notificar.js";

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
  if (!eu.isAdmin) {
    res.status(403).json({ error: "Só o organizador usa a busca automática" });
    return;
  }
  if (!process.env.FOOTBALL_DATA_KEY) {
    res.status(500).json({ error: "FOOTBALL_DATA_KEY não configurada na Vercel" });
    return;
  }

  const acao = String(req.query.acao || "");
  try {
    if (acao === "jogos-hoje") {
      res.status(200).json(await acaoJogosHoje());
      return;
    }
    if (acao === "resultados") {
      res.status(200).json(await acaoResultados());
      return;
    }
    res.status(400).json({ error: "acao inválida — use 'jogos-hoje' ou 'resultados'" });
  } catch (e) {
    console.error(e);
    if (e.externo) {
      res.status(502).json({ error: "Não consegui falar com a football-data agora — tenta de novo em instantes." });
      return;
    }
    res.status(500).json({ error: "Erro interno — tenta de novo ou lança manualmente." });
  }
}

async function acaoJogosHoje() {
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
    const ehHoje = dataSP(m.utcDate) === hoje;
    if (!casa || !fora) continue;

    /* (a) já carimbado — atualiza kickoff e fase se mudou */
    const achado = porExt.get(externalId);
    if (achado) {
      const rows = await sql`
        UPDATE jogos
           SET kickoff = ${kickoff}, fase = ${fase}
         WHERE id = ${achado.id}
           AND (kickoff IS DISTINCT FROM ${kickoff} OR fase IS DISTINCT FROM ${fase})
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
               fase = ${fase}
         WHERE id = ${cand.id}
      `;
      legados.splice(idx, 1);
      atualizados++;
      continue;
    }

    /* (c) novo — só pra hoje (não ressuscita jogos antigos não cadastrados) */
    if (ehHoje) {
      await sql`
        INSERT INTO jogos (casa, fora, kickoff, external_id, fase)
        VALUES (${casa}, ${fora}, ${kickoff}, ${externalId}, ${fase})
      `;
      adicionados++;
    }
  }

  return { adicionados, atualizados, total: relevantes.length };
}

export async function acaoResultados() {
  const hoje = hojeEmSP();
  /* janela ampla dos últimos 14 dias só pra cobrir; status=FINISHED filtra o resto */
  const partidas = await buscarPartidas(
    `dateFrom=${addDias(hoje, -14)}&dateTo=${addDias(hoje, +1)}&status=FINISHED`
  );

  let atualizados = 0;

  for (const m of partidas) {
    const externalId = String(m.id);
    const gh = m.score?.fullTime?.home;
    const ga = m.score?.fullTime?.away;
    if (gh == null || ga == null) continue;

    /* só atualiza jogos JÁ carimbados — sem adoção nem insert aqui */
    const rows = await sql`
      UPDATE jogos
         SET gh = ${gh}, ga = ${ga}
       WHERE external_id = ${externalId}
         AND (gh IS DISTINCT FROM ${gh} OR ga IS DISTINCT FROM ${ga})
      RETURNING id, casa, fora
    `;
    if (rows.length > 0) {
      atualizados++;
      const { casa, fora } = rows[0];
      enviarPush("todos", "⚽ Resultado lançado!", `${casa} ${gh}×${ga} ${fora} — veja como ficou seu palpite!`, "/").catch(() => {});
    }
  }

  return { atualizados };
}
