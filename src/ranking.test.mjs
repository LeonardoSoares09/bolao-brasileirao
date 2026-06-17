/* Teste de equivalência (M1): prova que o ranking calculado pelo novo módulo
   ./ranking.js é IDÊNTICO à lógica inline antiga do App.jsx, para o ranking
   principal. Roda com: node src/ranking.test.mjs
   Não é parte do bundle — é uma rede de segurança do refactor. */

import { pontosDoPalpite, calcularStats, compararRanking, criterioDesempate, temPlacar } from "./ranking.js";

let falhas = 0;
const check = (cond, msg) => { if (!cond) { falhas++; console.error("  ✗ " + msg); } };

/* ---- cópia FIEL da lógica antiga (pré-refactor) para comparação ---- */
function pontosAntigo(palpite, jogo) {
  if (!palpite || jogo.gh === null || jogo.ga === null) return null;
  const ph = Number(palpite.h), pa = Number(palpite.a);
  if (Number.isNaN(ph) || Number.isNaN(pa)) return null;
  if (ph === jogo.gh && pa === jogo.ga) return 3;
  const sinal = (x, y) => (x > y ? 1 : x < y ? -1 : 0);
  if (sinal(ph, pa) === sinal(jogo.gh, jogo.ga)) return 1;
  return 0;
}
function rankingAntigo(estado, palpitesMap, hojeKey, chaveData, primeiroPalpiteMap) {
  return estado.participantes.map((p) => {
    let bonus = 0;
    const re = estado.resultadoEspecial;
    const acertouCampeao = !!(re?.campeao?.confirmado && (estado.palpitesCampeao || []).some(
      (pc) => pc.participante_id === p.id && pc.selecao === re.campeao.valor));
    if (acertouCampeao) bonus += 9;
    const acertouArtilheiro = !!(re?.artilheiro?.confirmado && (estado.premiadosArtilheiro || []).includes(p.id));
    if (acertouArtilheiro) bonus += 6;
    let pontos = bonus, exatos = 0, resultados = 0, exatosHoje = 0;
    for (const m of estado.jogos) {
      const pts = pontosAntigo(palpitesMap[m.id]?.[p.id], m);
      if (pts === 3) { exatos++; pontos += pts; if (m.kickoff && chaveData(m.kickoff) === hojeKey) exatosHoje++; }
      else if (pts === 1) { resultados++; pontos += pts; }
    }
    return { ...p, pontos, exatos, resultados, bonus, exatosHoje, acertouCampeao, acertouArtilheiro };
  }).sort((a, b) =>
    b.pontos - a.pontos || b.exatos - a.exatos ||
    (b.acertouCampeao ? 1 : 0) - (a.acertouCampeao ? 1 : 0) ||
    (b.acertouArtilheiro ? 1 : 0) - (a.acertouArtilheiro ? 1 : 0) ||
    b.resultados - a.resultados ||
    (primeiroPalpiteMap[a.id] && primeiroPalpiteMap[b.id]
      ? new Date(primeiroPalpiteMap[a.id]) - new Date(primeiroPalpiteMap[b.id]) : 0));
}
function rankingNovo(estado, palpitesMap, hojeKey, chaveData, primeiroPalpiteMap) {
  return estado.participantes
    .map((p) => calcularStats(p, estado, palpitesMap, { jogos: estado.jogos, hojeKey, chaveData }))
    .sort((a, b) => compararRanking(a, b, primeiroPalpiteMap));
}

/* ---- cenário sintético com jogos encerrados, ao vivo, bônus e desempate ---- */
const chaveData = (iso) => (iso ? iso.slice(0, 10) : "__semdata__");
const hojeKey = "2026-06-16";

const estado = {
  participantes: [
    { id: 1, nome: "Ana" }, { id: 2, nome: "Bruno" }, { id: 3, nome: "Caio" },
    { id: 4, nome: "Duda" }, { id: 5, nome: "Edu" },
  ],
  jogos: [
    { id: 10, kickoff: "2026-06-14T18:00:00Z", gh: 2, ga: 1, live: false }, // encerrado
    { id: 11, kickoff: "2026-06-15T18:00:00Z", gh: 0, ga: 0, live: false }, // encerrado
    { id: 12, kickoff: "2026-06-16T18:00:00Z", gh: 1, ga: 0, live: true },  // AO VIVO hoje
    { id: 13, kickoff: "2026-06-16T21:00:00Z", gh: null, ga: null, live: false }, // não começou
  ],
  resultadoEspecial: {
    campeao: { confirmado: true, valor: "BRA" },
    artilheiro: { confirmado: true },
  },
  palpitesCampeao: [
    { participante_id: 1, selecao: "BRA" }, // Ana acerta campeã (+9)
    { participante_id: 3, selecao: "ARG" },
  ],
  premiadosArtilheiro: [2], // Bruno acerta artilheiro (+6)
};
const palpitesMap = {
  10: { 1: { h: 2, a: 1 }, 2: { h: 1, a: 0 }, 3: { h: 2, a: 1 }, 4: { h: 0, a: 0 }, 5: { h: 2, a: 1 } },
  11: { 1: { h: 0, a: 0 }, 2: { h: 0, a: 0 }, 3: { h: 1, a: 1 }, 5: { h: 0, a: 0 } },
  12: { 1: { h: 1, a: 0 }, 2: { h: 2, a: 0 }, 3: { h: 1, a: 0 }, 4: { h: 1, a: 0 }, 5: { h: 0, a: 1 } },
};
const primeiroPalpiteMap = {
  1: "2026-06-01T10:00:00Z", 2: "2026-06-01T11:00:00Z", 3: "2026-06-01T09:00:00Z",
  4: "2026-06-02T10:00:00Z", 5: "2026-06-01T08:00:00Z",
};

/* 1) pontosDoPalpite idêntico em todos os jogos/palpites */
for (const j of estado.jogos) for (const pid of [1, 2, 3, 4, 5]) {
  const pal = palpitesMap[j.id]?.[pid];
  check(pontosDoPalpite(pal, j) === pontosAntigo(pal, j),
    `pontosDoPalpite divergiu (jogo ${j.id}, p${pid})`);
}

/* 2) ranking principal: ordem E stats idênticos */
const velho = rankingAntigo(estado, palpitesMap, hojeKey, chaveData, primeiroPalpiteMap);
const novo = rankingNovo(estado, palpitesMap, hojeKey, chaveData, primeiroPalpiteMap);
check(velho.length === novo.length, "tamanho do ranking diferente");
for (let i = 0; i < velho.length; i++) {
  const a = velho[i], b = novo[i];
  check(a.id === b.id, `ordem diferente na posição ${i}: ${a.nome} vs ${b.nome}`);
  for (const k of ["pontos", "exatos", "resultados", "bonus", "exatosHoje", "acertouCampeao", "acertouArtilheiro"]) {
    check(a[k] === b[k], `${a.nome}.${k}: antigo=${a[k]} novo=${b[k]}`);
  }
}

/* 3) compararRanking coerente com criterioDesempate: se há critério (empate em
      pontos), o comparador NÃO pode dizer que são iguais (0). */
for (let i = 0; i < novo.length; i++) for (let j = 0; j < novo.length; j++) {
  if (i === j) continue;
  const c = criterioDesempate(novo[i], novo[j]);
  if (c) {
    const cmp = compararRanking(novo[i], novo[j], primeiroPalpiteMap);
    check(cmp !== 0, `criterioDesempate diz "${c.label}" mas comparador empatou (${novo[i].nome} vs ${novo[j].nome})`);
  }
}

/* 4) M4 — alinhamento ao vivo. O perfil/modal somam pontosDoPalpite sobre os
      jogos COM PLACAR (incluindo ao vivo), SEM bônus. Isso tem que bater com o
      total do ranking menos o bônus daquele participante. */
const jogoVivo = estado.jogos.find((m) => m.live);
check(jogoVivo && temPlacar(jogoVivo) === true, "temPlacar deve INCLUIR jogo ao vivo");
const jogoFinal = estado.jogos.find((m) => !m.live && m.gh !== null);
check(jogoFinal && temPlacar(jogoFinal) === true, "temPlacar deve incluir jogo encerrado");
const jogoSemPlacar = estado.jogos.find((m) => m.gh === null);
check(jogoSemPlacar && temPlacar(jogoSemPlacar) === false, "temPlacar deve EXCLUIR jogo sem placar");

function totalPerfilModal(pid) {
  // replica o calculo do ModalPalpites/PerfilPicker (soma sobre temPlacar, sem bonus)
  let t = 0;
  for (const m of estado.jogos.filter(temPlacar)) {
    const pts = pontosDoPalpite(palpitesMap[m.id]?.[pid], m);
    if (pts) t += pts;
  }
  return t;
}
let viuAoVivo = false;
for (const p of novo) {
  check(p.pontos - p.bonus === totalPerfilModal(p.id),
    `M4: ${p.nome} ranking-sem-bonus=${p.pontos - p.bonus} != total perfil/modal=${totalPerfilModal(p.id)}`);
  // garante que o cenario realmente exercita pontos de jogo ao vivo
  const ptsVivo = pontosDoPalpite(palpitesMap[jogoVivo.id]?.[p.id], jogoVivo);
  if (ptsVivo) viuAoVivo = true;
}
check(viuAoVivo, "cenario de teste deveria ter ao menos um ponto vindo do jogo ao vivo");

if (falhas === 0) console.log("✓ ranking.test.mjs — todos os cenários passaram (novo == antigo + alinhamento M4)");
else { console.error(`\n✗ ${falhas} verificação(ões) falharam`); process.exit(1); }
