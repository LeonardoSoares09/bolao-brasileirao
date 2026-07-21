/* lib/clubes.js — dados dos 20 clubes da Série A 2026 (2º turno) e regra de
   peso por jogo. Módulo compartilhado: importado tanto pelo client
   (src/App.jsx) quanto pelas serverless functions (api/futebol.js,
   api/jogo.js) — a regra de peso mora aqui pra não duplicar entre ingestão
   automática e cadastro manual. */

/* Nome de exibição por clube. `escudo` é o caminho do SVG oficial em
   public/escudos/ (prioridade de exibição — ver fl() em App.jsx); emoji+cor
   ficam como fallback (mesmo padrão do Avatar dos participantes —
   PALETA_CORES/EMOJIS_AVATAR em App.jsx) caso o escudo não carregue. */
export const CLUBE_INFO = {
  "Athletico Paranaense": { escudo: "/escudos/athletico-paranaense.svg", emoji: "🌪️", cor: "#CC0000" },
  "Atlético Mineiro":     { escudo: "/escudos/atletico-mineiro.svg",     emoji: "🐓", cor: "#1A1A1A" },
  "Bahia":                { escudo: "/escudos/bahia.svg",                emoji: "🦸‍♂️", cor: "#0C4CAB" },
  "Botafogo":             { escudo: "/escudos/botafogo.svg",             emoji: "⭐", cor: "#2B2B2B" },
  "Bragantino":           { escudo: "/escudos/bragantino.svg",           emoji: "🐂", cor: "#E2231A" },
  "Chapecoense":          { escudo: "/escudos/chapecoense.svg",          emoji: "🏹", cor: "#046A38" },
  "Corinthians":          { escudo: "/escudos/corinthians.svg",          emoji: "🦅", cor: "#000000" },
  "Coritiba":             { escudo: "/escudos/coritiba.svg",             emoji: "🍗", cor: "#026937" },
  "Cruzeiro":             { escudo: "/escudos/cruzeiro.svg",             emoji: "🦊", cor: "#002366" },
  "Flamengo":             { escudo: "/escudos/flamengo.svg",             emoji: "🐦‍⬛", cor: "#C4122C" },
  "Fluminense":           { escudo: "/escudos/fluminense.svg",           emoji: "🇭🇺", cor: "#7A1F3D" },
  "Grêmio":               { escudo: "/escudos/gremio.svg",               emoji: "🇪🇪", cor: "#0D3B7E" },
  "Internacional":        { escudo: "/escudos/internacional.svg",        emoji: "🇦🇹", cor: "#E5050F" },
  "Mirassol":             { escudo: "/escudos/mirassol.svg",             emoji: "🌽", cor: "#FFC72C" },
  "Palmeiras":            { escudo: "/escudos/palmeiras.svg",            emoji: "🐷", cor: "#006437" },
  "Remo":                 { escudo: "/escudos/remo.svg",                 emoji: "🛶", cor: "#002D72" },
  "Santos":               { escudo: "/escudos/santos.svg",               emoji: "🐳", cor: "#000000" },
  "São Paulo":            { escudo: "/escudos/sao-paulo.svg",            emoji: "🇾🇪", cor: "#CC0000" },
  "Vasco da Gama":        { escudo: "/escudos/vasco-da-gama.svg",        emoji: "💢", cor: "#000000" },
  "Vitória":              { escudo: "/escudos/vitoria.svg",              emoji: "🦁", cor: "#CC0000" },
};

export const TIMES = Object.keys(CLUBE_INFO).sort((a, b) => a.localeCompare(b, "pt-BR"));

/* Nome oficial que a football-data.org retorna em homeTeam.name/awayTeam.name
   pra competição BSA → nosso nome de exibição. Confirmado via
   GET /v4/competitions/BSA/teams em 2026-07-16 (20/20 clubes batem). */
export const TRADUCAO_CLUBES = {
  "CR Flamengo": "Flamengo",
  "CA Mineiro": "Atlético Mineiro",
  "Grêmio FBPA": "Grêmio",
  "CA Paranaense": "Athletico Paranaense",
  "SE Palmeiras": "Palmeiras",
  "Botafogo FR": "Botafogo",
  "Cruzeiro EC": "Cruzeiro",
  "Chapecoense AF": "Chapecoense",
  "São Paulo FC": "São Paulo",
  "EC Bahia": "Bahia",
  "SC Corinthians Paulista": "Corinthians",
  "CR Vasco da Gama": "Vasco da Gama",
  "EC Vitória": "Vitória",
  "Fluminense FC": "Fluminense",
  "Coritiba FBC": "Coritiba",
  "RB Bragantino": "Bragantino",
  "Clube do Remo": "Remo",
  "Mirassol FC": "Mirassol",
  "SC Internacional": "Internacional",
  "Santos FC": "Santos",
};

export const traduzirClube = (nome) => (nome && TRADUCAO_CLUBES[nome]) || nome || "";

/* Clássicos regionais que valem peso extra (2×), independente da rodada.
   Lista fechada — só estes 6 pares (um por estado com 2+ clubes na Série A
   2026); decisão de produto, não é "todo confronto do mesmo estado". */
export const CLASSICOS = [
  ["Flamengo", "Fluminense"],
  ["Palmeiras", "Corinthians"],
  ["Grêmio", "Internacional"],
  ["Atlético Mineiro", "Cruzeiro"],
  ["Athletico Paranaense", "Coritiba"],
  ["Bahia", "Vitória"],
  ["São Paulo", "Santos"]
];

export function ehClassico(casa, fora) {
  return CLASSICOS.some(([a, b]) => (a === casa && b === fora) || (a === fora && b === casa));
}

/* Peso por rodada: 19–30 = 1×, 31–35 = 2×, 36–38 = 3× (reta final da
   temporada). rodada ausente/inválida cai no 1× (mesmo default do resto
   do app). */
export function pesoDaRodada(rodada) {
  const r = Number(rodada);
  if (!Number.isFinite(r)) return 1;
  if (r >= 36) return 3;
  if (r >= 31) return 2;
  return 1;
}

/* Peso final do jogo: o MAIOR entre peso-por-rodada e peso-de-clássico (não
   empilha — um clássico na reta final continua 3×, não vira 6×). */
export function pesoDoJogo(rodada, casa, fora) {
  const porRodada = pesoDaRodada(rodada);
  const porClassico = ehClassico(casa, fora) ? 2 : 1;
  return Math.max(porRodada, porClassico);
}

/* Prazo do palpite de artilheiro: trava no início da rodada 21 — ou seja, o
   kickoff do primeiro jogo dessa rodada. Calculado a partir de `jogos.kickoff`
   (api/estado.js e api/artilheiro.js), não é uma data fixa: acompanha o
   calendário real da Série A, que só é conhecido conforme os jogos vão sendo
   cadastrados. */
export const RODADA_LIMITE_ARTILHEIRO = 21;

/* Prazo do lembrete de PAGAMENTO — campo separado do artilheiro, DATA FIXA
   (não depende de rodada estar cadastrada em `jogos`): decisão do Leonardo,
   quer o pix pago até o INÍCIO DA RODADA 20 (25/07/2026 18h30 BRT) — o mesmo
   instante em que o ranking oficial começa e a rodada 19 "treino" deixa de
   contar. Se um dia quiser voltar a acompanhar o calendário real da Série A em
   vez de uma data fixa, trocar por uma consulta a `jogos` como
   RODADA_LIMITE_ARTILHEIRO faz. */
export const PRAZO_PAGAMENTO_FIXO = "2026-07-25T18:30:00-03:00";

/* Intervalo do import de histórico (1º turno 2026, ver
   proposta-historico-tabela-oficial.md) — rodadas 1-18, já disputadas antes do bolão
   existir. Intervalo fechado: não é validação genérica de "matchday existe". */
export const RODADA_HISTORICO_MIN = 1;
export const RODADA_HISTORICO_MAX = 18;

export function matchdayHistoricoValido(matchday) {
  const n = Number(matchday);
  return Number.isInteger(n) && n >= RODADA_HISTORICO_MIN && n <= RODADA_HISTORICO_MAX;
}
