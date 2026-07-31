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

/* Prazo do lembrete de PAGAMENTO e do palpite de ARTILHEIRO — mesma DATA FIXA
   pros dois (decisão do Leonardo): pix pago e artilheiro escolhido até o
   INÍCIO DA RODADA 20 (25/07/2026 18h30 BRT), o mesmo instante em que o
   ranking oficial começa e a rodada 19 "treino" deixa de contar. */
export const PRAZO_PAGAMENTO_FIXO = "2026-07-25T18:30:00-03:00";
export const PRAZO_ARTILHEIRO_FIXO = PRAZO_PAGAMENTO_FIXO;

/* Intervalo do import de histórico (1º turno 2026, ver
   proposta-historico-tabela-oficial.md) — rodadas 1-18, já disputadas antes do bolão
   existir. Intervalo fechado: não é validação genérica de "matchday existe". */
export const RODADA_HISTORICO_MIN = 1;
export const RODADA_HISTORICO_MAX = 18;

export function matchdayHistoricoValido(matchday) {
  const n = Number(matchday);
  return Number.isInteger(n) && n >= RODADA_HISTORICO_MIN && n <= RODADA_HISTORICO_MAX;
}

/* ─────────────────────────────────────────────────────────────────────────
   STATUS DA PARTIDA (coluna jogos.status, migration V09)
   Vem da football-data: SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED,
   SUSPENDED, POSTPONED, CANCELLED, AWARDED. Compartilhado entre o servidor
   (api/futebol.js decide o que gravar) e o cliente (src/App.jsx decide o que
   mostrar) — por isso mora aqui, e não num dos dois lados.

   status NULL conta como jogo normal de propósito: cobre tanto as linhas
   anteriores à V09 quanto os jogos que o admin cadastra à mão, que não têm
   status nenhum e devem valer normalmente.
   ───────────────────────────────────────────────────────────────────────── */

/* Adiado: vai acontecer, só não se sabe quando. A linha é preservada (com os
   palpites), some da tela de palpites e volta sozinha quando remarcarem.
   SUSPENDED (interrompido no meio, a concluir depois) cai no mesmo caso. */
export const ADIADO = "POSTPONED";
export const CANCELADO = "CANCELLED";

export const jogoAdiado = (m) => m?.status === ADIADO || m?.status === "SUSPENDED";

/* Cancelado: não vai acontecer. Fica escondido de todo mundo e o import não
   recria — é o que encerra o ciclo de "apago e ele volta". */
export const jogoCancelado = (m) => m?.status === CANCELADO;

/* Jogo está aberto pra palpite? SEM DATA nunca está — nem adiado pela CBF,
   nem cadastrado à mão sem horário. Dois motivos:
   1) sem kickoff não existe prazo pra fazer valer, então o palpite ficaria
      aceitando edição pra sempre, inclusive depois de a bola rolar;
   2) a antecedência média (5º critério de desempate) é kickoff menos
      atualizado_em — palpite gravado sem data renderia uma antecedência
      enorme no dia em que a data aparecesse, e quem palpitasse em tudo que
      está parado levaria o desempate de graça.
   Quando a data sair, o jogo reabre pra todos ao mesmo tempo.
   Não cobre "já começou"/"já tem placar": isso depende da hora atual e do
   placar, e continua sendo checado em api/palpite.js. */
export const jogoAceitaPalpite = (m) => !!m?.kickoff && !jogoAdiado(m) && !jogoCancelado(m);
