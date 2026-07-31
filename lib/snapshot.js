/* Snapshot compartilhado do bolão — a principal defesa contra estourar a cota
   de compute do Neon Free (100 CU-hours/mês por projeto).

   POR QUE ISSO EXISTE
   O Neon não cobra por query: cobra por TEMPO com o compute ligado, e qualquer
   query acorda o banco por no mínimo 5 minutos (scale-to-zero fixo no plano
   Free). Consequência: 20 pessoas abrindo o app em horários espalhados mantêm
   o banco acordado quase o dia inteiro, mesmo que ninguém fique olhando. Era
   isso — e não o volume de queries — que consumia a cota.

   COMO RESOLVE
   Tudo que /api/estado precisa cabe num único snapshot igual para todo mundo.
   Com ele no Runtime Cache da Vercel, uma leitura com cache quente custa ZERO
   query e o banco simplesmente não acorda. Só escrita (palpite, resultado,
   cron) toca o Postgres.

   PRIVACIDADE — LEIA ANTES DE MEXER
   O snapshot contém os TOKENS dos participantes (para autenticar sem ir ao
   banco) e TODOS os palpites, inclusive de jogos que ainda não começaram.
   Nada disso pode sair daqui cru: quem monta a resposta é montarEstado(), que
   aplica a regra anti-cópia. O snapshot vive só no cache privado da Vercel e
   na memória da function — nunca é serializado para o cliente. */

import { getCache } from "@vercel/functions";
import { sql } from "./db.js";

const CHAVE = "bolao:snapshot:v1";
const TAG = "bolao-estado";

/* Mesma janela de 4h usada no cliente (JANELA_VIVO em src/App.jsx): um jogo
   sem placar só conta como "em andamento" até 4h após o kickoff, senão um jogo
   órfão (adiado e nunca reportado) prenderia o TTL curto para sempre. */
const JANELA_VIVO = 4 * 60 * 60 * 1000;
const JANELA_PROXIMO = 2 * 60 * 60 * 1000;

/* Limite de item do Runtime Cache é 2 MB. No pior caso realista deste bolão
   (turno único, ~20 pessoas × 190 jogos) o snapshot fica bem abaixo disso,
   mas se algum dia passar é melhor degradar para consulta direta do que
   gravar pela metade. */
const TETO_BYTES = 1_800_000;

/* TTL por contexto. Escritas invalidam o snapshot explicitamente (ver
   invalidarSnapshot), então o TTL é só rede de segurança — por isso pode ser
   generoso quando não há jogo por perto. Fora de janela de jogo, 30 min deixa
   o banco realmente dormir entre um refresh e outro.
   Importante: a revelação dos palpites alheios no kickoff NÃO depende do TTL.
   Ela é calculada em JS a cada request sobre os palpites já cacheados, então
   acontece na hora certa mesmo com o snapshot velho. */
function ttlDoMomento(jogos, agoraMs) {
  let ttl = 1800;
  for (const j of jogos) {
    if (!j.kickoff) continue;
    const decorrido = agoraMs - new Date(j.kickoff).getTime();
    const semPlacarFinal = j.gh === null || j.ga === null || j.live;
    if (decorrido >= 0 && decorrido <= JANELA_VIVO && semPlacarFinal) return 30;
    if (decorrido < 0 && -decorrido <= JANELA_PROXIMO) ttl = Math.min(ttl, 120);
  }
  return ttl;
}

/* Lê tudo que o estado precisa. 8 queries em vez das 12 originais: contagens e
   antecedência média agora saem em JS a partir dos palpites (ver montarEstado),
   que já estão todos aqui. */
async function construirSnapshot() {
  const [participantes, jogos, palpites, palpitesCampeao, palpitesArtilheiro, resultadoEspecial, premiados, reacoes, config] =
    await Promise.all([
      sql`SELECT id, nome, token, is_admin, avatar_emoji, avatar_cor, pagou FROM participantes ORDER BY nome`,
      sql`SELECT id, casa, fora, kickoff, gh, ga, rodada, peso, live FROM jogos ORDER BY kickoff NULLS LAST, id`,
      sql`SELECT jogo_id, participante_id, h, a, atualizado_em FROM palpites`,
      sql`SELECT participante_id, selecao, confirmado FROM palpite_campeao`,
      sql`SELECT participante_id, jogador, confirmado FROM palpite_artilheiro ORDER BY participante_id`,
      sql`SELECT tipo, valor, confirmado FROM resultado_especial`,
      sql`SELECT participante_id FROM artilheiro_premiado`,
      sql`SELECT jogo_id, participante_id, emoji FROM reacoes`,
      sql`SELECT chave, valor FROM config WHERE chave IN ('artilheiro_gols', 'times_fora_disputa')`,
    ]);

  return { participantes, jogos, palpites, palpitesCampeao, palpitesArtilheiro, resultadoEspecial, premiados, reacoes, config };
}

/* Devolve o snapshot, do cache quando possível. Qualquer falha do cache cai
   para consulta direta: pior performance, nunca erro para o usuário. */
export async function lerSnapshot() {
  let cache = null;
  try {
    cache = getCache();
    const guardado = await cache.get(CHAVE);
    if (guardado) return guardado;
  } catch {
    /* cache indisponível (dev local, região fria) — segue para o banco */
  }

  const snap = await construirSnapshot();

  try {
    if (cache && JSON.stringify(snap).length <= TETO_BYTES) {
      await cache.set(CHAVE, snap, {
        ttl: ttlDoMomento(snap.jogos, Date.now()),
        tags: [TAG],
        name: "bolao-estado",
      });
    }
  } catch {
    /* não conseguiu gravar — o próximo request tenta de novo */
  }
  return snap;
}

/* Chamado por TODA rota que escreve no banco. Sem isso, uma alteração levaria
   até o TTL para aparecer. Nunca deixe uma escrita nova sem esta chamada. */
export async function invalidarSnapshot() {
  try {
    await getCache().expireTag(TAG);
  } catch {
    /* invalidação best-effort: o TTL ainda limita a defasagem */
  }
}

/* Resposta de sucesso de QUALQUER rota que escreveu no banco. Invalida antes
   de responder — nessa ordem — para que o carregar() que o cliente dispara
   logo em seguida já venha com dado novo. Use isto no lugar de
   res.status(200).json(...) sempre que a rota tiver escrito. */
export async function okEscrita(res, corpo = { ok: true }) {
  await invalidarSnapshot();
  res.status(200).json(corpo);
}

/* Autentica pelo snapshot, sem ir ao banco. Mesmo contrato do autenticar() de
   lib/db.js — inclusive o ADMIN_TOKEN de bootstrap, que precisa continuar
   funcionando quando ainda não existe nenhum participante cadastrado. */
export function autenticarNoSnapshot(snap, token) {
  if (!token || typeof token !== "string") return null;
  if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return { id: null, nome: "Organizador", isAdmin: true, master: true };
  }
  const p = snap.participantes.find((x) => x.token === token);
  if (!p) return null;
  return { id: p.id, nome: p.nome, isAdmin: p.is_admin, master: false };
}

/* Monta a resposta de /api/estado a partir do snapshot. É AQUI que mora a
   regra anti-cópia — o snapshot tem todos os palpites, e só saem daqui os que
   a pessoa pode ver. */
export function montarEstado(snap, eu, { prazoBonus, prazoPagamento }) {
  const agora = new Date();
  const agoraMs = agora.getTime();

  /* palpite dos OUTROS só aparece depois que o jogo começou ou já tem placar;
      os próprios sempre aparecem; admin vê tudo (precisa corrigir erros).
      Espelha o WHERE que antes rodava no Postgres — inclusive o critério de
      placar, que aqui é "gh e ga preenchidos" mesmo com live = true. */
  const jogoPorId = new Map(snap.jogos.map((j) => [j.id, j]));
  const palpites = snap.palpites
    .filter((p) => {
      if (eu.isAdmin) return true;
      if (p.participante_id === (eu.id ?? -1)) return true;
      const j = jogoPorId.get(p.jogo_id);
      if (!j) return false;
      if (j.kickoff && new Date(j.kickoff).getTime() <= agoraMs) return true;
      return j.gh !== null && j.ga !== null;
    })
    .map((p) => ({ jogo_id: p.jogo_id, participante_id: p.participante_id, h: p.h, a: p.a, atualizado_em: p.atualizado_em }));

  /* contagem de palpites por jogo — era GROUP BY no banco. Conta TODOS, não só
     os visíveis: é o "X já palpitaram" que aparece antes do jogo começar. */
  const totPorJogo = new Map();
  for (const p of snap.palpites) totPorJogo.set(p.jogo_id, (totPorJogo.get(p.jogo_id) || 0) + 1);
  const contagens = [...totPorJogo].map(([jogo_id, total]) => ({ jogo_id, total }));

  /* Antecedência média (5º critério de desempate): média de
     (kickoff - atualizado_em) em segundos, só sobre jogos com kickoff.
     Era AVG(EXTRACT(EPOCH FROM ...)) com JOIN no banco. */
  const acc = new Map();
  for (const p of snap.palpites) {
    const j = jogoPorId.get(p.jogo_id);
    if (!j || !j.kickoff) continue;
    const seg = (new Date(j.kickoff).getTime() - new Date(p.atualizado_em).getTime()) / 1000;
    const a = acc.get(p.participante_id) || { soma: 0, n: 0 };
    a.soma += seg;
    a.n += 1;
    acc.set(p.participante_id, a);
  }
  const antecedenciaMedia = [...acc].map(([participante_id, a]) => ({ participante_id, segundos: a.soma / a.n }));

  const cfg = {};
  for (const r of snap.config) {
    try { cfg[r.chave] = r.valor ? JSON.parse(r.valor) : null; } catch { cfg[r.chave] = null; }
  }

  const reMap = {};
  for (const r of snap.resultadoEspecial) reMap[r.tipo] = { valor: r.valor, confirmado: r.confirmado };

  return {
    eu: { id: eu.id, nome: eu.nome, isAdmin: eu.isAdmin },
    /* token NUNCA sai daqui */
    participantes: snap.participantes.map((p) => ({
      id: p.id, nome: p.nome,
      avatarEmoji: p.avatar_emoji, avatarCor: p.avatar_cor, pagou: p.pagou,
    })),
    jogos: snap.jogos,
    palpites,
    contagens,
    palpitesCampeao: snap.palpitesCampeao
      .filter((p) => p.confirmado)
      .map((p) => ({ participante_id: p.participante_id, selecao: p.selecao })),
    /* admin vê inclusive os não confirmados (precisa conferir antes do prazo) */
    palpitesArtilheiro: snap.palpitesArtilheiro
      .filter((p) => eu.isAdmin || p.confirmado)
      .map((p) => ({ participante_id: p.participante_id, jogador: p.jogador })),
    reacoes: snap.reacoes,
    premiadosArtilheiro: snap.premiados.map((r) => r.participante_id),
    antecedenciaMedia,
    resultadoEspecial: { campeao: reMap.campeao || null, artilheiro: reMap.artilheiro || null },
    artilheiroGols: cfg.artilheiro_gols && typeof cfg.artilheiro_gols === "object" ? cfg.artilheiro_gols : {},
    timesForaDaDisputa: Array.isArray(cfg.times_fora_disputa) ? cfg.times_fora_disputa : [],
    prazoBonus: new Date(prazoBonus).toISOString(),
    prazoPagamento: new Date(prazoPagamento).toISOString(),
    agora: agora.toISOString(),
  };
}
