/* ============================================================
   ranking.js — FONTE ÚNICA de cálculo de ranking (item M1 do review)
   Funções puras (sem React/DOM) para serem testáveis e evitar a
   lógica de pontuação duplicada que existia espalhada pelo App.jsx.
   ============================================================ */

export const PTS_EXATO = 3;
export const PTS_RESULTADO = 1;
export const BONUS_CAMPEAO = 9;
export const BONUS_ARTILHEIRO = 6;

/* "Tem placar que conta pontos" — INCLUI jogo ao vivo (gh/ga preenchidos).
   Diferente de `temResultado` (no App.jsx), que exige jogo encerrado (!live).
   Usado para alinhar os totais ao vivo em todo lugar (item M4 do review). */
export const temPlacar = (m) => m.gh !== null && m.ga !== null;

/* Peso (multiplicador de pontos) do jogo por fase: grupos 1×, mata-mata 2×,
   final 4×. Fonte: coluna `peso` do banco (preenchida pela busca/admin).
   Fallback 1 mantém compatibilidade se vier um jogo sem o campo. */
export const pesoDoJogo = (jogo) => Number(jogo?.peso) || 1;

/* Pontos BRUTOS de UM palpite contra UM jogo (sem peso) — usado para CLASSIFICAR
   (exato/resultado/erro) e contar exatos/resultados no desempate.
   Retorna null se não há palpite ou o jogo ainda não tem placar.
   (Conta jogo ao vivo: basta gh/ga preenchidos — política tratada por quem chama.) */
export function pontosDoPalpite(palpite, jogo) {
  if (!palpite || jogo.gh === null || jogo.ga === null) return null;
  const ph = Number(palpite.h), pa = Number(palpite.a);
  if (Number.isNaN(ph) || Number.isNaN(pa)) return null;
  if (ph === jogo.gh && pa === jogo.ga) return PTS_EXATO;
  const sinal = (x, y) => (x > y ? 1 : x < y ? -1 : 0);
  if (sinal(ph, pa) === sinal(jogo.gh, jogo.ga)) return PTS_RESULTADO;
  return 0;
}

/* Pontos JÁ COM PESO da fase — é o que entra no total e aparece pra galera
   (ex.: placar exato na final = 3 × 4 = 12). Retorna null se sem placar/palpite. */
export function pontosComPeso(palpite, jogo) {
  const base = pontosDoPalpite(palpite, jogo);
  return base === null ? null : base * pesoDoJogo(jogo);
}

/* Bônus de campeã (+9) e artilheiro (+6) de um participante, mais os flags
   de acerto (usados como critério de desempate). */
export function calcularBonus(p, estado) {
  let bonus = 0;
  const re = estado.resultadoEspecial;
  const acertouCampeao = !!(re?.campeao?.confirmado && (estado.palpitesCampeao || []).some(
    (pc) => pc.participante_id === p.id && pc.selecao === re.campeao.valor
  ));
  if (acertouCampeao) bonus += BONUS_CAMPEAO;
  const acertouArtilheiro = !!(re?.artilheiro?.confirmado && (estado.premiadosArtilheiro || []).includes(p.id));
  if (acertouArtilheiro) bonus += BONUS_ARTILHEIRO;
  return { bonus, acertouCampeao, acertouArtilheiro };
}

/* Stats completos de um participante sobre um conjunto de jogos.
   opts.jogos: lista de jogos a considerar (default: estado.jogos).
   opts.hojeKey + opts.chaveData: opcionais — só para contar `exatosHoje`
   (usado pelo confete); se não vierem, exatosHoje fica 0. */
export function calcularStats(p, estado, palpitesMap, opts = {}) {
  const { jogos = estado.jogos, hojeKey = null, chaveData = null } = opts;
  const { bonus, acertouCampeao, acertouArtilheiro } = calcularBonus(p, estado);
  let pontos = bonus, exatos = 0, resultados = 0, exatosHoje = 0;
  for (const m of jogos) {
    const pts = pontosDoPalpite(palpitesMap[m.id]?.[p.id], m);
    /* peso entra SÓ no total de pontos; as contagens de exatos/resultados
       (usadas no desempate) seguem sem peso: 1 exato = 1 exato. */
    if (pts === PTS_EXATO) {
      exatos++; pontos += pts * pesoDoJogo(m);
      /* exatosHoje dispara o GOOOL + confete: só vale CRAVADA confirmada, isto é,
         jogo ENCERRADO (não ao vivo). Sem o !m.live, um placar parcial igual ao
         palpite (ex.: 1×1 com a bola rolando) faria todo mundo "gritar gol" sem
         ter acertado de verdade. */
      if (hojeKey && chaveData && !m.live && m.kickoff && chaveData(m.kickoff) === hojeKey) exatosHoje++;
    } else if (pts === PTS_RESULTADO) { resultados++; pontos += pts * pesoDoJogo(m); }
  }
  return { ...p, pontos, exatos, resultados, bonus, exatosHoje, acertouCampeao, acertouArtilheiro };
}

/* 5º critério de desempate: ANTECEDÊNCIA MÉDIA (segundos antes do kickoff).
   Maior = palpita mais cedo, em média = vence. Quem tem dado vence quem não tem
   (não palpitou nenhum jogo com horário). Empate real (mesma média ou ambos sem
   dado) cai pra divisão do prêmio. */
function compararAntecedencia(antA, antB) {
  const temA = antA != null, temB = antB != null;
  if (temA && temB) return antB - antA; // maior média primeiro
  if (temA) return -1;                   // só A tem dado → A na frente
  if (temB) return 1;                    // só B tem dado → B na frente
  return 0;                              // empate técnico
}

/* Comparador canônico do ranking. MESMA ordem do criterioDesempate abaixo —
   precisam ficar em sincronia (antes estavam em dois lugares com regras
   diferentes, o que gerava setas de tendência falsas: item M2).
   antecedenciaMap: { [participante_id]: antecedência média em segundos }. */
export function compararRanking(a, b, antecedenciaMap = {}) {
  return (
    b.pontos - a.pontos ||
    b.exatos - a.exatos ||
    (b.acertouCampeao ? 1 : 0) - (a.acertouCampeao ? 1 : 0) ||
    (b.acertouArtilheiro ? 1 : 0) - (a.acertouArtilheiro ? 1 : 0) ||
    b.resultados - a.resultados ||
    compararAntecedencia(antecedenciaMap[a.id], antecedenciaMap[b.id])
  );
}

/* Rótulo de QUAL critério separou dois participantes empatados em pontos.
   Espelha a ordem do compararRanking. */
export function criterioDesempate(a, b) {
  if (a.pontos !== b.pontos) return null;
  if (a.exatos !== b.exatos) return { icon: "🎯", label: "mais exatos" };
  if (!!a.acertouCampeao !== !!b.acertouCampeao) return { icon: "🏆", label: "acertou a campeã" };
  if (!!a.acertouArtilheiro !== !!b.acertouArtilheiro) return { icon: "⚽", label: "acertou o artilheiro" };
  if (a.resultados !== b.resultados) return { icon: "✅", label: "mais resultados" };
  return { icon: "⏱", label: "palpita com mais antecedência" };
}
