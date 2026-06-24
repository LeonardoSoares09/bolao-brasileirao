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

/* Pontos de UM palpite contra UM jogo.
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
    if (pts === PTS_EXATO) {
      exatos++; pontos += pts;
      /* exatosHoje dispara o GOOOL + confete: só vale CRAVADA confirmada, isto é,
         jogo ENCERRADO (não ao vivo). Sem o !m.live, um placar parcial igual ao
         palpite (ex.: 1×1 com a bola rolando) faria todo mundo "gritar gol" sem
         ter acertado de verdade. */
      if (hojeKey && chaveData && !m.live && m.kickoff && chaveData(m.kickoff) === hojeKey) exatosHoje++;
    } else if (pts === PTS_RESULTADO) { resultados++; pontos += pts; }
  }
  return { ...p, pontos, exatos, resultados, bonus, exatosHoje, acertouCampeao, acertouArtilheiro };
}

/* Comparador canônico do ranking. MESMA ordem do criterioDesempate abaixo —
   precisam ficar em sincronia (antes estavam em dois lugares com regras
   diferentes, o que gerava setas de tendência falsas: item M2).
   primeiroPalpiteMap: { [participante_id]: timestamp do 1º palpite }. */
export function compararRanking(a, b, primeiroPalpiteMap = {}) {
  return (
    b.pontos - a.pontos ||
    b.exatos - a.exatos ||
    (b.acertouCampeao ? 1 : 0) - (a.acertouCampeao ? 1 : 0) ||
    (b.acertouArtilheiro ? 1 : 0) - (a.acertouArtilheiro ? 1 : 0) ||
    b.resultados - a.resultados ||
    (primeiroPalpiteMap[a.id] && primeiroPalpiteMap[b.id]
      ? new Date(primeiroPalpiteMap[a.id]) - new Date(primeiroPalpiteMap[b.id])
      : 0)
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
  return { icon: "⏱", label: "palpitou antes" };
}
