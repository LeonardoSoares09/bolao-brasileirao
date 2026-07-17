/* Teste de equivalência (M1): prova que o ranking calculado pelo novo módulo
   ./ranking.js é IDÊNTICO à lógica inline antiga do App.jsx, para o ranking
   principal. Roda com: node src/ranking.test.mjs
   Não é parte do bundle — é uma rede de segurança do refactor. */

import { pontosDoPalpite, pontosComPeso, rotuloDoPeso, calcularStats, compararRanking, criterioDesempate, temPlacar, calcularDetalhamento, calcularEvolucao, BONUS_CAMPEAO, BONUS_ARTILHEIRO, PTS_EXATO, contaParaRanking } from "./ranking.js";
import { pesoDaRodada, pesoDoJogo, ehClassico, matchdayHistoricoValido, RODADA_HISTORICO_MIN, RODADA_HISTORICO_MAX } from "../lib/clubes.js";

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
/* mesma regra do compararAntecedencia em ranking.js: maior média vence,
   quem tem dado vence quem não tem, empate real → 0 */
function cmpAnt(antA, antB) {
  const temA = antA != null, temB = antB != null;
  if (temA && temB) return antB - antA;
  if (temA) return -1;
  if (temB) return 1;
  return 0;
}
function rankingAntigo(estado, palpitesMap, hojeKey, chaveData, antecedenciaMap) {
  return estado.participantes.map((p) => {
    let bonus = 0;
    const re = estado.resultadoEspecial;
    const acertouCampeao = !!(re?.campeao?.confirmado && (estado.palpitesCampeao || []).some(
      (pc) => pc.participante_id === p.id && pc.selecao === re.campeao.valor));
    if (acertouCampeao) bonus += BONUS_CAMPEAO;
    const acertouArtilheiro = !!(re?.artilheiro?.confirmado && (estado.premiadosArtilheiro || []).includes(p.id));
    if (acertouArtilheiro) bonus += BONUS_ARTILHEIRO;
    let pontos = bonus, exatos = 0, resultados = 0, exatosHoje = 0;
    for (const m of estado.jogos) {
      const pts = pontosAntigo(palpitesMap[m.id]?.[p.id], m);
      if (pts === 3) { exatos++; pontos += pts; if (m.kickoff && !m.live && chaveData(m.kickoff) === hojeKey) exatosHoje++; }
      else if (pts === 1) { resultados++; pontos += pts; }
    }
    return { ...p, pontos, exatos, resultados, bonus, exatosHoje, acertouCampeao, acertouArtilheiro };
  }).sort((a, b) =>
    b.pontos - a.pontos || b.exatos - a.exatos ||
    (b.acertouCampeao ? 1 : 0) - (a.acertouCampeao ? 1 : 0) ||
    (b.acertouArtilheiro ? 1 : 0) - (a.acertouArtilheiro ? 1 : 0) ||
    b.resultados - a.resultados ||
    cmpAnt(antecedenciaMap[a.id], antecedenciaMap[b.id]));
}
function rankingNovo(estado, palpitesMap, hojeKey, chaveData, antecedenciaMap) {
  return estado.participantes
    .map((p) => calcularStats(p, estado, palpitesMap, { jogos: estado.jogos, hojeKey, chaveData }))
    .sort((a, b) => compararRanking(a, b, antecedenciaMap));
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
    { id: 14, kickoff: "2026-06-16T15:00:00Z", gh: 3, ga: 1, live: false }, // ENCERRADO hoje (cravada conta no exatosHoje)
  ],
  resultadoEspecial: {
    campeao: { confirmado: true, valor: "BRA" },
    artilheiro: { confirmado: true },
  },
  palpitesCampeao: [
    { participante_id: 1, selecao: "BRA" }, // Ana acerta campeã (+BONUS_CAMPEAO)
    { participante_id: 3, selecao: "ARG" },
  ],
  premiadosArtilheiro: [2], // Bruno acerta artilheiro (+18)
};
const palpitesMap = {
  10: { 1: { h: 2, a: 1 }, 2: { h: 1, a: 0 }, 3: { h: 2, a: 1 }, 4: { h: 0, a: 0 }, 5: { h: 2, a: 1 } },
  11: { 1: { h: 0, a: 0 }, 2: { h: 0, a: 0 }, 3: { h: 1, a: 1 }, 5: { h: 0, a: 0 } },
  12: { 1: { h: 1, a: 0 }, 2: { h: 2, a: 0 }, 3: { h: 1, a: 0 }, 4: { h: 1, a: 0 }, 5: { h: 0, a: 1 } },
  14: { 1: { h: 3, a: 1 }, 2: { h: 2, a: 1 }, 3: { h: 1, a: 1 }, 4: { h: 3, a: 1 }, 5: { h: 0, a: 0 } }, // Ana e Duda cravam 3×1 hoje
};
/* antecedência média em segundos antes do kickoff (maior = mais cedo = vence).
   Valores distintos pra que qualquer empate total seja resolvido por aqui. */
const antecedenciaMap = {
  1: 100000, 2: 90000, 3: 120000, 4: 50000, 5: 70000,
};

/* 1) pontosDoPalpite idêntico em todos os jogos/palpites */
for (const j of estado.jogos) for (const pid of [1, 2, 3, 4, 5]) {
  const pal = palpitesMap[j.id]?.[pid];
  check(pontosDoPalpite(pal, j) === pontosAntigo(pal, j),
    `pontosDoPalpite divergiu (jogo ${j.id}, p${pid})`);
}

/* 2) ranking principal: ordem E stats idênticos */
const velho = rankingAntigo(estado, palpitesMap, hojeKey, chaveData, antecedenciaMap);
const novo = rankingNovo(estado, palpitesMap, hojeKey, chaveData, antecedenciaMap);
check(velho.length === novo.length, "tamanho do ranking diferente");
for (let i = 0; i < velho.length; i++) {
  const a = velho[i], b = novo[i];
  check(a.id === b.id, `ordem diferente na posição ${i}: ${a.nome} vs ${b.nome}`);
  for (const k of ["pontos", "exatos", "resultados", "bonus", "exatosHoje", "acertouCampeao", "acertouArtilheiro"]) {
    check(a[k] === b[k], `${a.nome}.${k}: antigo=${a[k]} novo=${b[k]}`);
  }
}

/* 2b) exatosHoje (GOOOL + confete): só conta CRAVADA em jogo ENCERRADO de hoje.
   Jogo 14 (3×1, encerrado hoje): Ana e Duda cravaram → 1 cada.
   Jogo 12 (1×0, AO VIVO hoje): Ana/Caio/Duda palpitaram 1×0 = placar parcial,
   mas NÃO pode comemorar (jogo rolando). */
const porNome = (n) => novo.find((p) => p.nome === n);
check(porNome("Ana").exatosHoje === 1, `Ana.exatosHoje deveria ser 1 (cravou jogo encerrado de hoje), veio ${porNome("Ana").exatosHoje}`);
check(porNome("Duda").exatosHoje === 1, `Duda.exatosHoje deveria ser 1, veio ${porNome("Duda").exatosHoje}`);
check(porNome("Caio").exatosHoje === 0, `Caio.exatosHoje deveria ser 0 (só bateu placar de jogo AO VIVO), veio ${porNome("Caio").exatosHoje}`);

/* 3) compararRanking coerente com criterioDesempate: se há critério (empate em
      pontos), o comparador NÃO pode dizer que são iguais (0). */
for (let i = 0; i < novo.length; i++) for (let j = 0; j < novo.length; j++) {
  if (i === j) continue;
  const c = criterioDesempate(novo[i], novo[j], antecedenciaMap);
  if (c) {
    const cmp = compararRanking(novo[i], novo[j], antecedenciaMap);
    check(cmp !== 0, `criterioDesempate diz "${c.label}" mas comparador empatou (${novo[i].nome} vs ${novo[j].nome})`);
  }
}

/* 3b) regressão: dois participantes zerados que NUNCA palpitaram nada (sem
   entrada nenhuma em antecedenciaMap) são um EMPATE REAL — criterioDesempate
   não pode inventar "palpita com mais antecedência" só porque essa é a
   última checagem da função. */
{
  const zeroA = { id: 901, pontos: 0, exatos: 0, resultados: 0, acertouCampeao: false, acertouArtilheiro: false };
  const zeroB = { id: 902, pontos: 0, exatos: 0, resultados: 0, acertouCampeao: false, acertouArtilheiro: false };
  check(criterioDesempate(zeroA, zeroB, {}) === null, "dois zerados sem nenhum palpite = empate real, sem rótulo de desempate");
  check(compararRanking(zeroA, zeroB, {}) === 0, "compararRanking também deve dar empate (0) no mesmo cenário");
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

// PERFIL (aproveitamento): soma sobre temPlacar, SEM bonus.
function totalPerfil(pid) {
  let t = 0;
  for (const m of estado.jogos.filter(temPlacar)) {
    const pts = pontosDoPalpite(palpitesMap[m.id]?.[pid], m);
    if (pts) t += pts;
  }
  return t;
}
// MODAL agora mostra o total do ranking (participante.pontos), COM bonus.
let viuAoVivo = false, viuBonus = false;
for (const p of novo) {
  // perfil = ranking menos o bonus
  check(p.pontos - p.bonus === totalPerfil(p.id),
    `perfil: ${p.nome} ranking-sem-bonus=${p.pontos - p.bonus} != total perfil=${totalPerfil(p.id)}`);
  // modal = ranking cheio (com bonus). Quando ha bonus, modal != perfil.
  if (p.bonus > 0) {
    viuBonus = true;
    check(p.pontos === totalPerfil(p.id) + p.bonus,
      `modal: ${p.nome} total do modal (${p.pontos}) != perfil (${totalPerfil(p.id)}) + bonus (${p.bonus})`);
    check(p.pontos !== totalPerfil(p.id), `modal deveria diferir do perfil quando ha bonus (${p.nome})`);
  }
  const ptsVivo = pontosDoPalpite(palpitesMap[jogoVivo.id]?.[p.id], jogoVivo);
  if (ptsVivo) viuAoVivo = true;
}
check(viuAoVivo, "cenario deveria ter ao menos um ponto vindo do jogo ao vivo");
check(viuBonus, "cenario deveria ter ao menos um participante com bonus (campea/artilheiro)");

/* ---- escala de peso por fase (quartas 3× em diante) ---- */
{
  const jogo = (peso) => ({ gh: 2, ga: 1, peso });
  const exato = { h: 2, a: 1 }, resultado = { h: 3, a: 1 }, erro = { h: 0, a: 2 };

  /* placar exato (3 brutos) escalado por cada fase */
  check(pontosComPeso(exato, jogo(1)) === 3, "grupos: exato = 3");
  check(pontosComPeso(exato, jogo(2)) === 6, "oitavas: exato = 6");
  check(pontosComPeso(exato, jogo(3)) === 9, "quartas: exato = 9");
  check(pontosComPeso(exato, jogo(4)) === 12, "semi/3º: exato = 12");
  check(pontosComPeso(exato, jogo(5)) === 15, "final: exato = 15");

  /* acerto de resultado (1 bruto) e erro (0) seguem a mesma escala */
  check(pontosComPeso(resultado, jogo(3)) === 3, "quartas: resultado = 3");
  check(pontosComPeso(erro, jogo(5)) === 0, "final: erro continua 0");
  check(pontosComPeso(null, jogo(3)) === null, "sem palpite = null (não 0)");

  /* rótulo: 4× NÃO pode virar "Final" (regressão da UI antiga, que usava >= 4) */
  check(rotuloDoPeso(3).texto.includes("3×"), "peso 3 rotula 3×");
  check(rotuloDoPeso(3).destaque === true, "peso 3 tem destaque");
  check(rotuloDoPeso(2).texto.includes("2×"), "peso 2 rotula 2×");
  check(rotuloDoPeso(2).destaque === false, "peso 2 não tem destaque");
  check(rotuloDoPeso(1) === null, "peso normal não tem rótulo");
}

/* ---- mapa rodada/clássico → peso (lib/clubes.js), a fonte que o cron e o
   cadastro manual gravam no banco ---- */
{
  check(pesoDaRodada(19) === 1, "rodada 19 = 1×");
  check(pesoDaRodada(30) === 1, "rodada 30 = 1×");
  check(pesoDaRodada(31) === 2, "rodada 31 = 2× (início da reta final)");
  check(pesoDaRodada(35) === 2, "rodada 35 = 2×");
  check(pesoDaRodada(36) === 3, "rodada 36 = 3× (reta final)");
  check(pesoDaRodada(38) === 3, "rodada 38 = 3×");
  check(pesoDaRodada(null) === 1, "rodada ausente = 1× (jogo cadastrado na mão sem rodada)");

  check(ehClassico("Flamengo", "Fluminense") === true, "Fla-Flu é clássico");
  check(ehClassico("Fluminense", "Flamengo") === true, "clássico bate nos dois sentidos (casa/fora invertidos)");
  check(ehClassico("Flamengo", "Palmeiras") === false, "times de clássicos diferentes não formam clássico entre si");

  check(pesoDoJogo(20, "Flamengo", "Fluminense") === 2, "clássico fora da reta final = 2× (não é 1×)");
  check(pesoDoJogo(37, "Flamengo", "Fluminense") === 3, "clássico NA reta final = 3× (maior dos dois, não soma pra 5×/6×)");
  check(pesoDoJogo(37, "Botafogo", "Santos") === 3, "não-clássico na reta final = 3×");
  check(pesoDoJogo(20, "Botafogo", "Santos") === 1, "não-clássico fora da reta final = 1×");

  check(RODADA_HISTORICO_MIN === 1, "rodada mínima do histórico é 1");
  check(RODADA_HISTORICO_MAX === 18, "rodada máxima do histórico é 18");
  check(matchdayHistoricoValido(1) === true, "rodada 1 é válida (início do intervalo)");
  check(matchdayHistoricoValido(18) === true, "rodada 18 é válida (fim do intervalo)");
  check(matchdayHistoricoValido(0) === false, "rodada 0 é inválida");
  check(matchdayHistoricoValido(19) === false, "rodada 19 é inválida (é rodada atual, não histórico)");
  check(matchdayHistoricoValido(9.5) === false, "rodada não-inteira é inválida");
  check(matchdayHistoricoValido(null) === false, "rodada nula é inválida");
  check(matchdayHistoricoValido(undefined) === false, "rodada ausente é inválida");
  check(matchdayHistoricoValido("7") === true, "string numérica válida é aceita (vem de req.query)");
  check(matchdayHistoricoValido("abc") === false, "string não-numérica é inválida");
}

/* ---- calcularDetalhamento (Meu Perfil + Campeão do Bolão) ---- */
{
  // Ana (id 1): crava os 4 jogos encerrados → 100% de aproveitamento
  const dAna = calcularDetalhamento(1, estado, palpitesMap);
  check(dAna.jogosEncerrados.length === 4, `Ana: esperava 4 jogos encerrados, veio ${dAna.jogosEncerrados.length}`);
  check(dAna.acertosExatos === 4 && dAna.acertosResult === 0 && dAna.erros === 0,
    `Ana: esperava 4 exatos/0 resultado/0 erro, veio ${dAna.acertosExatos}/${dAna.acertosResult}/${dAna.erros}`);
  check(dAna.aproveitamento === 100, `Ana: aproveitamento deveria ser 100%, veio ${dAna.aproveitamento}%`);
  check(dAna.melhor?.jogo.id === 10 && dAna.pior?.jogo.id === 10,
    "Ana: com tudo empatado em 3pts, melhor/pior deve cair no primeiro jogo (id 10)");

  // Bruno (id 2): 1 exato + 3 resultados certos → 50% (6 de 12 possíveis)
  const dBruno = calcularDetalhamento(2, estado, palpitesMap);
  check(dBruno.acertosExatos === 1 && dBruno.acertosResult === 3 && dBruno.erros === 0,
    `Bruno: esperava 1 exato/3 resultado/0 erro, veio ${dBruno.acertosExatos}/${dBruno.acertosResult}/${dBruno.erros}`);
  check(dBruno.aproveitamento === 50, `Bruno: aproveitamento deveria ser 50%, veio ${dBruno.aproveitamento}%`);
  check(dBruno.melhor?.jogo.id === 11, `Bruno: melhor jogo deveria ser o 11 (único exato), veio ${dBruno.melhor?.jogo.id}`);

  // Duda (id 4): sem palpite no jogo 11 — não pode contar como erro nem entrar no máximo possível
  const dDuda = calcularDetalhamento(4, estado, palpitesMap);
  check(dDuda.apostasFeitas === 3, `Duda: esperava 3 apostas (jogo 11 sem palpite), veio ${dDuda.apostasFeitas}`);
  check(dDuda.erros === 1, `Duda: só o jogo 10 (errado, mas COM palpite) deveria contar como erro, veio ${dDuda.erros}`);
  check(dDuda.maxPossivel === 9, `Duda: máximo possível deveria ignorar o jogo sem palpite (3 jogos × 3 = 9), veio ${dDuda.maxPossivel}`);
  check(dDuda.aproveitamento === 67, `Duda: aproveitamento deveria ser 67% (6/9), veio ${dDuda.aproveitamento}%`);

  // detalhamento (sem bônus) tem que bater com ranking.pontos - ranking.bonus, p/ qualquer participante
  for (const p of novo) {
    const d = calcularDetalhamento(p.id, estado, palpitesMap);
    check(d.totalPtsJogos === p.pontos - p.bonus,
      `${p.nome}: detalhamento.totalPtsJogos (${d.totalPtsJogos}) != ranking.pontos-bonus (${p.pontos - p.bonus})`);
  }
}

/* ---- calcularEvolucao (gráfico de trajetória do Campeão do Bolão) ---- */
{
  const evoAna = calcularEvolucao(1, estado, palpitesMap);
  // ordem cronológica por kickoff: 10 (dia 14) → 11 (dia 15) → 14 (dia 16, 15h) → 12 (dia 16, 18h)
  check(evoAna.map((e) => e.jogo.id).join(",") === "10,11,14,12",
    `Ana: ordem cronológica errada — veio ${evoAna.map((e) => e.jogo.id).join(",")}`);
  check(evoAna.every((e, i) => i === 0 || e.acumulado >= evoAna[i - 1].acumulado),
    "Ana: acumulado da evolução nunca pode cair");
  const totalAna = calcularDetalhamento(1, estado, palpitesMap).totalPtsJogos;
  check(evoAna[evoAna.length - 1].acumulado === totalAna,
    `Ana: último ponto da evolução (${evoAna[evoAna.length - 1].acumulado}) deveria bater com o total do detalhamento (${totalAna})`);
}

/* ---- "campeões do bolão" (App.jsx): topo do ranking, incluindo empates reais ---- */
{
  const campeoes = novo.filter((p) => compararRanking(p, novo[0], antecedenciaMap) === 0);
  check(campeoes.length === 1, `cenário sem empate real no topo deveria dar 1 campeão só, veio ${campeoes.length}`);
  check(campeoes[0].id === novo[0].id, "campeão deveria ser o próprio líder do ranking (auto-comparação = 0)");
}

/* ---- corte de início do ranking (RODADA_INICIO_RANKING = 20): rodada 19
   é treino, dá pra palpitar mas não conta ponto — decisão de produto
   2026-07-17, ver comentário em ranking.js */
{
  check(contaParaRanking({ rodada: 19 }) === false, "rodada 19 não deveria contar pro ranking (é treino)");
  check(contaParaRanking({ rodada: 20 }) === true, "rodada 20 deveria contar pro ranking");
  check(contaParaRanking({ rodada: 25 }) === true, "rodada depois do início (25) deveria contar");
  check(contaParaRanking({ rodada: null }) === true, "jogo sem rodada deveria contar (default permissivo)");
  check(contaParaRanking({ rodada: undefined }) === true, "jogo sem campo rodada deveria contar (default permissivo)");

  const p = { id: 1, nome: "Teste" };
  const jogosMistos = [
    { id: 901, rodada: 19, gh: 2, ga: 0 }, // treino — NÃO deveria contar
    { id: 902, rodada: 20, gh: 1, ga: 1 }, // conta de verdade
    { id: 903, rodada: null, gh: 3, ga: 3 }, // sem rodada — default permissivo, conta
  ];
  const palpitesMistos = {
    901: { 1: { h: 2, a: 0 } }, // exato na rodada 19 — não deveria contar
    902: { 1: { h: 1, a: 1 } }, // exato na rodada 20 — deveria contar
    903: { 1: { h: 3, a: 3 } }, // exato sem rodada — deveria contar
  };
  const stats = calcularStats(p, {}, palpitesMistos, { jogos: jogosMistos });
  check(stats.exatos === 2,
    `rodada 19 não deveria virar "exato" no ranking — esperado 2 exatos (rodada 20 + sem rodada), veio ${stats.exatos}`);
  check(stats.pontos === PTS_EXATO * 2,
    `pontos deveriam ignorar a rodada 19 — esperado ${PTS_EXATO * 2}, veio ${stats.pontos}`);
}

if (falhas === 0) console.log("✓ ranking.test.mjs — todos os cenários passaram (novo == antigo + alinhamento M4 + escala de peso)");
else { console.error(`\n✗ ${falhas} verificação(ões) falharam`); process.exit(1); }
