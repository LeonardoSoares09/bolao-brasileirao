/* lib/clubes.js — dados dos 20 clubes da Série A 2026 (2º turno) e regra de
   peso por jogo. Módulo compartilhado: importado tanto pelo client
   (src/App.jsx) quanto pelas serverless functions (api/futebol.js,
   api/jogo.js) — a regra de peso mora aqui pra não duplicar entre ingestão
   automática e cadastro manual. */

/* Nome de exibição por clube. Emoji+cor curados à mão (mesmo padrão do
   Avatar dos participantes — PALETA_CORES/EMOJIS_AVATAR em App.jsx), não
   hash automático: cor é a cor primária real do clube, emoji é uma
   referência a apelido/mascote quando existe um óbvio. */
export const CLUBE_INFO = {
  "Athletico Paranaense": { emoji: "🌪️", cor: "#CC0000" },
  "Atlético Mineiro":     { emoji: "🐓", cor: "#1A1A1A" },
  "Bahia":                { emoji: "🦸‍♂️", cor: "#0C4CAB" },
  "Botafogo":             { emoji: "⭐", cor: "#2B2B2B" },
  "Bragantino":           { emoji: "🐂", cor: "#E2231A" },
  "Chapecoense":          { emoji: "🏹", cor: "#046A38" },
  "Corinthians":          { emoji: "🦅", cor: "#000000" },
  "Coritiba":             { emoji: "🍗", cor: "#026937" },
  "Cruzeiro":             { emoji: "🦊", cor: "#002366" },
  "Flamengo":             { emoji: "🐦‍⬛", cor: "#C4122C" },
  "Fluminense":           { emoji: "🇭🇺", cor: "#7A1F3D" },
  "Grêmio":               { emoji: "🇪🇪", cor: "#0D3B7E" },
  "Internacional":        { emoji: "🇦🇹", cor: "#E5050F" },
  "Mirassol":             { emoji: "🌽", cor: "#FFC72C" },
  "Palmeiras":            { emoji: "🐷", cor: "#006437" },
  "Remo":                 { emoji: "🛶", cor: "#002D72" },
  "Santos":               { emoji: "🐳", cor: "#000000" },
  "São Paulo":            { emoji: "🇾🇪", cor: "#CC0000" },
  "Vasco da Gama":        { emoji: "💢", cor: "#000000" },
  "Vitória":              { emoji: "🦁", cor: "#CC0000" },
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

/* Prazo do palpite de artilheiro (e, reaproveitado, do lembrete de pagamento):
   trava no início da rodada 21 — ou seja, o kickoff do primeiro jogo dessa
   rodada. Calculado a partir de `jogos.kickoff` (api/estado.js e
   api/artilheiro.js), não é uma data fixa: acompanha o calendário real da
   Série A, que só é conhecido conforme os jogos vão sendo cadastrados. */
export const RODADA_LIMITE_ARTILHEIRO = 21;
