/* Testes de montarEstado/autenticarNoSnapshot.

   Estes testes existem porque /api/estado deixou de perguntar ao Postgres e
   passou a montar a resposta em JS a partir do snapshot (ver lib/snapshot.js).
   Toda regra que antes era um WHERE ou um GROUP BY agora é código — e regra que
   virou código pode regredir em silêncio. O que se protege aqui:
     1. a regra anti-cópia (palpite alheio de jogo não iniciado NÃO pode vazar);
     2. os tokens de acesso NÃO podem sair na resposta;
     3. contagens e antecedência média batem com o que o SQL calculava.
   Rodam sem banco: o snapshot é montado à mão. */

process.env.DATABASE_URL ||= "postgres://u:p@h.neon.tech/db";
process.env.ADMIN_TOKEN = "MESTRE";

const { montarEstado, autenticarNoSnapshot } = await import("./snapshot.js");

let ok = 0;
let falhou = 0;
function checa(nome, condicao, detalhe = "") {
  if (condicao) { ok++; console.log(`✓ ${nome}`); }
  else { falhou++; console.log(`✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const AGORA = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const H = 3600e3;

/* Cenário: 3 participantes. J1 já começou, J2 começa daqui a 5h,
   J3 tem placar final. Todos os três palpitaram em tudo. */
const snap = {
  participantes: [
    { id: 1, nome: "Ana",   token: "tkA", is_admin: false, avatar_emoji: "🐯", avatar_cor: "#f00", pagou: true },
    { id: 2, nome: "Bruno", token: "tkB", is_admin: false, avatar_emoji: null,  avatar_cor: "#0f0", pagou: false },
    { id: 3, nome: "Chefe", token: "tkC", is_admin: true,  avatar_emoji: "👑", avatar_cor: "#00f", pagou: true },
  ],
  jogos: [
    { id: 1, casa: "Flamengo", fora: "Vasco",   kickoff: iso(AGORA - 1 * H), gh: null, ga: null, rodada: 20, peso: 1, live: false },
    { id: 2, casa: "Palmeiras", fora: "Santos", kickoff: iso(AGORA + 5 * H), gh: null, ga: null, rodada: 20, peso: 1, live: false },
    { id: 3, casa: "Grêmio",  fora: "Inter",    kickoff: iso(AGORA - 30 * H), gh: 2, ga: 1, rodada: 19, peso: 1, live: false },
  ],
  palpites: [
    /* J1 (começou): 2h de antecedência pra Ana */
    { jogo_id: 1, participante_id: 1, h: 2, a: 0, atualizado_em: iso(AGORA - 3 * H) },
    { jogo_id: 1, participante_id: 2, h: 1, a: 1, atualizado_em: iso(AGORA - 2 * H) },
    /* J2 (NÃO começou) — o palpite do outro não pode vazar */
    { jogo_id: 2, participante_id: 1, h: 3, a: 0, atualizado_em: iso(AGORA - 1 * H) },
    { jogo_id: 2, participante_id: 2, h: 0, a: 2, atualizado_em: iso(AGORA - 1 * H) },
    /* J3 (tem placar) */
    { jogo_id: 3, participante_id: 1, h: 2, a: 1, atualizado_em: iso(AGORA - 36 * H) },
  ],
  palpitesCampeao: [
    { participante_id: 1, selecao: "Flamengo", confirmado: true },
    { participante_id: 2, selecao: "Palmeiras", confirmado: false },
  ],
  palpitesArtilheiro: [
    { participante_id: 1, jogador: "Pedro", confirmado: true },
    { participante_id: 2, jogador: "Cano",  confirmado: false },
  ],
  resultadoEspecial: [{ tipo: "campeao", valor: "Flamengo", confirmado: false }],
  premiados: [{ participante_id: 1 }],
  reacoes: [{ jogo_id: 1, participante_id: 2, emoji: "🔥" }],
  config: [
    { chave: "artilheiro_gols", valor: JSON.stringify({ Pedro: 12 }) },
    { chave: "times_fora_disputa", valor: JSON.stringify(["Santos"]) },
  ],
};

const prazos = { prazoBonus: AGORA + 10 * H, prazoPagamento: AGORA + 20 * H };
const comoAna = montarEstado(snap, autenticarNoSnapshot(snap, "tkA"), prazos);
const comoAdmin = montarEstado(snap, autenticarNoSnapshot(snap, "tkC"), prazos);

/* ── 1. autenticação sem banco ── */
checa("token válido resolve participante", autenticarNoSnapshot(snap, "tkB")?.nome === "Bruno");
checa("token inválido é rejeitado", autenticarNoSnapshot(snap, "naoexiste") === null);
checa("token vazio/nulo é rejeitado", autenticarNoSnapshot(snap, "") === null && autenticarNoSnapshot(snap, null) === null);
checa("is_admin propaga", autenticarNoSnapshot(snap, "tkC")?.isAdmin === true);
checa("ADMIN_TOKEN de bootstrap funciona", autenticarNoSnapshot(snap, "MESTRE")?.master === true);

/* ── 2. REGRA ANTI-CÓPIA (a mais importante) ── */
const alheioNaoIniciado = comoAna.palpites.filter((p) => p.jogo_id === 2 && p.participante_id !== 1);
checa("palpite ALHEIO de jogo não iniciado NÃO vaza", alheioNaoIniciado.length === 0,
  `vazaram ${alheioNaoIniciado.length}`);
checa("palpite PRÓPRIO de jogo não iniciado aparece",
  comoAna.palpites.some((p) => p.jogo_id === 2 && p.participante_id === 1 && p.h === 3));
checa("palpite alheio de jogo JÁ INICIADO aparece",
  comoAna.palpites.some((p) => p.jogo_id === 1 && p.participante_id === 2));
checa("palpite alheio de jogo COM PLACAR aparece (via J3)",
  montarEstado(snap, autenticarNoSnapshot(snap, "tkB"), prazos)
    .palpites.some((p) => p.jogo_id === 3 && p.participante_id === 1));
checa("admin vê TODOS os palpites", comoAdmin.palpites.length === snap.palpites.length,
  `viu ${comoAdmin.palpites.length} de ${snap.palpites.length}`);

/* ── 3. TOKENS NUNCA SAEM ── */
const serial = JSON.stringify(comoAna) + JSON.stringify(comoAdmin);
checa("nenhum token aparece na resposta", !/tkA|tkB|tkC|MESTRE/.test(serial));
checa("participantes não expõem campo token", comoAna.participantes.every((p) => !("token" in p)));

/* ── 4. contagens: conta TODOS, inclusive os que a pessoa não pode ver ── */
const cont = Object.fromEntries(comoAna.contagens.map((c) => [c.jogo_id, c.total]));
checa("contagem J1 = 2", cont[1] === 2, `deu ${cont[1]}`);
checa("contagem J2 = 2 mesmo sem poder ver os palpites", cont[2] === 2, `deu ${cont[2]}`);
checa("contagem J3 = 1", cont[3] === 1, `deu ${cont[3]}`);

/* ── 5. antecedência média: AVG(kickoff - atualizado_em) em segundos ──
   Ana: J1 = 2h, J2 = 6h, J3 = 6h → média 14h/3 = 4h40min = 16800s
   Bruno: J1 = 1h, J2 = 6h        → média 7h/2  = 3h30min = 12600s */
const ant = Object.fromEntries(comoAna.antecedenciaMedia.map((a) => [a.participante_id, a.segundos]));
checa("antecedência da Ana = 16800s", Math.round(ant[1]) === 16800, `deu ${Math.round(ant[1])}`);
checa("antecedência do Bruno = 12600s", Math.round(ant[2]) === 12600, `deu ${Math.round(ant[2])}`);
checa("quem não palpitou não entra na lista", !(3 in ant));

/* ── 6. confirmação de campeão/artilheiro ── */
checa("campeão só sai se confirmado", comoAna.palpitesCampeao.length === 1 && comoAna.palpitesCampeao[0].participante_id === 1);
checa("artilheiro não confirmado fica oculto pro participante", comoAna.palpitesArtilheiro.length === 1);
checa("admin vê artilheiro não confirmado", comoAdmin.palpitesArtilheiro.length === 2);

/* ── 7. campos derivados e formato ── */
checa("artilheiroGols vem parseado", comoAna.artilheiroGols.Pedro === 12);
checa("timesForaDaDisputa vem parseado", Array.isArray(comoAna.timesForaDaDisputa) && comoAna.timesForaDaDisputa[0] === "Santos");
checa("resultadoEspecial.campeao preenchido", comoAna.resultadoEspecial.campeao?.valor === "Flamengo");
checa("resultadoEspecial.artilheiro ausente vira null", comoAna.resultadoEspecial.artilheiro === null);
checa("premiadosArtilheiro é lista de ids", comoAna.premiadosArtilheiro.length === 1 && comoAna.premiadosArtilheiro[0] === 1);
checa("eu.{id,nome,isAdmin} preenchido", comoAna.eu.id === 1 && comoAna.eu.nome === "Ana" && comoAna.eu.isAdmin === false);
checa("agora/prazos em ISO", !Number.isNaN(Date.parse(comoAna.agora)) && !Number.isNaN(Date.parse(comoAna.prazoBonus)));
checa("participantes mantêm avatarEmoji/avatarCor/pagou",
  comoAna.participantes[0].avatarEmoji === "🐯" && comoAna.participantes[0].avatarCor === "#f00" && comoAna.participantes[0].pagou === true);

/* ── 8. jogos ADIADOS e CANCELADOS (migration V09) ──
   Adiado continua existindo (vai valer quando remarcarem); cancelado some
   pra todo mundo, inclusive admin. */
const snapStatus = {
  ...snap,
  jogos: [
    ...snap.jogos,
    { id: 4, casa: "Bahia", fora: "Vitória", kickoff: null, gh: null, ga: null, rodada: 21, peso: 1, live: false, status: "POSTPONED" },
    { id: 5, casa: "Cruzeiro", fora: "Atlético-MG", kickoff: null, gh: null, ga: null, rodada: 21, peso: 1, live: false, status: "CANCELLED" },
  ],
  palpites: [
    ...snap.palpites,
    { jogo_id: 4, participante_id: 1, h: 1, a: 1, atualizado_em: iso(AGORA - 5 * H) },
    { jogo_id: 5, participante_id: 1, h: 3, a: 3, atualizado_em: iso(AGORA - 5 * H) },
  ],
};
const stAna = montarEstado(snapStatus, autenticarNoSnapshot(snap, "tkA"), prazos);
const stAdmin = montarEstado(snapStatus, autenticarNoSnapshot(snap, "tkC"), prazos);

checa("jogo ADIADO continua na lista", stAna.jogos.some((j) => j.id === 4));
checa("jogo CANCELADO some pro participante", !stAna.jogos.some((j) => j.id === 5));
checa("jogo CANCELADO some tambem pro ADMIN", !stAdmin.jogos.some((j) => j.id === 5));
checa("palpite de jogo cancelado nao vaza pro participante", !stAna.palpites.some((p) => p.jogo_id === 5));
checa("palpite de jogo cancelado nao vaza nem pro admin", !stAdmin.palpites.some((p) => p.jogo_id === 5),
  "palpite orfao apontaria pra um jogo que a tela nao recebeu");
checa("palpite proprio em jogo adiado continua visivel", stAna.palpites.some((p) => p.jogo_id === 4));
checa("contagem NAO conta jogo cancelado", !stAna.contagens.some((c) => c.jogo_id === 5));
checa("status do jogo chega no cliente", stAna.jogos.find((j) => j.id === 4)?.status === "POSTPONED");
/* adiado tem kickoff nulo, então não entra na antecedência — é justamente o
   que impede o palpite antigo de virar antecedência gigante na remarcação */
const antSt = Object.fromEntries(stAna.antecedenciaMedia.map((a) => [a.participante_id, a.segundos]));
checa("palpite em jogo adiado nao distorce a antecedencia", Math.round(antSt[1]) === 16800,
  `deu ${Math.round(antSt[1])}, esperado 16800 (os 3 jogos com data)`);

/* ── 9. classificação de status (contrato com a football-data) ──
   Documenta o que cada status da API significa pro bolão. Se a football-data
   mudar de vocabulário, é aqui que quebra primeiro. */
const { jogoAdiado, jogoCancelado } = await import("./clubes.js");
const esperado = {
  SCHEDULED: "normal", TIMED: "normal", IN_PLAY: "normal", PAUSED: "normal",
  FINISHED: "normal", AWARDED: "normal",
  POSTPONED: "adiado", SUSPENDED: "adiado",
  CANCELLED: "cancelado",
};
for (const [status, quero] of Object.entries(esperado)) {
  const m = { status };
  const tenho = jogoCancelado(m) ? "cancelado" : jogoAdiado(m) ? "adiado" : "normal";
  checa(`status ${status} → ${quero}`, tenho === quero, `deu ${tenho}`);
}
/* status ausente = jogo cadastrado à mão pelo admin ou linha anterior à V09;
   tem que valer normalmente, senão a migration esconderia o histórico todo */
checa("status NULL conta como jogo normal", !jogoAdiado({ status: null }) && !jogoCancelado({ status: null }));
checa("jogo sem campo status nao quebra", !jogoAdiado({}) && !jogoCancelado({}) && !jogoAdiado(undefined));

/* ── 10. config ausente/corrompida não derruba a rota ── */
const vazio = montarEstado({ ...snap, config: [{ chave: "artilheiro_gols", valor: "{lixo" }] },
  autenticarNoSnapshot(snap, "tkA"), prazos);
checa("JSON corrompido no config vira objeto vazio, sem lançar",
  typeof vazio.artilheiroGols === "object" && Object.keys(vazio.artilheiroGols).length === 0);

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
