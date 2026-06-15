import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   BOLÃO DA COPA 2026 — versão compartilhada (Vercel + Neon)
   Cada amigo acessa pelo seu link com token (?t=...).
   Regras: placar exato = 3 pts | resultado certo = 1 pt
   Travamento de palpites validado NO SERVIDOR.
   ============================================================ */

const PTS_EXATO = 3;
const PTS_RESULTADO = 1;

function criterioDesempate(a, b) {
  if (a.pontos !== b.pontos) return null;
  if (a.exatos !== b.exatos) return { icon: "🎯", label: "mais exatos" };
  if (!!a.acertouCampeao !== !!b.acertouCampeao) return { icon: "🏆", label: "acertou a campeã" };
  if (!!a.acertouArtilheiro !== !!b.acertouArtilheiro) return { icon: "⚽", label: "acertou o artilheiro" };
  if (a.resultados !== b.resultados) return { icon: "✅", label: "mais resultados" };
  return { icon: "⏱", label: "palpitou antes" };
}

const reduzMovimento = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function pontosDoPalpite(palpite, jogo) {
  if (!palpite || jogo.gh === null || jogo.ga === null || jogo.live) return null;
  const ph = Number(palpite.h), pa = Number(palpite.a);
  if (Number.isNaN(ph) || Number.isNaN(pa)) return null;
  if (ph === jogo.gh && pa === jogo.ga) return PTS_EXATO;
  const sinal = (x, y) => (x > y ? 1 : x < y ? -1 : 0);
  if (sinal(ph, pa) === sinal(jogo.gh, jogo.ga)) return PTS_RESULTADO;
  return 0;
}

const temResultado = (m) => m.gh !== null && m.ga !== null && !m.live;

function fmtQuando(m) {
  if (!m.kickoff) return "";
  const d = new Date(m.kickoff);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* kickoff (ISO do banco) -> valor de input datetime-local */
function kickoffParaInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function api(caminho, opts = {}) {
  const r = await fetch(caminho, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.error || "Erro " + r.status);
  return corpo;
}

function lerToken() {
  try {
    const t = new URLSearchParams(window.location.search).get("t");
    if (t) {
      localStorage.setItem("bolao_token", t);
      return t;
    }
    return localStorage.getItem("bolao_token") || "";
  } catch {
    return "";
  }
}

/* Contagem animada (placar de estádio subindo) */
function useCountUp(valor, dur = 800) {
  const [v, setV] = useState(valor);
  const prev = useRef(valor);
  useEffect(() => {
    if (reduzMovimento()) { prev.current = valor; setV(valor); return; }
    const de = prev.current, para = valor;
    if (de === para) return;
    prev.current = para;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(de + (para - de) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valor, dur]);
  return v;
}

export default function App() {
  const [token] = useState(lerToken);
  const [estado, setEstado] = useState(() => {
    try { const c = localStorage.getItem(`bolao-${lerToken()}`); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [erroAuth, setErroAuth] = useState("");
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem("bolao-tab") || "ranking"; } catch { return "ranking"; }
  });
  const [abrirPerfil, setAbrirPerfil] = useState(false);
  const [abrirRegras, setAbrirRegras] = useState(false);
  const [abrirPagamento, setAbrirPagamento] = useState(false);
  const [participanteModal, setParticipanteModal] = useState(null);
  const [proximoFechado, setProximoFechado] = useState(false);
  const [jogoPreSel, setJogoPreSel] = useState(null);
  const offsetRef = useRef(0);
  const rankingJaAbriu = useRef(false);
  const pagamentoVerificado = useRef(false);
  const [, setTick] = useState(0);
  const [installPrompt, setInstallPrompt] = useState(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      const e = await api(`/api/estado?t=${encodeURIComponent(token)}`);
      offsetRef.current = Date.parse(e.agora) - Date.now();
      setEstado(e);
      try { localStorage.setItem(`bolao-${token}`, JSON.stringify(e)); } catch { /* storage cheio */ }
      setErroAuth("");
    } catch (err) {
      if (!estado) setErroAuth(err.message);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvarAvatar = useCallback(async (emoji, cor) => {
    await api("/api/participante", {
      method: "PATCH",
      body: JSON.stringify({ t: token, emoji, cor }),
    });
    await carregar();
  }, [token, carregar]);

  /* abre popup de pagamento na primeira carga, uma vez por sessão */
  useEffect(() => {
    if (!estado || pagamentoVerificado.current) return;
    pagamentoVerificado.current = true;
    const euP = estado.participantes.find((p) => p.id === estado.eu.id);
    if (euP && !euP.pagou && !estado.eu.isAdmin) setAbrirPagamento(true);
  }, [estado]);

  /* registra service worker uma vez */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  /* captura prompt de instalação do PWA (Android/Chrome) */
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  /* carga inicial + polling 30s + refetch ao voltar pra aba */
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!token) return;
    const poll = setInterval(carregar, 30000);
    const tick = setInterval(() => setTick((n) => n + 1), 30000);
    const onFoco = () => document.visibilityState === "visible" && carregar();
    document.addEventListener("visibilitychange", onFoco);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onFoco);
    };
  }, [token, carregar]);

  /* polling de placar ao vivo: 60s quando há jogo em andamento */
  const temJogoVivo = !!estado && estado.jogos.some(
    (m) => m.kickoff && !temResultado(m) && new Date(m.kickoff) <= new Date(Date.now() + offsetRef.current)
  );
  useEffect(() => {
    if (!token || !temJogoVivo) return;
    const buscar = () =>
      api(`/api/futebol?t=${encodeURIComponent(token)}&acao=placar-vivo`)
        .then(carregar)
        .catch(() => {});
    buscar();
    const id = setInterval(buscar, 60000);
    return () => clearInterval(id);
  }, [token, temJogoVivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const irParaPalpites = useCallback((jogoId) => {
    setJogoPreSel(jogoId);
    setTab("palpites");
  }, []);

  /* hora do SERVIDOR (relógio do celular do amigo não manda aqui) */
  const agoraServ = () => new Date(Date.now() + offsetRef.current);
  const comecou = (m) => !!m.kickoff && new Date(m.kickoff) <= agoraServ();

  if (!token)
    return (
      <Casca>
        <div className="vazio entra-1">
          <span className="bola-quica" aria-hidden="true">⚽</span>
          <span>Este bolão é por convite — peça seu link de acesso ao organizador do grupo.</span>
        </div>
      </Casca>
    );

  if (erroAuth && !estado)
    return (
      <Casca>
        <div className="vazio entra-1">
          <span className="bola-quica" aria-hidden="true">⚽</span>
          <span>{erroAuth}</span>
        </div>
      </Casca>
    );

  if (!estado)
    return (
      <Casca>
        <div className="carregando"><span className="bola-quica">⚽</span> Abrindo o bolão…</div>
      </Casca>
    );

  /* mapa de palpites: jogoId -> participanteId -> {h, a} */
  const palpitesMap = {};
  for (const p of estado.palpites) {
    (palpitesMap[p.jogo_id] ||= {})[p.participante_id] = { h: p.h, a: p.a };
  }
  const contagensMap = {};
  for (const c of estado.contagens) contagensMap[c.jogo_id] = c.total;

  const hojeKey = fmtSP(Date.now() + offsetRef.current);

  const primeiroPalpiteMap = {};
  for (const r of estado.primeiroPalpites || []) primeiroPalpiteMap[r.participante_id] = r.ts;

  const ranking = estado.participantes
    .map((p) => {
      let bonus = 0;
      const re = estado.resultadoEspecial;
      const acertouCampeao = !!(re?.campeao?.confirmado && (estado.palpitesCampeao || []).some(
        (pc) => pc.participante_id === p.id && pc.selecao === re.campeao.valor
      ));
      if (acertouCampeao) bonus += 9;
      const acertouArtilheiro = !!(re?.artilheiro?.confirmado && (estado.premiadosArtilheiro || []).includes(p.id));
      if (acertouArtilheiro) bonus += 6;
      let pontos = bonus, exatos = 0, resultados = 0, exatosHoje = 0;
      for (const m of estado.jogos) {
        const pts = pontosDoPalpite(palpitesMap[m.id]?.[p.id], m);
        if (pts === PTS_EXATO) {
          exatos++; pontos += pts;
          if (m.kickoff && chaveData(m.kickoff) === hojeKey) exatosHoje++;
        } else if (pts === PTS_RESULTADO) { resultados++; pontos += pts; }
      }
      return { ...p, pontos, exatos, resultados, bonus, exatosHoje, acertouCampeao, acertouArtilheiro };
    })
    .sort((a, b) =>
      b.pontos - a.pontos ||
      b.exatos - a.exatos ||
      (b.acertouCampeao ? 1 : 0) - (a.acertouCampeao ? 1 : 0) ||
      (b.acertouArtilheiro ? 1 : 0) - (a.acertouArtilheiro ? 1 : 0) ||
      b.resultados - a.resultados ||
      (primeiroPalpiteMap[a.id] && primeiroPalpiteMap[b.id]
        ? new Date(primeiroPalpiteMap[a.id]) - new Date(primeiroPalpiteMap[b.id])
        : 0)
    );

  /* posições antes dos jogos de hoje — para setas de tendência */
  const posAntes = {};
  const temJogoEncerradoHoje = estado.jogos.some(
    (m) => temResultado(m) && m.kickoff && chaveData(m.kickoff) === hojeKey
  );
  if (temJogoEncerradoHoje) {
    const re = estado.resultadoEspecial;
    const antesLista = estado.participantes.map((p) => {
      let bonus = 0;
      if (re?.campeao?.confirmado) {
        const ok = (estado.palpitesCampeao || []).some(
          (pc) => pc.participante_id === p.id && pc.selecao === re.campeao.valor
        );
        if (ok) bonus += 9;
      }
      if (re?.artilheiro?.confirmado) {
        if ((estado.premiadosArtilheiro || []).includes(p.id)) bonus += 6;
      }
      let pontos = bonus, exatos = 0;
      for (const m of estado.jogos) {
        if (m.kickoff && chaveData(m.kickoff) === hojeKey) continue;
        const pts = pontosDoPalpite(palpitesMap[m.id]?.[p.id], m);
        if (pts === PTS_EXATO) { exatos++; pontos += pts; }
        else if (pts === PTS_RESULTADO) { pontos += pts; }
      }
      return { id: p.id, nome: p.nome, pontos, exatos };
    }).sort((a, b) => b.pontos - a.pontos || b.exatos - a.exatos || a.nome.localeCompare(b.nome));
    antesLista.forEach((p, i) => { posAntes[p.id] = i; });
  }

  const encerrados = estado.jogos.filter(temResultado).length;
  const ehAdmin = estado.eu.isAdmin;
  const euParticipante = estado.participantes.find((p) => p.id === estado.eu.id);

  return (
    <Casca>
      <header className="topo entra-1">
        <div className="topo-acoes">
          <button
            className="regras-btn"
            onClick={() => setAbrirRegras(true)}
            aria-label="Ver regras do bolão"
            title="Regras"
          >?</button>
          {estado.eu.id !== null && (
            <button
              className="avatar-header-btn"
              onClick={() => setAbrirPerfil((v) => !v)}
              title="Editar perfil"
              aria-label="Editar avatar"
            >
              <Avatar
                nome={estado.eu.nome}
                emoji={euParticipante?.avatarEmoji}
                cor={euParticipante?.avatarCor}
                size={36}
              />
            </button>
          )}
        </div>
        <div className="topo-eyebrow">COPA DO MUNDO · 2026</div>
        <h1 className="topo-titulo">BOLÃO DOS GURIS</h1>
        <div className="topo-divider" aria-hidden="true" />
        <div className="topo-stats">
          <span>⚽ {estado.participantes.length} jogadores</span>
          <span className="topo-stats-sep" aria-hidden="true">·</span>
          <span>{encerrados} encerrado{encerrados === 1 ? "" : "s"}</span>
        </div>
      </header>

      {abrirRegras && <ModalRegras onFechar={() => setAbrirRegras(false)} />}
      {abrirPagamento && <ModalPagamento onFechar={() => setAbrirPagamento(false)} />}

      {abrirPerfil && estado.eu.id !== null && (
        <PerfilPicker
          nome={estado.eu.nome}
          emoji={euParticipante?.avatarEmoji || ""}
          cor={euParticipante?.avatarCor || ""}
          onSalvar={salvarAvatar}
          onFechar={() => setAbrirPerfil(false)}
        />
      )}

      {!proximoFechado && (
        <ProximoJogo
          jogos={estado.jogos}
          offsetMs={offsetRef.current}
          onFechar={() => setProximoFechado(true)}
          onNavegar={irParaPalpites}
        />
      )}

      {participanteModal && (
        <ModalPalpites
          participante={participanteModal}
          jogos={estado.jogos}
          palpitesMap={palpitesMap}
          euId={estado.eu.id}
          onFechar={() => setParticipanteModal(null)}
        />
      )}

      <nav className="abas entra-2" role="tablist">
        {[
          ["ranking", "Ranking"],
          ["jogos", "Jogos"],
          ["palpites", "Palpites"],
          ["campeao", "Campeão"],
          ["galera", "Galera"],
        ].map(([id, rotulo]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "aba ativa" : "aba"}
            onClick={() => { setTab(id); try { localStorage.setItem("bolao-tab", id); } catch {} }}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      <main key={tab} className="conteudo-aba">
        {tab === "ranking" && (
          <Ranking
            ranking={ranking}
            temJogos={encerrados > 0}
            primeiraVez={!rankingJaAbriu.current}
            aoAbrir={() => { rankingJaAbriu.current = true; }}
            posAntes={posAntes}
            onClickParticipante={setParticipanteModal}
            palpitesMap={palpitesMap}
            jogos={estado.jogos}
          />
        )}
        {tab === "jogos" && (
          <Jogos
            estado={estado}
            palpitesMap={palpitesMap}
            contagensMap={contagensMap}
            comecou={comecou}
            ehAdmin={ehAdmin}
            token={token}
            recarregar={carregar}
            offsetMs={offsetRef.current}
          />
        )}
        {tab === "palpites" && (
          <Palpites
            estado={estado}
            palpitesMap={palpitesMap}
            comecou={comecou}
            token={token}
            recarregar={carregar}
            offsetMs={offsetRef.current}
            jogoInicial={jogoPreSel}
          />
        )}
        {tab === "campeao" && (
          <Campeao token={token} euId={estado.eu.id} />
        )}
        {tab === "galera" && (
          <Galera estado={estado} ehAdmin={ehAdmin} token={token} recarregar={carregar} installPrompt={installPrompt} onInstalled={() => setInstallPrompt(null)} />
        )}
      </main>

      <footer className="rodape entra-3">
        <span className="ponto-salvo" aria-hidden="true"></span>
        Placar compartilhado · atualiza sozinho
      </footer>
    </Casca>
  );
}

function Casca({ children }) {
  return (
    <div className="bolao-root">
      <Estilo />
      {children}
    </div>
  );
}

/* ================= RANKING ================= */
function LedPontos({ valor }) {
  const v = useCountUp(valor);
  return <span className="col-pts led">{v}</span>;
}

function Ranking({ ranking, temJogos, primeiraVez, aoAbrir, posAntes, onClickParticipante, palpitesMap, jogos }) {
  useEffect(() => { aoAbrir(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (ranking.length === 0)
    return <Vazio texto="O organizador ainda não cadastrou os participantes." />;
  return (
    <div>
      {!temJogos && (
        <p className="dica">Nenhum jogo encerrado ainda — o placar acende quando entrar o primeiro resultado.</p>
      )}
      <div className="placar">
        <div className="placar-cab">
          <span className="col-pos">#</span>
          <span className="col-nome">PARTICIPANTE</span>
          <span className="col-num col-num-hd" title="Placares exatos">🎯<br/>EXATOS</span>
          <span className="col-num col-num-hd" title="Resultados certos">✓<br/>RESULT.</span>
          <span className="col-pts">PTS</span>
        </div>
        {ranking.map((p, i) => {
          const podio = p.pontos > 0 && i < 3;
          const cls = "placar-linha"
            + (podio && i === 0 ? " podio-ouro" : "")
            + (podio && i === 1 ? " podio-prata" : "")
            + (podio && i === 2 ? " podio-bronze" : "");
          const medalha = podio ? ["🥇", "🥈", "🥉"][i] : i + 1;
          return (
          <div
            key={p.id}
            className={cls}
            style={{ "--i": Math.min(i, 10), position: "relative", overflow: "visible", cursor: "pointer" }}
            onClick={() => onClickParticipante(p)}
            title={`Ver palpites de ${p.nome}`}
          >
            {p.exatosHoje > 0 && primeiraVez && (
              <span
                className="gol-burst"
                style={{ animationDelay: `${0.25 + i * 0.12}s` }}
                aria-hidden="true"
              >
                ⚽ GOOOL!
              </span>
            )}
            <span className={"col-pos" + (podio ? " col-pos-medal" : "")}>{medalha}</span>
            <span className="col-nome">
              <span className="col-nome-inner">
                <Avatar nome={p.nome} emoji={p.avatarEmoji} cor={p.avatarCor} size={24} />
                <span>{p.nome}{i === 0 && p.pontos > 0 ? " 🏆" : ""}</span>
                {p.bonus > 0 && <span className="bonus-badge" title={`bônus: +${p.bonus} pts`}>+{p.bonus}</span>}
                {posAntes[p.id] !== undefined && posAntes[p.id] > i && (
                  <span className="trend-up">↑{posAntes[p.id] - i}</span>
                )}
                {posAntes[p.id] !== undefined && posAntes[p.id] < i && (
                  <span className="trend-down">↓{i - posAntes[p.id]}</span>
                )}
                {(() => {
                  const prox = ranking[i + 1];
                  if (!prox) return null;
                  const c = criterioDesempate(p, prox);
                  if (!c) return null;
                  return (
                    <span className="desempate-badge" title={`Desempatado por: ${c.label}`}>
                      {c.icon} {c.label}
                    </span>
                  );
                })()}
              </span>
              <span className="col-detalhe-mobile">🎯 {p.exatos} exatos · ✓ {p.resultados} result.</span>
            </span>
            <span className="col-num">{p.exatos}</span>
            <span className="col-num">{p.resultados}</span>
            <LedPontos valor={p.pontos} />
          </div>
          );
        })}
      </div>
      <GraficoEvolucao ranking={ranking} palpitesMap={palpitesMap} jogos={jogos} />
      <EstatisticasInutils ranking={ranking} palpitesMap={palpitesMap} jogos={jogos} />
    </div>
  );
}

/* ================= GRÁFICO DE EVOLUÇÃO ================= */
function GraficoEvolucao({ ranking, palpitesMap, jogos }) {
  const [aberto, setAberto] = useState(false);

  const jogosEncerrados = jogos
    .filter(temResultado)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  if (jogosEncerrados.length < 2 || ranking.length < 2) return null;

  const W = 560, H = 210;
  const ml = 28, mr = 76, mt = 12, mb = 22;
  const pw = W - ml - mr;
  const ph = H - mt - mb;
  const n = jogosEncerrados.length;

  const xOf = (i) => ml + (n === 1 ? pw / 2 : (i * pw) / (n - 1));

  const series = ranking.map((p) => {
    let acum = p.bonus;
    const pts = jogosEncerrados.map((j) => {
      acum += pontosDoPalpite(palpitesMap[j.id]?.[p.id], j);
      return acum;
    });
    return { ...p, pts };
  });

  const maxPts = Math.max(...series.flatMap((s) => s.pts), 1);
  const yOf = (v) => mt + ph - (v / maxPts) * ph;

  const CORES = ["#ffc53d","#4ade80","#60a5fa","#f472b6","#a78bfa","#fb923c","#34d399","#e879f9","#facc15","#94a3b8"];

  return (
    <div className="grafico-bloco">
      <button className="grafico-toggle" onClick={() => setAberto((v) => !v)}>
        📈 Evolução do ranking <span className="grafico-chevron">{aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", marginTop: 8 }}>
          {/* grade */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={ml} y1={mt + ph * (1 - f)} x2={ml + pw} y2={mt + ph * (1 - f)}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4,4" />
          ))}
          {/* eixos */}
          <line x1={ml} y1={mt} x2={ml} y2={mt + ph} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          <line x1={ml} y1={mt + ph} x2={ml + pw} y2={mt + ph} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

          {/* linhas e pontos */}
          {series.map((s, si) => {
            const cor = s.avatarCor || CORES[si % CORES.length];
            const pontos = s.pts.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
            const ultimo = s.pts[n - 1];
            return (
              <g key={s.id}>
                <polyline points={pontos} fill="none" stroke={cor} strokeWidth="2.5"
                  strokeLinejoin="round" strokeLinecap="round" />
                {s.pts.map((v, i) => (
                  <circle key={i} cx={xOf(i)} cy={yOf(v)} r="3.5" fill={cor} />
                ))}
                <text x={ml + pw + 7} y={yOf(ultimo) + 4} fill={cor}
                  fontSize="10" fontFamily="IBM Plex Mono, monospace" dominantBaseline="middle">
                  {s.nome.split(" ")[0].slice(0, 9)}
                </text>
              </g>
            );
          })}

          {/* rótulos eixo X */}
          {jogosEncerrados.map((j, i) => (
            <text key={j.id} x={xOf(i)} y={mt + ph + 16} fill="rgba(255,255,255,0.35)"
              fontSize="9" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
              {i + 1}
            </text>
          ))}

          {/* rótulos eixo Y */}
          {[0, Math.round(maxPts / 2), maxPts].map((v) => (
            <text key={v} x={ml - 4} y={yOf(v) + 3} fill="rgba(255,255,255,0.35)"
              fontSize="9" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
              {v}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

/* ================= ESTATÍSTICAS INÚTEIS ================= */
function EstatisticasInutils({ ranking, palpitesMap, jogos }) {
  const [aberto, setAberto] = useState(false);

  const jogosEncerrados = jogos.filter(temResultado);
  if (jogosEncerrados.length < 5 || ranking.length < 2) return null;

  /* 🥄 Lanterna */
  const lanterna = ranking[ranking.length - 1];

  /* 🧊 Pé Frio — mais zeros em jogos encerrados */
  const comZeros = [...ranking].sort((a, b) => {
    const az = jogosEncerrados.filter((m) => pontosDoPalpite(palpitesMap[m.id]?.[a.id], m) === 0).length;
    const bz = jogosEncerrados.filter((m) => pontosDoPalpite(palpitesMap[m.id]?.[b.id], m) === 0).length;
    return bz - az || a.nome.localeCompare(b.nome);
  });
  const qtdZerosPF = jogosEncerrados.filter((m) => pontosDoPalpite(palpitesMap[m.id]?.[comZeros[0].id], m) === 0).length;
  const peFrio = qtdZerosPF > 0 ? { ...comZeros[0], qtdZeros: qtdZerosPF } : null;

  /* 🔮 Otimista — maior média de gols palpitados (mín. 3 palpites em jogos encerrados) */
  const comMedia = ranking.map((p) => {
    const pals = jogosEncerrados.filter((m) => palpitesMap[m.id]?.[p.id]);
    if (pals.length < 3) return { ...p, media: -1, qtdPals: pals.length };
    const soma = pals.reduce((acc, m) => acc + Number(palpitesMap[m.id][p.id].h) + Number(palpitesMap[m.id][p.id].a), 0);
    return { ...p, media: soma / pals.length, qtdPals: pals.length };
  }).sort((a, b) => b.media - a.media || a.nome.localeCompare(b.nome));
  const otimista = comMedia[0]?.media >= 0 ? comMedia[0] : null;

  /* 🎯 Sniper — maior % de exatos entre quem palpitou mín. 3 jogos encerrados */
  const comPct = ranking.map((p) => {
    const comPalpite = jogosEncerrados.filter((m) => palpitesMap[m.id]?.[p.id]);
    if (comPalpite.length < 3) return { ...p, pct: -1 };
    return { ...p, pct: (p.exatos / comPalpite.length) * 100 };
  }).sort((a, b) => b.pct - a.pct || a.nome.localeCompare(b.nome));
  const sniper = comPct[0]?.pct >= 0 ? comPct[0] : null;

  /* ⚽ Sr. 1×0 — palpitou 1×0 mais vezes */
  const com1x0 = [...ranking].sort((a, b) => {
    const ac = jogos.filter((m) => { const pal = palpitesMap[m.id]?.[a.id]; return pal && Number(pal.h) === 1 && Number(pal.a) === 0; }).length;
    const bc = jogos.filter((m) => { const pal = palpitesMap[m.id]?.[b.id]; return pal && Number(pal.h) === 1 && Number(pal.a) === 0; }).length;
    return bc - ac || a.nome.localeCompare(b.nome);
  });
  const cnt1x0 = jogos.filter((m) => { const pal = palpitesMap[m.id]?.[com1x0[0].id]; return pal && Number(pal.h) === 1 && Number(pal.a) === 0; }).length;
  const sr1x0 = cnt1x0 > 0 ? { ...com1x0[0], cnt: cnt1x0 } : null;

  const premios = [
    { emoji: "🥄", titulo: "Lanterna", p: lanterna, detalhe: `${lanterna.pontos} pt${lanterna.pontos === 1 ? "" : "s"}` },
    peFrio && { emoji: "🧊", titulo: "Pé Frio", p: peFrio, detalhe: `${peFrio.qtdZeros} zero${peFrio.qtdZeros === 1 ? "" : "s"} em jogos encerrados` },
    otimista && { emoji: "🔮", titulo: "Otimista", p: otimista, detalhe: `média ${otimista.media.toFixed(1)} gols/jogo` },
    sniper && { emoji: "🎯", titulo: "Sniper", p: sniper, detalhe: `${sniper.pct.toFixed(0)}% de placares exatos` },
    sr1x0 && { emoji: "⚽", titulo: "Sr. 1×0", p: sr1x0, detalhe: `palpitou 1×0 em ${sr1x0.cnt} jogo${sr1x0.cnt === 1 ? "" : "s"}` },
  ].filter(Boolean);

  return (
    <div style={{ marginTop: "20px" }}>
      <button className="stats-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span>🏅 ESTATÍSTICAS INÚTEIS</span>
        <span className="seletor-data-chevron">{aberto ? "▾" : "▸"}</span>
      </button>
      {aberto && (
        <div className="stats-grid">
          {premios.map(({ emoji, titulo, p, detalhe }, i) => (
            <div key={titulo} className="stats-card entra-cartao" style={{ "--i": i }}>
              <div className="stats-emoji">{emoji}</div>
              <div className="stats-info">
                <div className="stats-titulo">{titulo}</div>
                <div className="stats-nome">
                  <Avatar nome={p.nome} emoji={p.avatarEmoji} cor={p.avatarCor} size={20} />
                  {p.nome}
                </div>
                <div className="stats-detalhe">{detalhe}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= AGRUPAMENTO POR DATA ================= */

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const fmtSP = (ts) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ts));

const chaveData = (iso) => (iso ? fmtSP(new Date(iso).getTime()) : "__semdata__");

const labelData = (chave, offsetMs = 0) => {
  if (chave === "__semdata__") return "Sem data definida";
  const agora = Date.now() + offsetMs;
  if (chave === fmtSP(agora))              return `Hoje · ${chave.slice(8)}/${chave.slice(5, 7)}`;
  if (chave === fmtSP(agora + 86400000))   return `Amanhã · ${chave.slice(8)}/${chave.slice(5, 7)}`;
  const dow = new Date(chave + "T12:00:00").getDay();
  return `${DIAS_SEMANA[dow]} · ${chave.slice(8)}/${chave.slice(5, 7)}`;
};

const agruparPorData = (jogos) => {
  const grupos = new Map();
  for (const m of jogos) {
    const chave = chaveData(m.kickoff);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(m);
  }
  return [...grupos.entries()];
};

/* ================= COUNTDOWN ================= */

const MSGS_CD = [
  { min: 24 * 60, msg: "Calma, ainda dá pra palpitar ☕",                cls: "cd-ok" },
  { min: 12 * 60, msg: "Hoje tem jogo! Não esquece o palpite 👊",        cls: "cd-ok" },
  { min:  6 * 60, msg: "O palpite não vai se fazer sozinho 😤",          cls: "cd-ok" },
  { min:  2 * 60, msg: "Tic tac… hora de decidir! ⏰",                   cls: "cd-atencao" },
  { min:      60, msg: "Corre que vai fechar! 🏃💨",                     cls: "cd-atencao" },
  { min:      30, msg: "MENOS DE 1 HORA! Vai deixar pra quando?! 🚨",    cls: "cd-alerta" },
  { min:      15, msg: "Você vai deixar pra última hora mesmo?? 😅🔥",   cls: "cd-alerta" },
  { min:       5, msg: "TÁ FECHANDO!! ENTRA LOGO PELO AMOR!! 💀🔥",      cls: "cd-critico" },
  { min:       1, msg: "ÚLTIMO MINUTO!!! QUE SUFOCO!!! 😱",              cls: "cd-critico" },
  { min:       0, msg: "FECHA EM SEGUNDOS!!! MISERICÓRDIA!! 🆘",         cls: "cd-critico" },
];

function Countdown({ kickoff, offsetMs = 0 }) {
  const calc = useCallback(
    () => new Date(kickoff).getTime() - (Date.now() + offsetMs),
    [kickoff, offsetMs]
  );
  const [restante, setRestante] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setRestante(calc()), 1000);
    return () => clearInterval(id);
  }, [calc]);

  if (restante <= 0) return null;

  const totalMin = restante / 60000;
  const { msg, cls } = MSGS_CD.find((m) => totalMin > m.min) ?? MSGS_CD.at(-1);
  const h = Math.floor(restante / 3600000);
  const min = Math.floor((restante % 3600000) / 60000);
  const seg = Math.floor((restante % 60000) / 1000);
  const tempo = h > 0
    ? `${h}h ${String(min).padStart(2, "0")}min`
    : min > 0
    ? `${min}min ${String(seg).padStart(2, "0")}s`
    : `${seg}s`;

  return (
    <div className={`countdown ${cls}`} aria-live="polite">
      <span className="cd-msg">{msg}</span>
      <span className="cd-tempo">{tempo}</span>
    </div>
  );
}

/* ================= JOGOS ================= */
function Jogos({ estado, palpitesMap, contagensMap, comecou, ehAdmin, token, recarregar, offsetMs = 0 }) {
  const [casa, setCasa] = useState("");
  const [fora, setFora] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [fase, setFase] = useState("grupos");
  const [buscandoJogos, setBuscandoJogos] = useState(false);
  const [buscandoResultados, setBuscandoResultados] = useState(false);
  const [aviso, setAviso] = useState("");
  const [dataFiltro, setDataFiltro] = useState(() => {
    const agora = Date.now() + offsetMs;
    const aoVivo = estado.jogos.find(
      (m) => !temResultado(m) && m.kickoff && new Date(m.kickoff).getTime() <= agora
    );
    if (aoVivo?.kickoff) return chaveData(aoVivo.kickoff);
    const proximo = [...estado.jogos]
      .filter((m) => !temResultado(m) && m.kickoff && new Date(m.kickoff).getTime() > agora)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
    if (proximo?.kickoff) return chaveData(proximo.kickoff);
    const hoje = fmtSP(agora);
    const chaves = agruparPorData(estado.jogos).map(([c]) => c);
    if (chaves.includes(hoje)) return hoje;
    const futuras = chaves.filter((c) => c > hoje && c !== "__semdata__");
    if (futuras.length > 0) return futuras[0];
    return chaves[chaves.length - 1] || hoje;
  });
  const [aoVivoFiltro, setAoVivoFiltro] = useState(false);

  const hojeKey = fmtSP(Date.now() + offsetMs);
  const jogosPendentesHoje = estado.jogos.filter(
    (m) => m.kickoff && chaveData(m.kickoff) === hojeKey && !temResultado(m) && !comecou(m)
  ).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const temFaltandoHoje = jogosPendentesHoje.length > 0 && estado.participantes.some(
    (p) => jogosPendentesHoje.some((m) => !palpitesMap[m.id]?.[p.id])
  );

  const cobrarWhatsApp = async () => {
    const agora = new Date(Date.now() + offsetMs);
    const faltando = estado.participantes
      .map((p) => ({
        nome: p.nome,
        jogos: jogosPendentesHoje.filter((m) => !palpitesMap[m.id]?.[p.id]),
      }))
      .filter((p) => p.jogos.length > 0)
      .sort((a, b) => b.jogos.length - a.jogos.length);

    if (!faltando.length) return;

    const primeiro = jogosPendentesHoje[0];
    const msAte = new Date(primeiro.kickoff) - agora;
    const h = Math.floor(msAte / 3600000);
    const min = Math.floor((msAte % 3600000) / 60000);
    const horario = new Date(primeiro.kickoff).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const countdownStr = h > 0 ? `em ${h}h${min > 0 ? String(min).padStart(2, "0") + "min" : ""}` : `em ${min}min`;

    const linhas = faltando.map(
      (p) => `• ${p.nome} — ${p.jogos.map((m) => `${m.casa} × ${m.fora}`).join(", ")}`
    );

    const msg = [
      "⚽ *BOLÃO DOS GURIS*",
      "",
      "⚠️ Faltam palpites pra hoje:",
      ...linhas,
      "",
      `⏰ Primeiro jogo às ${horario} (${countdownStr})`,
      "",
      "Corre antes de fechar! 🔒",
      window.location.origin,
    ].join("\n");

    if (navigator.share) {
      navigator.share({ text: msg }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(msg);
        setAviso("Texto copiado! Cole no WhatsApp 📋");
      } catch {
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      }
    }
  };

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const addJogo = async () => {
    if (!casa.trim() || !fora.trim()) return;
    try {
      await api("/api/jogo", {
        method: "POST",
        body: JSON.stringify({ t: token, casa, fora, kickoff: kickoff || null, fase }),
      });
      setCasa(""); setFora(""); setKickoff(""); setFase("grupos");
      recarregar();
    } catch (e) { setAviso(e.message); }
  };

  const delJogo = async (id) => {
    try {
      await api("/api/jogo", { method: "DELETE", body: JSON.stringify({ t: token, jogoId: id }) });
      recarregar();
    } catch (e) { setAviso(e.message); }
  };

  const salvarResultado = async (jogo, gh, ga) => {
    try {
      await api("/api/jogo", {
        method: "PUT",
        body: JSON.stringify({ t: token, jogoId: jogo.id, gh, ga }),
      });
      recarregar();
    } catch (e) { setAviso(e.message); }
  };

  const buscarJogosDoDia = async () => {
    setBuscandoJogos(true);
    setAviso("");
    try {
      const r = await api(`/api/futebol?t=${encodeURIComponent(token)}&acao=jogos-hoje`);
      recarregar();
      const adicionados = r.adicionados || 0;
      const atualizados = r.atualizados || 0;
      const total = r.total || 0;
      setAviso(
        total === 0
          ? "Nenhum jogo da Copa hoje."
          : adicionados === 0 && atualizados === 0
          ? "Os jogos de hoje já estão cadastrados."
          : `${adicionados} adicionado${adicionados === 1 ? "" : "s"} · ${atualizados} atualizado${atualizados === 1 ? "" : "s"} ⚽`
      );
    } catch (e) {
      console.error(e);
      setAviso(e.message || "Não consegui buscar agora — tenta de novo ou adiciona manualmente.");
    }
    setBuscandoJogos(false);
  };

  const buscarResultados = async () => {
    const pendentes = estado.jogos.filter((m) => !temResultado(m) && (!m.kickoff || comecou(m)));
    if (pendentes.length === 0) {
      setAviso("Nenhum jogo iniciado aguardando resultado.");
      return;
    }
    setBuscandoResultados(true);
    setAviso("");
    try {
      const r = await api(`/api/futebol?t=${encodeURIComponent(token)}&acao=resultados`);
      recarregar();
      const atualizados = r.atualizados || 0;
      setAviso(
        atualizados === 0
          ? "Nenhum resultado final novo — rode 'Jogos de hoje' antes se faltar carimbar o ID externo."
          : `${atualizados} resultado${atualizados === 1 ? "" : "s"} atualizado${atualizados === 1 ? "" : "s"} — confere o ranking! 🏆`
      );
    } catch (e) {
      console.error(e);
      setAviso(e.message || "Não consegui buscar os resultados — tenta de novo ou lança manualmente.");
    }
    setBuscandoResultados(false);
  };

  return (
    <div>
      {ehAdmin && (
        <>
          <div className="linha-botoes">
            <button className="botao botao-largo" onClick={buscarJogosDoDia} disabled={buscandoJogos || buscandoResultados}>
              {buscandoJogos ? <><span className="spinner" aria-hidden="true"></span> Buscando…</> : "⚡ Jogos de hoje"}
            </button>
            <button className="botao botao-largo" onClick={buscarResultados} disabled={buscandoJogos || buscandoResultados}>
              {buscandoResultados ? <><span className="spinner" aria-hidden="true"></span> Buscando…</> : "🏁 Buscar resultados"}
            </button>
            <button
              className="botao botao-largo botao-zap"
              onClick={cobrarWhatsApp}
              disabled={!temFaltandoHoje}
              title={temFaltandoHoje ? "Abrir WhatsApp com cobrança" : "Todos palpitaram ou não há jogos abertos hoje"}
            >
              📲 Cobrar galera
            </button>
          </div>

          <div className="cartao form-jogo">
            <div className="form-linha">
              <input value={casa} onChange={(e) => setCasa(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addJogo()} placeholder="Time da casa" />
              <span className="vs">×</span>
              <input value={fora} onChange={(e) => setFora(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addJogo()} placeholder="Visitante" />
            </div>
            <div className="form-linha">
              <select value={fase} onChange={(e) => setFase(e.target.value)} className="select-fase" aria-label="Fase do jogo">
                <option value="grupos">Fase de grupos</option>
                <option value="eliminatórias">Mata-mata</option>
              </select>
              <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} aria-label="Data e hora do jogo" />
              <button className="botao" onClick={addJogo}>Adicionar</button>
            </div>
          </div>
        </>
      )}

      {aviso && <p className="dica toast" role="status">{aviso}</p>}

      {estado.jogos.length === 0 && (
        <Vazio texto={ehAdmin ? "Nenhum jogo ainda. Use o botão de busca ou adicione manualmente." : "O organizador ainda não cadastrou os jogos."} />
      )}

      {estado.jogos.length > 0 && (() => {
        const grupos = agruparPorData(estado.jogos);
        const idxRaw = grupos.findIndex(([c]) => c === dataFiltro);
        const idx = idxRaw === -1 ? Math.max(0, grupos.length - 1) : idxRaw;
        const jogosAoVivo = estado.jogos.filter((m) => !temResultado(m) && comecou(m));
        const jogosMostrar = aoVivoFiltro ? jogosAoVivo : (grupos[idx]?.[1] ?? []);
        return (
          <>
            <div className="nav-data">
              <button
                className={"nav-ao-vivo" + (aoVivoFiltro ? " nav-ao-vivo-ativo" : "")}
                onClick={() => setAoVivoFiltro((v) => !v)}
              >
                <span className="nav-vivo-dot" aria-hidden="true" />
                Ao vivo
              </button>
              <div className="nav-data-nav">
                <button
                  className="nav-data-seta"
                  onClick={() => { setAoVivoFiltro(false); setDataFiltro(grupos[idx - 1][0]); }}
                  disabled={idx === 0}
                  aria-label="Data anterior"
                >‹</button>
                <span className={"nav-data-label" + (aoVivoFiltro ? " nav-data-label-dim" : "")}>
                  {labelData(grupos[idx]?.[0] ?? "__semdata__", offsetMs)}
                </span>
                <button
                  className="nav-data-seta"
                  onClick={() => { setAoVivoFiltro(false); setDataFiltro(grupos[idx + 1][0]); }}
                  disabled={idx >= grupos.length - 1}
                  aria-label="Próxima data"
                >›</button>
              </div>
            </div>

            {jogosMostrar.length === 0 ? (
              <div className="nav-sem-jogos">
                {aoVivoFiltro
                  ? "Nenhum jogo ao vivo no momento."
                  : "⏳ Aguarde — próximos jogos ainda não foram cadastrados."}
              </div>
            ) : (
              jogosMostrar.map((m, i) => {
                const encerrado = temResultado(m);
                const travado = comecou(m);
                const faltam = !encerrado ? estado.participantes.length - (contagensMap[m.id] || 0) : 0;
                return (
                  <div key={m.id} className={"cartao jogo entra-cartao" + (encerrado ? " encerrado" : "")} style={{ "--i": Math.min(i, 8) }}>
                    <div className="jogo-info">
                      <div className="jogo-times">{fl(m.casa)}{m.casa} <span className="vs">×</span> {fl(m.fora)}{m.fora}</div>
                      <div className="jogo-meta">
                        {fmtQuando(m) && <span className="jogo-quando">{fmtQuando(m)}</span>}
                        {m.fase === "eliminatórias" && <span className="tag tag-elim">⚔ Mata-mata</span>}
                        {!encerrado && travado && <span className="tag tag-travado">🔒 em jogo</span>}
                        {!encerrado && !travado && faltam > 0 && (
                          <span className="tag tag-pendente">⚠ faltam {faltam} palpite{faltam === 1 ? "" : "s"}</span>
                        )}
                        {!encerrado && !travado && estado.participantes.length > 0 && faltam === 0 && (
                          <span className="tag tag-ok">✓ palpites completos</span>
                        )}
                      </div>
                      {!encerrado && !travado && m.kickoff && (
                        <Countdown kickoff={m.kickoff} offsetMs={offsetMs} />
                      )}
                    </div>
                    {ehAdmin ? (
                      <ResultadoAdmin jogo={m} salvar={salvarResultado} remover={() => delJogo(m.id)} />
                    ) : encerrado ? (
                      <div className="placar-final led-mini">{m.gh} : {m.ga}</div>
                    ) : m.live ? (
                      <div className="placar-vivo led-mini">
                        <span className="placar-vivo-dot" aria-hidden="true" />
                        {m.gh} : {m.ga}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </>
        );
      })()}

      {ehAdmin && <BonusAdmin token={token} estado={estado} recarregar={recarregar} />}
    </div>
  );
}

function ResultadoAdmin({ jogo, salvar, remover }) {
  const [gh, setGh] = useState(jogo.gh ?? "");
  const [ga, setGa] = useState(jogo.ga ?? "");
  const timer = useRef(null);

  useEffect(() => { setGh(jogo.gh ?? ""); setGa(jogo.ga ?? ""); }, [jogo.gh, jogo.ga]);

  const mudar = (campo, valor) => {
    const nh = campo === "gh" ? valor : gh;
    const na = campo === "ga" ? valor : ga;
    campo === "gh" ? setGh(valor) : setGa(valor);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      salvar(jogo, nh === "" ? null : nh, na === "" ? null : na);
    }, 800);
  };

  return (
    <div className="jogo-resultado">
      {jogo.fase === "eliminatórias" && (
        <span className="aviso-90min" title="Lançar apenas o placar dos 90 minutos">⏱ 90min</span>
      )}
      <input type="number" min="0" inputMode="numeric" value={gh} placeholder="–"
        onChange={(e) => mudar("gh", e.target.value)} aria-label={"Gols " + jogo.casa} />
      <span className="vs">:</span>
      <input type="number" min="0" inputMode="numeric" value={ga} placeholder="–"
        onChange={(e) => mudar("ga", e.target.value)} aria-label={"Gols " + jogo.fora} />
      <button className="apagar" onClick={remover} aria-label="Remover jogo">✕</button>
    </div>
  );
}

/* ================= PALPITES ================= */
function Palpites({ estado, palpitesMap, comecou, token, recarregar, offsetMs = 0, jogoInicial = null }) {
  const [jogoSel, setJogoSel] = useState(() => {
    if (jogoInicial) return String(jogoInicial);
    const agora = Date.now() + offsetMs;
    const aoVivo = estado.jogos.find(
      (m) => !temResultado(m) && m.kickoff && new Date(m.kickoff).getTime() <= agora
    );
    if (aoVivo) return String(aoVivo.id);
    const proximo = [...estado.jogos]
      .filter((m) => !temResultado(m) && m.kickoff && new Date(m.kickoff).getTime() > agora)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
    if (proximo) return String(proximo.id);
    return estado.jogos[0] ? String(estado.jogos[0].id) : "";
  });
  const jogo = estado.jogos.find((m) => String(m.id) === String(jogoSel)) || estado.jogos[0];

  const hoje = fmtSP(Date.now() + offsetMs);
  const [gruposAbertos, setGruposAbertos] = useState(() => {
    const abertos = new Set();
    for (const [chave] of agruparPorData(estado.jogos)) {
      if (chave >= hoje || chave === "__semdata__") abertos.add(chave);
    }
    if (jogoInicial) {
      const j = estado.jogos.find((m) => m.id === jogoInicial);
      if (j?.kickoff) abertos.add(chaveData(j.kickoff));
    }
    return abertos;
  });
  const toggleGrupo = (chave) =>
    setGruposAbertos((prev) => {
      const s = new Set(prev);
      s.has(chave) ? s.delete(chave) : s.add(chave);
      return s;
    });

  if (estado.jogos.length === 0) return <Vazio texto="Ainda não há jogos cadastrados." />;
  if (estado.participantes.length === 0) return <Vazio texto="Ainda não há participantes cadastrados." />;

  const encerrado = temResultado(jogo);
  const travado = comecou(jogo) || encerrado;
  const ehAdmin = estado.eu.isAdmin;
  const revelado = travado; /* palpites dos outros só aparecem depois que começa */

  return (
    <div>
      <div className="seletor-jogos" role="listbox" aria-label="Selecionar jogo">
        {agruparPorData(estado.jogos).map(([chave, grupo]) => {
          const aberto = gruposAbertos.has(chave);
          const encGrupo = grupo.filter(temResultado).length;
          return (
            <div key={chave}>
              <button
                className="seletor-data-header"
                onClick={() => toggleGrupo(chave)}
                aria-expanded={aberto}
              >
                <span>{labelData(chave, offsetMs)}</span>
                <span className="seletor-data-info">
                  {encGrupo > 0 && <span className="seletor-data-cnt">{encGrupo}/{grupo.length}</span>}
                  <span className="seletor-data-chevron">{aberto ? "▾" : "▸"}</span>
                </span>
              </button>
              {aberto && grupo.map((m) => {
                const enc = temResultado(m);
                const trav = comecou(m) || enc;
                const ativo = String(m.id) === String(jogo.id);
                const cls = "seletor-jogo" +
                  (ativo ? " sj-ativo" : "") +
                  (enc ? " sj-enc" : trav ? " sj-trav" : " sj-aberto");
                return (
                  <button
                    key={m.id}
                    role="option"
                    aria-selected={ativo}
                    className={cls}
                    onClick={() => setJogoSel(String(m.id))}
                  >
                    <span className="sj-dot" aria-hidden="true" />
                    <span className="sj-nome">{fl(m.casa)}{m.casa} <span className="vs">×</span> {fl(m.fora)}{m.fora}</span>
                    {fmtQuando(m) && <span className="sj-quando">{fmtQuando(m)}</span>}
                    {enc && <span className="sj-placar">{m.gh}:{m.ga}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {!encerrado && !travado && jogo.kickoff && (
        <Countdown kickoff={jogo.kickoff} offsetMs={offsetMs} />
      )}

      {encerrado && (
        <p className="dica">Resultado final: <strong>{fl(jogo.casa)}{jogo.casa} {jogo.gh} × {jogo.ga} {fl(jogo.fora)}{jogo.fora}</strong></p>
      )}
      {travado && !encerrado && (
        <div className="trava-aviso"><span>🔒 Bola rolando — palpites travados pelo servidor.</span></div>
      )}

      {/* seu palpite */}
      {estado.eu.id !== null && (
        <>
          <div className="secao-titulo">SEU PALPITE</div>
          <LinhaPalpite
            jogo={jogo}
            participante={{ id: estado.eu.id, nome: estado.eu.nome }}
            palpite={palpitesMap[jogo.id]?.[estado.eu.id]}
            bloqueado={travado && !ehAdmin}
            destaque
            token={token}
            ehAdmin={ehAdmin}
            recarregar={recarregar}
          />
        </>
      )}

      {/* palpites da galera */}
      <div className="secao-titulo">{revelado ? "PALPITES DA GALERA" : "PALPITES DA GALERA (revelados quando a bola rolar)"}</div>
      {!revelado && !ehAdmin && (
        <div className="vazio">
          <span aria-hidden="true">🤫</span>
          <span>Segredo até o apito inicial — ninguém copia ninguém por aqui.</span>
        </div>
      )}
      {(revelado || ehAdmin) &&
        estado.participantes
          .filter((p) => p.id !== estado.eu.id)
          .map((p, i) => (
            <LinhaPalpite
              key={p.id}
              jogo={jogo}
              participante={p}
              palpite={palpitesMap[jogo.id]?.[p.id]}
              bloqueado={!ehAdmin}
              token={token}
              ehAdmin={ehAdmin}
              recarregar={recarregar}
              indice={i}
            />
          ))}
    </div>
  );
}

function LinhaPalpite({ jogo, participante, palpite, bloqueado, destaque, token, ehAdmin, recarregar, indice = 0 }) {
  const [h, setH] = useState(palpite?.h ?? "");
  const [a, setA] = useState(palpite?.a ?? "");
  const [status, setStatus] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    setH(palpite?.h ?? "");
    setA(palpite?.a ?? "");
    setStatus("");
  }, [jogo.id, participante.id, palpite?.h, palpite?.a]);

  const pts = pontosDoPalpite(palpite, jogo);
  const encerrado = temResultado(jogo);

  const mudar = (campo, valor) => {
    const nh = campo === "h" ? valor : h;
    const na = campo === "a" ? valor : a;
    campo === "h" ? setH(valor) : setA(valor);
    clearTimeout(timer.current);
    if (nh === "" || na === "") return;
    setStatus("salvando");
    timer.current = setTimeout(async () => {
      try {
        await api("/api/palpite", {
          method: "POST",
          body: JSON.stringify({
            t: token,
            jogoId: jogo.id,
            h: Number(nh),
            a: Number(na),
            ...(ehAdmin && { participanteId: participante.id }),
          }),
        });
        setStatus("salvo");
        recarregar();
      } catch (e) {
        setStatus("erro");
      }
    }, 700);
  };

  return (
    <div
      className={"cartao palpite-linha entra-cartao" + (destaque ? " meu-palpite" : "")}
      style={{ "--i": Math.min(indice, 8) }}
    >
      <span className="palpite-nome">
        <Avatar nome={participante.nome} emoji={participante.avatarEmoji} cor={participante.avatarCor} size={28} />
        {participante.nome}
      </span>
      <div className="palpite-inputs">
        {status === "salvando" && <span className="palpite-status">salvando…</span>}
        {status === "salvo" && <span className="palpite-status ok">✓</span>}
        {status === "erro" && <span className="palpite-status erro">não salvou ✕</span>}
        <span className="palpite-time-flag" title={jogo.casa}>{fl(jogo.casa)}</span>
        <input type="number" min="0" inputMode="numeric" value={h} placeholder="–"
          disabled={bloqueado}
          onChange={(e) => mudar("h", e.target.value)}
          aria-label={`Palpite de ${participante.nome} para ${jogo.casa}`} />
        <span className="vs">:</span>
        <input type="number" min="0" inputMode="numeric" value={a} placeholder="–"
          disabled={bloqueado}
          onChange={(e) => mudar("a", e.target.value)}
          aria-label={`Palpite de ${participante.nome} para ${jogo.fora}`} />
        <span className="palpite-time-flag" title={jogo.fora}>{fl(jogo.fora)}</span>
        {encerrado && pts !== null && (
          <span className={"pts pts-" + pts}>{pts === PTS_EXATO ? "🎯 " : ""}{pts} pt{pts === 1 ? "" : "s"}</span>
        )}
        {encerrado && pts === null && <span className="pts pts-0">—</span>}
      </div>
    </div>
  );
}

/* ================= NOTIFICAÇÕES ================= */
/* ================= TIMER PAGAMENTO ================= */
function TimerPagamento() {
  const DEADLINE = new Date("2026-06-13T21:59:00Z"); // 18:59 BRT (UTC-3)
  const [seg, setSeg] = useState(() => Math.max(0, Math.floor((DEADLINE - Date.now()) / 1000)));

  useEffect(() => {
    if (seg <= 0) return;
    const id = setInterval(() => {
      const diff = Math.max(0, Math.floor((DEADLINE - Date.now()) / 1000));
      setSeg(diff);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (seg <= 0) return null;

  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div className="timer-pagamento">
      <span className="timer-label">⏰ Prazo para pagamento</span>
      <div className="timer-display">
        <span className="timer-bloco"><span className="timer-num">{pad(h)}</span><span className="timer-unidade">h</span></span>
        <span className="timer-sep">:</span>
        <span className="timer-bloco"><span className="timer-num">{pad(m)}</span><span className="timer-unidade">m</span></span>
        <span className="timer-sep">:</span>
        <span className="timer-bloco"><span className="timer-num">{pad(s)}</span><span className="timer-unidade">s</span></span>
      </div>
      <span className="timer-data">13/06 às 18:59</span>
    </div>
  );
}

/* ================= GALERA ================= */
function Galera({ estado, ehAdmin, token, recarregar, installPrompt, onInstalled }) {
  const [nome, setNome] = useState("");
  const [novoAdmin, setNovoAdmin] = useState(false);
  const [lista, setLista] = useState(null); /* com tokens, só admin */
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(null);
  const [toggling, setToggling] = useState(null);

  const carregarLista = useCallback(async () => {
    if (!ehAdmin) return;
    try {
      const r = await api(`/api/participante?t=${encodeURIComponent(token)}`);
      setLista(r.participantes);
    } catch (e) { setAviso(e.message); }
  }, [ehAdmin, token]);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const adicionar = async () => {
    if (!nome.trim()) return;
    try {
      await api("/api/participante", {
        method: "POST",
        body: JSON.stringify({ t: token, nome, admin: novoAdmin }),
      });
      setNome(""); setNovoAdmin(false);
      setAviso("Participante criado — copia o link e manda no WhatsApp 📲");
      carregarLista();
      recarregar();
    } catch (e) { setAviso(e.message); }
  };

  const remover = async (id) => {
    try {
      await api("/api/participante", { method: "DELETE", body: JSON.stringify({ t: token, id }) });
      carregarLista();
      recarregar();
    } catch (e) { setAviso(e.message); }
  };

  const togglePagou = async (p) => {
    setToggling(p.id);
    try {
      await api("/api/participante", { method: "PUT", body: JSON.stringify({ t: token, id: p.id, pagou: !p.pagou }) });
      await carregarLista();
      recarregar();
    } catch (e) { setAviso(e.message); }
    finally { setToggling(null); }
  };

  const copiarLink = async (p) => {
    const url = `${window.location.origin}/?t=${p.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(p.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setAviso(url); /* fallback: mostra o link pro admin copiar na mão */
    }
  };

  const isAndroid = /android/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const mostrarBotaoInstalar = isAndroid && !isStandalone;

  const instalarPwa = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") onInstalled();
  };

  const BotaoInstalar = mostrarBotaoInstalar ? (
    <div className="notif-bloco">
      {installPrompt
        ? <button className="botao notif-btn" onClick={instalarPwa}>📲 Instalar app na tela inicial</button>
        : <p className="notif-aviso">📲 Para instalar: toque nos <strong>⋮ três pontos</strong> do navegador → <strong>"Adicionar à tela inicial"</strong></p>
      }
    </div>
  ) : null;

  if (!ehAdmin) {
    return (
      <div>
        <TimerPagamento />
        {BotaoInstalar}
        {estado.participantes.length === 0 && <Vazio texto="Ainda não há participantes." />}
        {estado.participantes.map((p, i) => (
          <div key={p.id} className="cartao palpite-linha entra-cartao" style={{ "--i": Math.min(i, 8) }}>
            <Avatar nome={p.nome} emoji={p.avatarEmoji} cor={p.avatarCor} size={30} />
            <span className="palpite-nome">{p.nome}{p.id === estado.eu.id ? " (você)" : ""}</span>
            <span className={p.pagou ? "badge-pago" : "badge-pendente"}>
              {p.pagou ? "✅ Pago" : "⏳ Pendente"}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="cartao form-jogo">
        <div className="form-linha">
          <input value={nome} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()} placeholder="Nome do amigo" />
          <button className="botao" onClick={adicionar}>Adicionar</button>
        </div>
        <label className="check-admin">
          <input type="checkbox" checked={novoAdmin} onChange={(e) => setNovoAdmin(e.target.checked)} />
          também é organizador (pode lançar jogos e resultados)
        </label>
      </div>

      <TimerPagamento />
      {BotaoInstalar}

      {aviso && <p className="dica toast" role="status">{aviso}</p>}

      {lista === null && <p className="dica">Carregando…</p>}
      {lista && lista.length === 0 && <Vazio texto="Adicione os 9 nomes do grupo — cada um ganha um link próprio." />}
      {lista && lista.length > 0 && (() => {
        const pagos = lista.filter((p) => p.pagou).length;
        const total = lista.length;
        const caixa = pagos * 20;
        return (
          <div className="resumo-pagamento">
            <span className="resumo-pagamento-txt">
              💰 {pagos}/{total} pagaram · <strong>R$ {caixa} em caixa</strong>
            </span>
          </div>
        );
      })()}
      {lista &&
        lista.map((p, i) => (
          <div key={p.id} className="cartao palpite-linha entra-cartao" style={{ "--i": Math.min(i, 8) }}>
            <Avatar nome={p.nome} emoji={p.avatarEmoji} cor={p.avatarCor} size={30} />
            <span className="palpite-nome">{p.nome}{p.isAdmin ? " ⭐" : ""}</span>
            <button
              className={p.pagou ? "badge-pago badge-btn" : "badge-pendente badge-btn"}
              onClick={() => togglePagou(p)}
              disabled={toggling === p.id}
              title={p.pagou ? "Clique para desmarcar" : "Clique para marcar como pago"}
            >
              {p.pagou ? "✅ Pago" : "⏳ Pendente"}
            </button>
            <button className="botao-fantasma" onClick={() => copiarLink(p)}>
              {copiado === p.id ? "✓ Copiado" : "📋 Copiar link"}
            </button>
            <button className="apagar" onClick={() => remover(p.id)} aria-label={`Remover ${p.nome}`}>✕</button>
          </div>
        ))}
    </div>
  );
}

/* ================= CAMPEÃO ================= */

/* 46 classificados confirmados para a Copa 2026
   (faltam os 2 vencedores do playoff intercontinental — me diga quais são) */
const FLAG_CODES = {
  // CONMEBOL
  "Brasil":"br","Brazil":"br",
  "Argentina":"ar",
  "Uruguai":"uy","Uruguay":"uy",
  "Colômbia":"co","Colombia":"co",
  "Equador":"ec","Ecuador":"ec",
  "Paraguai":"py","Paraguay":"py",
  "Peru":"pe",
  "Venezuela":"ve",
  "Bolívia":"bo","Bolivia":"bo",
  "Chile":"cl",
  // CONCACAF
  "Estados Unidos":"us","United States":"us","USA":"us","EUA":"us",
  "México":"mx","Mexico":"mx",
  "Canadá":"ca","Canada":"ca",
  "Costa Rica":"cr",
  "Panamá":"pa","Panama":"pa",
  "Jamaica":"jm",
  "Honduras":"hn",
  "El Salvador":"sv",
  "Guatemala":"gt",
  "Trinidad e Tobago":"tt","Trinidad and Tobago":"tt",
  "Curaçao":"cw","Curacao":"cw",
  "Haiti":"ht",
  // UEFA
  "Alemanha":"de","Germany":"de",
  "França":"fr","France":"fr",
  "Espanha":"es","Spain":"es",
  "Inglaterra":"gb-eng","England":"gb-eng",
  "Portugal":"pt",
  "Itália":"it","Italy":"it",
  "Holanda":"nl","Netherlands":"nl","Países Baixos":"nl",
  "Bélgica":"be","Belgium":"be",
  "Croácia":"hr","Croatia":"hr",
  "Suíça":"ch","Switzerland":"ch",
  "Dinamarca":"dk","Denmark":"dk",
  "Polônia":"pl","Poland":"pl",
  "Áustria":"at","Austria":"at",
  "Suécia":"se","Sweden":"se",
  "Noruega":"no","Norway":"no",
  "República Tcheca":"cz","Czech Republic":"cz","Czechia":"cz",
  "Sérvia":"rs","Serbia":"rs",
  "Turquia":"tr","Turkey":"tr","Türkiye":"tr",
  "Ucrânia":"ua","Ukraine":"ua",
  "País de Gales":"gb-wls","Wales":"gb-wls",
  "Escócia":"gb-sct","Scotland":"gb-sct",
  "Irlanda":"ie","Republic of Ireland":"ie","Ireland":"ie",
  "Irlanda do Norte":"gb-nir","Northern Ireland":"gb-nir",
  "Hungria":"hu","Hungary":"hu",
  "Romênia":"ro","Romania":"ro",
  "Grécia":"gr","Greece":"gr",
  "Rússia":"ru","Russia":"ru",
  "Eslováquia":"sk","Slovakia":"sk",
  "Eslovênia":"si","Slovenia":"si",
  "Albânia":"al","Albania":"al",
  "Bósnia e Herzegovina":"ba","Bosnia and Herzegovina":"ba","Bosnia-Herzegovina":"ba",
  "Islândia":"is","Iceland":"is",
  "Finlândia":"fi","Finland":"fi",
  "Bulgária":"bg","Bulgaria":"bg",
  "Montenegro":"me",
  "Macedônia do Norte":"mk","North Macedonia":"mk",
  // CAF
  "Marrocos":"ma","Morocco":"ma",
  "Senegal":"sn",
  "Tunísia":"tn","Tunisia":"tn",
  "Argélia":"dz","Algeria":"dz",
  "Egito":"eg","Egypt":"eg",
  "Nigéria":"ng","Nigeria":"ng",
  "Gana":"gh","Ghana":"gh",
  "Camarões":"cm","Cameroon":"cm",
  "Costa do Marfim":"ci","Ivory Coast":"ci","Côte d'Ivoire":"ci",
  "África do Sul":"za","South Africa":"za",
  "Mali":"ml",
  "Burkina Faso":"bf",
  "Cabo Verde":"cv","Cape Verde":"cv","Cape Verde Islands":"cv",
  "República Democrática do Congo":"cd","DR Congo":"cd",
  // AFC
  "Japão":"jp","Japan":"jp",
  "Coreia do Sul":"kr","South Korea":"kr","Korea Republic":"kr",
  "Irã":"ir","Iran":"ir","IR Iran":"ir",
  "Arábia Saudita":"sa","Saudi Arabia":"sa",
  "Austrália":"au","Australia":"au",
  "Catar":"qa","Qatar":"qa",
  "Emirados Árabes Unidos":"ae","United Arab Emirates":"ae","UAE":"ae",
  "Iraque":"iq","Iraq":"iq",
  "Uzbequistão":"uz","Uzbekistan":"uz",
  "Jordânia":"jo","Jordan":"jo",
  "China":"cn","China PR":"cn",
  // OFC
  "Nova Zelândia":"nz","New Zealand":"nz",
};
const fl = (nome) => {
  const code = FLAG_CODES[nome];
  if (!code) return null;
  return <img src={`https://flagcdn.com/20x15/${code}.png`} alt={nome} className="flag-img" />;
};

const SELECOES = [
  // CONCACAF
  "Canadá", "Costa Rica", "Estados Unidos", "Honduras", "México", "Panamá",
  // CONMEBOL
  "Argentina", "Brasil", "Colômbia", "Equador", "Uruguai", "Venezuela",
  // UEFA
  "Alemanha", "Áustria", "Bélgica", "Croácia", "Dinamarca", "Escócia",
  "Espanha", "França", "Holanda", "Hungria", "Inglaterra", "Itália",
  "Portugal", "Sérvia", "Suíça", "Turquia",
  // CAF
  "África do Sul", "Argélia", "Camarões", "Costa do Marfim",
  "Egito", "Mali", "Marrocos", "Nigéria", "Senegal",
  // AFC
  "Arábia Saudita", "Austrália", "Catar", "Coreia do Sul",
  "Irã", "Iraque", "Japão", "Uzbequistão",
  // OFC
  "Nova Zelândia",
].sort((a, b) => a.localeCompare(b, "pt-BR"));

const normBusca = (s) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/* ================= BONUS ADMIN ================= */

function BonusAdmin({ token, estado, recarregar }) {
  const [resultado, setResultado] = useState(null);
  const [campeaoFiltro, setCampeaoFiltro] = useState("");
  const [campeaoSel, setCampeaoSel] = useState("");
  const [artilheiroVal, setArtilheiroVal] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [pedindoConfirm, setPedindoConfirm] = useState(null);
  const [aviso, setAviso] = useState("");
  const [toggling, setToggling] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api(`/api/resultado-especial?t=${encodeURIComponent(token)}`);
      setResultado(r);
      if (r.campeao) setCampeaoSel(r.campeao.valor);
      if (r.artilheiro) setArtilheiroVal(r.artilheiro.valor);
    } catch (e) { setAviso(e.message); }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const salvar = async (tipo, valor) => {
    setSalvando(true);
    try {
      await api("/api/resultado-especial", {
        method: "POST",
        body: JSON.stringify({ t: token, tipo, valor }),
      });
    } catch (e) { setAviso(e.message); }
    setSalvando(false);
  };

  const confirmar = async (tipo) => {
    setConfirmando(tipo);
    try {
      await api("/api/resultado-especial", {
        method: "PUT",
        body: JSON.stringify({ t: token, tipo }),
      });
      await carregar();
      await recarregar();
      setPedindoConfirm(null);
    } catch (e) { setAviso(e.message); }
    setConfirmando(null);
  };

  const togglePremiado = async (participanteId) => {
    setToggling(true);
    try {
      await api("/api/resultado-especial", {
        method: "PATCH",
        body: JSON.stringify({ t: token, participanteId }),
      });
      await recarregar();
    } catch (e) { setAviso(e.message); }
    setToggling(false);
  };

  if (!resultado) return null;

  const nomeParticipante = (id) => estado.participantes.find((p) => p.id === id)?.nome || "?";

  const vencedoresCampeao = resultado.campeao?.confirmado
    ? (estado.palpitesCampeao || []).filter((pc) => pc.selecao === resultado.campeao.valor)
    : [];

  const filtradas = campeaoFiltro
    ? SELECOES.filter((s) => normBusca(s).includes(normBusca(campeaoFiltro)))
    : SELECOES;

  return (
    <div style={{ marginTop: "24px" }}>
      <div className="grupo-data-header">🏆 BÔNUS ESPECIAIS</div>

      {/* Campeão */}
      <div className="cartao form-jogo" style={{ marginBottom: "10px" }}>
        <div className="secao-titulo" style={{ margin: "0 0 8px" }}>SELEÇÃO CAMPEÃ · +9 pts para quem acertou</div>
        {resultado.campeao?.confirmado ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "20px", fontWeight: 800 }}>{fl(resultado.campeao.valor)}{resultado.campeao.valor}</span>
            <span className="tag tag-travado">🔒 confirmado</span>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Buscar seleção campeã…"
              value={campeaoFiltro}
              onChange={(e) => { setCampeaoFiltro(e.target.value); setPedindoConfirm(null); }}
            />
            <div className="lista-campeao">
              {filtradas.map((s) => (
                <button
                  key={s}
                  className={"campeao-item" + (s === campeaoSel ? " campeao-item-ativo" : "")}
                  onClick={() => { setCampeaoSel(s); setCampeaoFiltro(""); salvar("campeao", s); }}
                  disabled={salvando}
                >
                  <span className="campeao-item-nome">{fl(s)}{s}</span>
                  {s === campeaoSel && <span className="palpite-status ok">✓</span>}
                </button>
              ))}
            </div>
            {campeaoSel && pedindoConfirm !== "campeao" && (
              <button
                className="botao botao-largo"
                style={{ marginTop: "8px" }}
                onClick={() => setPedindoConfirm("campeao")}
                disabled={salvando || !!confirmando}
              >
                🔒 Confirmar campeã e distribuir +9 pts
              </button>
            )}
            {pedindoConfirm === "campeao" && (
              <>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "var(--erro)", marginTop: "8px" }}>
                  ⚠ Confirmar <strong>{campeaoSel}</strong> como campeã? Não poderá alterar.
                </p>
                <div className="form-linha">
                  <button className="botao" style={{ flex: 1 }} onClick={() => confirmar("campeao")} disabled={!!confirmando}>
                    {confirmando === "campeao" ? "Confirmando…" : "Sim, confirmar!"}
                  </button>
                  <button className="botao-fantasma" onClick={() => setPedindoConfirm(null)}>Cancelar</button>
                </div>
              </>
            )}
          </>
        )}
        {vencedoresCampeao.length > 0 && (
          <div style={{ marginTop: "10px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", opacity: .7, marginBottom: "6px" }}>GANHARAM +9 PTS:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {vencedoresCampeao.map((v) => (
                <span key={v.participante_id} className="pts pts-3">{nomeParticipante(v.participante_id)}</span>
              ))}
            </div>
          </div>
        )}
        {resultado.campeao?.confirmado && vencedoresCampeao.length === 0 && (
          <p className="dica" style={{ marginTop: "8px", opacity: .6 }}>Ninguém acertou o campeão.</p>
        )}
      </div>

      {/* Artilheiro */}
      <div className="cartao form-jogo">
        <div className="secao-titulo" style={{ margin: "0 0 8px" }}>ARTILHEIRO · +6 pts para quem acertou</div>
        {resultado.artilheiro?.confirmado ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {resultado.artilheiro.valor && <span style={{ fontSize: "20px", fontWeight: 800 }}>{resultado.artilheiro.valor}</span>}
            <span className="tag tag-travado">🔒 confirmado</span>
          </div>
        ) : (
          <input
            type="text"
            placeholder="Nome do artilheiro (opcional, para exibição)…"
            value={artilheiroVal}
            onChange={(e) => { setArtilheiroVal(e.target.value); setPedindoConfirm(null); }}
            onBlur={() => artilheiroVal.trim().length >= 2 && salvar("artilheiro", artilheiroVal.trim())}
            maxLength={80}
          />
        )}

        {/* lista de picks dos participantes */}
        {(estado.palpitesArtilheiro?.length > 0) && (
          <div style={{ marginTop: "10px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", opacity: .7, marginBottom: "6px", letterSpacing: ".1em" }}>
              {resultado.artilheiro?.confirmado ? "PICKS SUBMETIDOS:" : "MARQUE QUEM ACERTOU:"}
            </div>
            {estado.palpitesArtilheiro.map((pick) => {
              const isPremiado = (estado.premiadosArtilheiro || []).includes(pick.participante_id);
              return (
                <div
                  key={pick.participante_id}
                  className={"cartao palpite-linha" + (isPremiado ? " meu-palpite" : "")}
                  style={{ marginBottom: "6px" }}
                >
                  <span className="palpite-nome">{nomeParticipante(pick.participante_id)}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", opacity: .85, flex: "none" }}>{pick.jogador}</span>
                  {!resultado.artilheiro?.confirmado ? (
                    <button
                      className={isPremiado ? "botao" : "botao-fantasma"}
                      style={{ padding: "4px 10px", fontSize: "13px" }}
                      onClick={() => togglePremiado(pick.participante_id)}
                      disabled={toggling}
                    >
                      {isPremiado ? "✓ Acertou" : "Marcar"}
                    </button>
                  ) : (
                    isPremiado && <span className="pts pts-3">+6</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {(!estado.palpitesArtilheiro || estado.palpitesArtilheiro.length === 0) && (
          <p className="dica" style={{ marginTop: "8px", opacity: .6 }}>Ninguém escolheu artilheiro ainda.</p>
        )}

        {!resultado.artilheiro?.confirmado && (estado.premiadosArtilheiro || []).length > 0 && pedindoConfirm !== "artilheiro" && (
          <button
            className="botao botao-largo"
            style={{ marginTop: "10px" }}
            onClick={() => setPedindoConfirm("artilheiro")}
            disabled={salvando || !!confirmando}
          >
            🔒 Confirmar e distribuir +6 pts
          </button>
        )}
        {pedindoConfirm === "artilheiro" && (
          <>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "var(--erro)", marginTop: "8px" }}>
              ⚠ Confirmar {(estado.premiadosArtilheiro || []).length} ganhador{(estado.premiadosArtilheiro || []).length === 1 ? "" : "es"} do artilheiro? Não poderá alterar.
            </p>
            <div className="form-linha">
              <button className="botao" style={{ flex: 1 }} onClick={() => confirmar("artilheiro")} disabled={!!confirmando}>
                {confirmando === "artilheiro" ? "Confirmando…" : "Sim, confirmar!"}
              </button>
              <button className="botao-fantasma" onClick={() => setPedindoConfirm(null)}>Cancelar</button>
            </div>
          </>
        )}

        {resultado.artilheiro?.confirmado && (estado.premiadosArtilheiro || []).length === 0 && (
          <p className="dica" style={{ marginTop: "8px", opacity: .6 }}>Ninguém acertou o artilheiro.</p>
        )}
      </div>

      {aviso && <p className="dica toast" role="status">{aviso}</p>}
    </div>
  );
}

/* ================= AVATAR ================= */

const PALETA_CORES = [
  "#e05c3a", "#e8a838", "#5cb85c", "#3a9de0",
  "#9b59b6", "#e91e8c", "#00bcd4", "#607d8b",
];

const EMOJIS_AVATAR = [
  "⚽", "🏆", "🎯", "🔥", "⚡", "💪", "🦁", "🐉",
  "👑", "🦊", "🐺", "🦅", "🚀", "🌟", "💎", "🎩",
  "🧠", "🐍", "🦈", "🎭", "🌙", "🎪", "🥇", "🏅",
];

function corDoNome(nome) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA_CORES[h % PALETA_CORES.length];
}

function Avatar({ nome, emoji, cor, size = 36 }) {
  const iniciais = nome.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join("");
  const bg = cor || corDoNome(nome);
  const fontSize = emoji ? Math.round(size * 0.56) : Math.round(size * 0.4);
  return (
    <div className="avatar" style={{ width: size, height: size, background: bg, fontSize }}>
      {emoji || iniciais}
    </div>
  );
}

function PerfilPicker({ nome, emoji: emojiInicial, cor: corInicial, onSalvar, onFechar }) {
  const [emojiSel, setEmojiSel] = useState(emojiInicial || "");
  const [corSel, setCorSel] = useState(corInicial || corDoNome(nome));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setEmojiSel(emojiInicial || "");
    setCorSel(corInicial || corDoNome(nome));
  }, [emojiInicial, corInicial, nome]);

  const pick = async (novoEmoji, novaCor) => {
    setEmojiSel(novoEmoji);
    setCorSel(novaCor);
    setSalvando(true);
    try { await onSalvar(novoEmoji || null, novaCor); } catch {}
    setSalvando(false);
  };

  const iniciais = nome.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join("");

  return (
    <div className="perfil-picker entra-2">
      <div className="perfil-picker-topo">
        <div className="perfil-picker-preview">
          <Avatar nome={nome} emoji={emojiSel} cor={corSel} size={48} />
          <span className="perfil-picker-nome">{nome}</span>
        </div>
        <button className="apagar" onClick={onFechar} aria-label="Fechar perfil">✕</button>
      </div>

      <div className="secao-titulo" style={{ marginTop: "12px" }}>COR</div>
      <div className="paleta">
        {PALETA_CORES.map((c) => (
          <button
            key={c}
            className={"paleta-cor" + (c === corSel ? " paleta-cor-ativa" : "")}
            style={{ background: c }}
            onClick={() => pick(emojiSel, c)}
            disabled={salvando}
            aria-label={"Cor " + c}
          />
        ))}
      </div>

      <div className="secao-titulo" style={{ marginTop: "12px" }}>EMOJI</div>
      <div className="emoji-grid">
        <button
          className={"emoji-item" + (!emojiSel ? " emoji-item-ativo" : "")}
          onClick={() => pick("", corSel)}
          disabled={salvando}
          title="Usar iniciais"
        >
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "13px", fontWeight: 800 }}>
            {iniciais}
          </span>
        </button>
        {EMOJIS_AVATAR.map((e) => (
          <button
            key={e}
            className={"emoji-item" + (e === emojiSel ? " emoji-item-ativo" : "")}
            onClick={() => pick(e, corSel)}
            disabled={salvando}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function Campeao({ token, euId }) {
  // — campeão —
  const [meu, setMeu] = useState(null);
  const [confirmados, setConfirmados] = useState([]);
  const [selecao, setSelecao] = useState("");
  const [filtro, setFiltro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pedindoConfirm, setPedindoConfirm] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // — artilheiro —
  const [meuArt, setMeuArt] = useState(null);
  const [confirmadosArt, setConfirmadosArt] = useState([]);
  const [jogador, setJogador] = useState("");
  const [artSalvo, setArtSalvo] = useState(false);
  const [salvandoArt, setSalvandoArt] = useState(false);
  const [pedindoConfirmArt, setPedindoConfirmArt] = useState(false);
  const [confirmandoArt, setConfirmandoArt] = useState(false);
  const artTimerRef = useRef(null);

  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [rc, ra] = await Promise.all([
        api(`/api/campeao?t=${encodeURIComponent(token)}`),
        api(`/api/artilheiro?t=${encodeURIComponent(token)}`),
      ]);
      setMeu(rc.meu);
      setConfirmados(rc.confirmados);
      if (rc.meu) setSelecao(rc.meu.selecao);
      setMeuArt(ra.meu);
      setConfirmadosArt(ra.confirmados);
      if (ra.meu) { setJogador(ra.meu.jogador); setArtSalvo(true); }
    } catch (e) {
      setAviso(e.message);
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const selecionarTime = async (time) => {
    setSelecao(time);
    setFiltro("");
    setPedindoConfirm(false);
    setSalvando(true);
    try {
      await api("/api/campeao", {
        method: "POST",
        body: JSON.stringify({ t: token, selecao: time }),
      });
      setMeu((prev) => ({ selecao: time, confirmado: prev?.confirmado ?? false }));
    } catch (e) {
      setAviso(e.message);
    }
    setSalvando(false);
  };

  const confirmar = async () => {
    setConfirmando(true);
    try {
      await api("/api/campeao", { method: "PUT", body: JSON.stringify({ t: token }) });
      await carregar();
      setPedindoConfirm(false);
    } catch (e) {
      setAviso(e.message);
      setPedindoConfirm(false);
    }
    setConfirmando(false);
  };

  const mudarJogador = (valor) => {
    setJogador(valor);
    setArtSalvo(false);
    setPedindoConfirmArt(false);
    clearTimeout(artTimerRef.current);
    if (valor.trim().length >= 2) {
      artTimerRef.current = setTimeout(async () => {
        setSalvandoArt(true);
        try {
          await api("/api/artilheiro", {
            method: "POST",
            body: JSON.stringify({ t: token, jogador: valor.trim() }),
          });
          setMeuArt((prev) => ({ jogador: valor.trim(), confirmado: prev?.confirmado ?? false }));
          setArtSalvo(true);
        } catch (e) {
          setAviso(e.message);
        }
        setSalvandoArt(false);
      }, 900);
    }
  };

  const confirmarArt = async () => {
    setConfirmandoArt(true);
    try {
      await api("/api/artilheiro", { method: "PUT", body: JSON.stringify({ t: token }) });
      await carregar();
      setPedindoConfirmArt(false);
    } catch (e) {
      setAviso(e.message);
      setPedindoConfirmArt(false);
    }
    setConfirmandoArt(false);
  };

  if (carregando) {
    return <div className="carregando"><span className="bola-quica">⚽</span> Carregando…</div>;
  }

  const isMaster = euId === null;
  const confirmado = meu?.confirmado;
  const confirmadoArt = meuArt?.confirmado;
  const filtradas = filtro
    ? SELECOES.filter((s) => normBusca(s).includes(normBusca(filtro)))
    : SELECOES;

  return (
    <div>
      {!isMaster && (
        <>
          <div className="secao-titulo">SELEÇÃO CAMPEÃ 🏆</div>

          {confirmado ? (
            <div className="cartao meu-palpite" style={{ textAlign: "center", padding: "22px 16px" }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "11px", letterSpacing: ".14em",
                color: "var(--ambar)", marginBottom: "10px",
              }}>
                🔒 CONFIRMADO
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: ".03em" }}>
                {meu.selecao}
              </div>
            </div>
          ) : (
            <div className="cartao form-jogo">
              <input
                type="text"
                placeholder="Buscar seleção…"
                value={filtro}
                onChange={(e) => { setFiltro(e.target.value); setPedindoConfirm(false); }}
              />
              <div className="lista-campeao">
                {filtradas.map((s) => (
                  <button
                    key={s}
                    className={"campeao-item" + (s === selecao ? " campeao-item-ativo" : "")}
                    onClick={() => selecionarTime(s)}
                    disabled={salvando || confirmando}
                  >
                    <span className="campeao-item-nome">{s}</span>
                    {s === selecao && (
                      salvando
                        ? <span className="palpite-status">salvando…</span>
                        : <span className="palpite-status ok">✓ salvo</span>
                    )}
                  </button>
                ))}
                {filtradas.length === 0 && (
                  <p className="campeao-vazio">Nenhuma seleção encontrada.</p>
                )}
              </div>

              {selecao && !pedindoConfirm && (
                <button
                  className="botao botao-largo"
                  style={{ marginTop: "10px" }}
                  onClick={() => setPedindoConfirm(true)}
                  disabled={salvando || confirmando}
                >
                  🔒 Confirmar e travar
                </button>
              )}

              {pedindoConfirm && (
                <>
                  <p style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px",
                    letterSpacing: ".06em", color: "var(--erro)",
                    marginTop: "10px", marginBottom: "8px",
                  }}>
                    ⚠ <strong>{selecao}</strong> será seu palpite definitivo — não poderá alterar.
                  </p>
                  <div className="form-linha">
                    <button className="botao" style={{ flex: 1 }} onClick={confirmar} disabled={confirmando}>
                      {confirmando ? "Travando…" : "Sim, travar!"}
                    </button>
                    <button className="botao-fantasma" onClick={() => setPedindoConfirm(false)} disabled={confirmando}>
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="secao-titulo" style={{ marginTop: "22px" }}>ARTILHEIRO DA COPA ⚽</div>

          {confirmadoArt ? (
            <div className="cartao meu-palpite" style={{ textAlign: "center", padding: "22px 16px" }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "11px", letterSpacing: ".14em",
                color: "var(--ambar)", marginBottom: "10px",
              }}>
                🔒 CONFIRMADO
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: ".03em" }}>
                {meuArt.jogador}
              </div>
            </div>
          ) : (
            <div className="cartao form-jogo">
              <div className="form-linha">
                <input
                  type="text"
                  placeholder="Nome do jogador…"
                  value={jogador}
                  onChange={(e) => mudarJogador(e.target.value)}
                  disabled={salvandoArt || confirmandoArt}
                  maxLength={80}
                />
                {salvandoArt && (
                  <span className="palpite-status" style={{ whiteSpace: "nowrap" }}>salvando…</span>
                )}
                {artSalvo && !salvandoArt && (
                  <span className="palpite-status ok" style={{ whiteSpace: "nowrap" }}>✓ salvo</span>
                )}
              </div>

              {artSalvo && !pedindoConfirmArt && (
                <button
                  className="botao botao-largo"
                  style={{ marginTop: "10px" }}
                  onClick={() => setPedindoConfirmArt(true)}
                  disabled={salvandoArt || confirmandoArt}
                >
                  🔒 Confirmar e travar
                </button>
              )}

              {pedindoConfirmArt && (
                <>
                  <p style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px",
                    letterSpacing: ".06em", color: "var(--erro)",
                    marginTop: "10px", marginBottom: "8px",
                  }}>
                    ⚠ <strong>{jogador.trim()}</strong> será seu palpite definitivo — não poderá alterar.
                  </p>
                  <div className="form-linha">
                    <button className="botao" style={{ flex: 1 }} onClick={confirmarArt} disabled={confirmandoArt}>
                      {confirmandoArt ? "Travando…" : "Sim, travar!"}
                    </button>
                    <button className="botao-fantasma" onClick={() => setPedindoConfirmArt(false)} disabled={confirmandoArt}>
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {aviso && <p className="dica toast" role="status">{aviso}</p>}
        </>
      )}

      <div className="secao-titulo">CAMPEÃO CONFIRMADO</div>
      {confirmados.length === 0 ? (
        <Vazio texto="Nenhum palpite confirmado ainda — seja o primeiro!" />
      ) : (
        confirmados.map((c, i) => (
          <div
            key={c.participante_id}
            className={"cartao palpite-linha entra-cartao" + (c.participante_id === euId ? " meu-palpite" : "")}
            style={{ "--i": Math.min(i, 8) }}
          >
            <span className="palpite-nome">
              {c.nome}{c.participante_id === euId ? " (você)" : ""}
            </span>
            <span className="pts pts-1">{c.selecao}</span>
          </div>
        ))
      )}

      <div className="secao-titulo">ARTILHEIRO CONFIRMADO</div>
      {confirmadosArt.length === 0 ? (
        <Vazio texto="Nenhum palpite confirmado ainda — seja o primeiro!" />
      ) : (
        confirmadosArt.map((c, i) => (
          <div
            key={c.participante_id}
            className={"cartao palpite-linha entra-cartao" + (c.participante_id === euId ? " meu-palpite" : "")}
            style={{ "--i": Math.min(i, 8) }}
          >
            <span className="palpite-nome">
              {c.nome}{c.participante_id === euId ? " (você)" : ""}
            </span>
            <span className="pts pts-1">{c.jogador}</span>
          </div>
        ))
      )}
    </div>
  );
}

/* ================= MODAL REGRAS ================= */
/* ================= MODAL PAGAMENTO ================= */
function ModalPagamento({ onFechar }) {
  const DEADLINE = new Date("2026-06-13T21:59:00Z");
  const [seg, setSeg] = useState(() => Math.max(0, Math.floor((DEADLINE - Date.now()) / 1000)));
  const [copiado, setCopiado] = useState(false);
  const PIX = "04554360024";

  useEffect(() => {
    if (seg <= 0) return;
    const id = setInterval(() => setSeg(Math.max(0, Math.floor((DEADLINE - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, []);

  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(PIX);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* silencioso */ }
  };

  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-painel modal-pagamento" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-nome">💸 Pagamento pendente</div>
          <button className="apagar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="pagamento-corpo">
          <p className="pagamento-aviso">Você ainda não confirmou seu pagamento.<br/>Garante sua vaga no bolão!</p>

          <div className="pagamento-valor">R$ 20,00</div>

          <div className="pagamento-pix-bloco">
            <span className="pagamento-pix-label">Chave PIX (CPF)</span>
            <div className="pagamento-pix-linha">
              <span className="pagamento-pix-chave">{PIX}</span>
              <button className="botao pagamento-copiar" onClick={copiarPix}>
                {copiado ? "✓ Copiado!" : "📋 Copiar"}
              </button>
            </div>
          </div>

          {seg > 0 && (
            <div className="pagamento-timer">
              <span className="timer-label">⏰ Prazo encerra em</span>
              <div className="timer-display">
                <span className="timer-bloco"><span className="timer-num">{pad(h)}</span><span className="timer-unidade">h</span></span>
                <span className="timer-sep">:</span>
                <span className="timer-bloco"><span className="timer-num">{pad(m)}</span><span className="timer-unidade">m</span></span>
                <span className="timer-sep">:</span>
                <span className="timer-bloco"><span className="timer-num">{pad(s)}</span><span className="timer-unidade">s</span></span>
              </div>
              <span className="timer-data">13/06 às 18:59</span>
            </div>
          )}

          <button className="botao-fantasma pagamento-fechar" onClick={onFechar}>
            Já paguei / fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalRegras({ onFechar }) {
  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-nome">📋 Regras do Bolão</div>
          <button className="apagar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="regras-corpo">
          <div className="regras-secao">Pontuação por jogo</div>
          <div className="regras-item">
            <span className="pts pts-3">3 pts</span>
            <span>Placar exato — acertou os dois gols</span>
          </div>
          <div className="regras-item">
            <span className="pts pts-1">1 pt</span>
            <span>Resultado certo — acertou quem ganhou ou que empatou</span>
          </div>
          <div className="regras-item">
            <span className="pts pts-0">0 pts</span>
            <span>Resultado errado</span>
          </div>

          <div className="regras-secao">Bônus especiais</div>
          <div className="regras-item">
            <span className="pts pts-3">+9 pts</span>
            <span>Acertar a seleção campeã (palpite travado antes da Copa)</span>
          </div>
          <div className="regras-item">
            <span className="pts pts-1">+6 pts</span>
            <span>Acertar o artilheiro da Copa (palpite travado antes da Copa)</span>
          </div>

          <div className="regras-secao">Mata-mata ⚔</div>
          <p className="regras-p">
            Nos jogos eliminatórios, o palpite vale pelo <strong>placar dos 90 minutos</strong>.
            Prorrogação e pênaltis <strong>não contam</strong>.
          </p>
          <p className="regras-p">
            Exemplo: jogo termina <strong>1×1</strong> nos 90min e vai a pênaltis
            → quem palpitou 1×1 ganha <strong>3 pts</strong>.
            Quem palpitou 2×1 ganha <strong>0 pts</strong>,
            mesmo que o placar da prorrogação seja 2×1.
          </p>

          <div className="regras-secao">Desempate (em caso de pontuação igual)</div>
          <div className="regras-item"><span className="pts pts-3">1º</span><span>Mais placares exatos</span></div>
          <div className="regras-item"><span className="pts pts-3">2º</span><span>Acertou a seleção campeã</span></div>
          <div className="regras-item"><span className="pts pts-3">3º</span><span>Acertou o artilheiro da Copa</span></div>
          <div className="regras-item"><span className="pts pts-1">4º</span><span>Mais resultados certos</span></div>
          <div className="regras-item"><span className="pts pts-0">5º</span><span>Quem enviou o primeiro palpite mais cedo</span></div>

          <div className="regras-secao">Prêmio 🏆</div>
          <p className="regras-p">
            O <strong>1º lugar</strong> no ranking final leva o valor total em caixa (R$ 20 × número de participantes).
            Em caso de empate técnico após todos os critérios de desempate, o prêmio é dividido igualmente entre os empatados.
          </p>

          <div className="regras-secao">Travamento de palpites</div>
          <p className="regras-p">
            Palpites são bloqueados automaticamente no minuto do apito inicial.
            Nenhum palpite dos outros participantes é visível antes disso — ninguém copia ninguém.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= PRÓXIMO JOGO ================= */
function ProximoCountdown({ kickoff, offsetMs }) {
  const calc = useCallback(
    () => new Date(kickoff).getTime() - (Date.now() + offsetMs),
    [kickoff, offsetMs]
  );
  const [restante, setRestante] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setRestante(calc()), 1000);
    return () => clearInterval(id);
  }, [calc]);

  if (restante <= 0) return <span className="prox-tempo">em breve</span>;
  const h = Math.floor(restante / 3600000);
  const min = Math.floor((restante % 3600000) / 60000);
  const seg = Math.floor((restante % 60000) / 1000);
  const tempo = h > 0
    ? `${h}h ${String(min).padStart(2, "0")}min`
    : min > 0
    ? `${min}m ${String(seg).padStart(2, "0")}s`
    : `${seg}s`;
  return <span className="prox-tempo">⏱ {tempo}</span>;
}

function ProximoJogo({ jogos, offsetMs = 0, onFechar, onNavegar }) {
  const agora = () => new Date(Date.now() + offsetMs);

  const aoVivo = jogos
    .filter((m) => !temResultado(m) && m.kickoff && new Date(m.kickoff) <= agora())
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];

  const proximo = jogos
    .filter((m) => !temResultado(m) && m.kickoff && new Date(m.kickoff) > agora())
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];

  const jogo = aoVivo || proximo;
  if (!jogo) return null;

  return (
    <div
      className={"prox-jogo entra-2" + (aoVivo ? " prox-jogo-vivo" : "")}
      onClick={() => onNavegar(jogo.id)}
      style={{ cursor: "pointer" }}
      title="Abrir palpites deste jogo"
    >
      {aoVivo ? (
        <><span className="prox-vivo-dot" aria-hidden="true" /><span className="prox-label">AO VIVO</span></>
      ) : (
        <span className="prox-label">PRÓXIMO</span>
      )}
      <span className="prox-times">
        {fl(jogo.casa)}{jogo.casa} <span className="vs">×</span> {fl(jogo.fora)}{jogo.fora}
      </span>
      {proximo && !aoVivo && <ProximoCountdown kickoff={proximo.kickoff} offsetMs={offsetMs} />}
      <button
        className="prox-fechar"
        onClick={(e) => { e.stopPropagation(); onFechar(); }}
        aria-label="Fechar banner"
      >✕</button>
    </div>
  );
}

/* ================= MODAL PALPITES ================= */
function ModalPalpites({ participante, jogos, palpitesMap, euId, onFechar }) {
  const encerrados = [...jogos]
    .filter(temResultado)
    .sort((a, b) => {
      if (!a.kickoff && !b.kickoff) return 0;
      if (!a.kickoff) return 1;
      if (!b.kickoff) return -1;
      return new Date(b.kickoff) - new Date(a.kickoff);
    });

  let totalPts = 0, totalExatos = 0, totalResultados = 0;
  for (const m of encerrados) {
    const pts = pontosDoPalpite(palpitesMap[m.id]?.[participante.id], m);
    if (pts === PTS_EXATO) { totalExatos++; totalPts += pts; }
    else if (pts === PTS_RESULTADO) { totalResultados++; totalPts += pts; }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Avatar nome={participante.nome} emoji={participante.avatarEmoji} cor={participante.avatarCor} size={44} />
            <div>
              <div className="modal-nome">
                {participante.nome}{participante.id === euId ? " (você)" : ""}
              </div>
              <div className="modal-stats">
                {totalPts} pts · {totalExatos} exato{totalExatos !== 1 ? "s" : ""} · {totalResultados} resultado{totalResultados !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
          <button className="apagar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {encerrados.length === 0 && <Vazio texto="Nenhum jogo encerrado ainda." />}

        {encerrados.map((m, i) => {
          const palpite = palpitesMap[m.id]?.[participante.id];
          const pts = pontosDoPalpite(palpite, m);
          const cls = "modal-jogo"
            + (pts === PTS_EXATO ? " modal-jogo-exato" : "")
            + (pts === PTS_RESULTADO ? " modal-jogo-ok" : "")
            + (pts === 0 ? " modal-jogo-miss" : "");
          return (
            <div key={m.id} className={cls} style={{ "--i": Math.min(i, 14) }}>
              <div className="modal-jogo-times">
                {fl(m.casa)}{m.casa}
                <span className="modal-placar-final">{m.gh}–{m.ga}</span>
                {fl(m.fora)}{m.fora}
              </div>
              <div className="modal-jogo-direita">
                {palpite
                  ? <span className="modal-palpite">{palpite.h}–{palpite.a}</span>
                  : <span className="modal-sem-palpite">sem palpite</span>
                }
                {pts === PTS_EXATO    && <span className="pts pts-3">🎯</span>}
                {pts === PTS_RESULTADO && <span className="pts pts-1">✓</span>}
                {pts === 0            && <span className="pts pts-0">✕</span>}
                {pts === null         && <span className="pts pts-0">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Vazio({ texto }) {
  return (
    <div className="vazio">
      <span className="bola-quica" aria-hidden="true">⚽</span>
      <span>{texto}</span>
    </div>
  );
}

/* ================= ESTILO ================= */
function Estilo() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;800&family=IBM+Plex+Mono:wght@500;700&display=swap');

      .bolao-root {
        --grama: #071a0e;
        --grama2: #0b2a17;
        --linha: rgba(255,255,255,.28);
        --giz: #f2f6ef;
        --ambar: #ffc53d;
        --ambar-escuro: #1a1408;
        --erro: #ff7b6b;
        --t: .22s cubic-bezier(.2,.7,.3,1);
        min-height: 100vh;
        background-color: #071a0e;
        background-image:
          radial-gradient(ellipse 110% 55% at 50% 48%, rgba(18,72,38,0.7) 0%, transparent 68%),
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 68 105'%3E%3Cg stroke='white' stroke-width='0.6' fill='none' opacity='0.13'%3E%3Crect x='1' y='1' width='66' height='103'/%3E%3Cline x1='1' y1='52.5' x2='67' y2='52.5'/%3E%3Ccircle cx='34' cy='52.5' r='9.15'/%3E%3Ccircle cx='34' cy='52.5' r='0.8' fill='white'/%3E%3Crect x='13.84' y='1' width='40.32' height='16.5'/%3E%3Crect x='13.84' y='87.5' width='40.32' height='16.5'/%3E%3Crect x='24.84' y='1' width='18.32' height='5.5'/%3E%3Crect x='24.84' y='98' width='18.32' height='5.5'/%3E%3Ccircle cx='34' cy='12' r='0.8' fill='white'/%3E%3Ccircle cx='34' cy='93' r='0.8' fill='white'/%3E%3Cpath d='M27 17.5 A9.15 9.15 0 0 1 41 17.5'/%3E%3Cpath d='M27 87.5 A9.15 9.15 0 0 0 41 87.5'/%3E%3Cpath d='M1 4 A3 3 0 0 1 4 1'/%3E%3Cpath d='M64 1 A3 3 0 0 1 67 4'/%3E%3Cpath d='M67 101 A3 3 0 0 1 64 104'/%3E%3Cpath d='M4 104 A3 3 0 0 1 1 101'/%3E%3C/g%3E%3C/svg%3E");
        background-size: auto, 100%;
        background-position: center, center top;
        background-repeat: no-repeat, no-repeat;
        color: var(--giz);
        font-family: 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif;
        padding: 28px 16px 64px;
        max-width: 680px;
        margin: 0 auto;
        box-sizing: border-box;
        color-scheme: dark;
        position: relative;
      }
      .bolao-root *, .bolao-root *::before, .bolao-root *::after { box-sizing: border-box; }

      .bolao-root::before {
        content: '';
        position: fixed; inset: 0; pointer-events: none;
        background: radial-gradient(ellipse 120% 60% at 50% -12%, rgba(255,255,255,.12), transparent 60%);
      }

      @keyframes sobe { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      .entra-1 { animation: sobe .55s var(--t) both; }
      .entra-2 { animation: sobe .55s var(--t) .12s both; }
      .conteudo-aba { animation: sobe .4s var(--t) both; }
      .entra-3 { animation: sobe .55s var(--t) .3s both; }
      .entra-cartao { animation: sobe .45s var(--t) both; animation-delay: calc(var(--i, 0) * 50ms); }

      .topo {
        text-align: center; margin-bottom: 28px;
        padding: 8px 0 0;
      }
      .topo-acoes {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 28px;
      }
      .topo-eyebrow {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px; letter-spacing: .22em; text-transform: uppercase;
        color: rgba(255,255,255,.38); margin-bottom: 4px;
      }
      .topo-titulo {
        margin: 0; font-weight: 800;
        font-size: clamp(36px, 10vw, 72px);
        letter-spacing: .04em; line-height: 1;
        text-shadow: 0 4px 0 rgba(0,0,0,.45), 0 0 40px rgba(255,197,61,.12);
      }
      .topo-divider {
        width: 48px; height: 2px;
        background: var(--ambar);
        margin: 14px auto 12px;
        opacity: .7;
      }
      .topo-stats {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
        color: var(--ambar);
      }
      .topo-stats-sep { opacity: .35; }
      .prox-jogo {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 9px 14px; margin-bottom: 10px;
        background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.18);
        animation: sobe .4s var(--t) .15s both;
      }
      .prox-jogo-vivo { border-color: var(--erro); background: rgba(255,123,107,.07); }
      .prox-vivo-dot {
        width: 8px; height: 8px; border-radius: 50%; background: var(--erro); flex: none;
        animation: pulsa-cd .85s ease-in-out infinite;
      }
      .prox-label {
        font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700;
        letter-spacing: .14em; color: var(--ambar); flex: none;
      }
      .prox-jogo-vivo .prox-label { color: var(--erro); }
      .prox-times { font-size: 17px; font-weight: 800; letter-spacing: .03em; flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .prox-tempo {
        font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700;
        color: var(--ambar); flex: none; margin-left: auto;
      }
      .prox-fechar {
        flex: none; background: transparent; border: none; cursor: pointer;
        color: var(--giz); opacity: .45; font-size: 13px; padding: 0 2px; line-height: 1;
        transition: opacity var(--t);
      }
      .prox-fechar:hover { opacity: 1; }

      .abas { display: flex; gap: 0; border: 2px solid var(--linha); margin-bottom: 18px; background: rgba(0,0,0,.18); }
      .aba {
        flex: 1; padding: 10px 4px; background: transparent; color: var(--giz);
        border: none; border-right: 2px solid var(--linha);
        font: 600 16px 'Barlow Condensed', sans-serif; letter-spacing: .08em;
        text-transform: uppercase; cursor: pointer;
        transition: background-color var(--t), color var(--t), box-shadow var(--t);
      }
      .aba:last-child { border-right: none; }
      .aba:hover:not(.ativa) { background: rgba(255,255,255,.07); }
      .aba.ativa {
        background: var(--ambar); color: var(--ambar-escuro); font-weight: 800;
        box-shadow: inset 0 -3px 0 rgba(0,0,0,.22);
      }
      .aba:focus-visible { outline: 3px solid var(--ambar); outline-offset: -3px; }

      .cartao {
        border: 2px solid var(--linha);
        background: rgba(0,0,0,.22);
        padding: 12px 14px; margin-bottom: 10px;
        transition: border-color var(--t), transform var(--t), background-color var(--t);
      }
      .cartao:hover { border-color: rgba(255,255,255,.5); }
      .meu-palpite { border-color: var(--ambar); background: rgba(255,197,61,.07); }

      .secao-titulo {
        font-family: 'IBM Plex Mono', monospace; font-size: 10px;
        letter-spacing: .14em; color: var(--ambar);
        margin: 16px 0 8px;
      }

      .form-linha { display: flex; gap: 8px; align-items: center; }
      .form-jogo .form-linha + .form-linha { margin-top: 8px; }
      .check-admin {
        display: flex; align-items: center; gap: 8px; margin-top: 8px;
        font-size: 14px; letter-spacing: .03em; opacity: .85; cursor: pointer;
      }
      .check-admin input { width: auto; }

      input, .seletor {
        width: 100%; min-width: 0;
        background: rgba(0,0,0,.35); color: var(--giz);
        border: 2px solid var(--linha); padding: 9px 10px;
        font: 600 16px 'Barlow Condensed', sans-serif; letter-spacing: .03em;
        transition: border-color var(--t), box-shadow var(--t), opacity var(--t);
      }
      input::placeholder { color: rgba(242,246,239,.45); }
      input:hover:not(:disabled), .seletor:hover { border-color: rgba(255,255,255,.45); }
      input:focus, .seletor:focus { border-color: var(--ambar); box-shadow: 0 0 0 3px rgba(255,197,61,.22); outline: none; }
      input:disabled { opacity: .45; cursor: not-allowed; }
      input:focus-visible, .seletor:focus-visible, .botao:focus-visible,
      .apagar:focus-visible, .botao-fantasma:focus-visible, .aba:focus-visible {
        outline: 3px solid var(--ambar); outline-offset: 1px;
      }
      input[type="number"] {
        width: 58px; text-align: center;
        font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 17px;
        -moz-appearance: textfield;
      }
      input[type="number"]::-webkit-outer-spin-button,
      input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input[type="datetime-local"] {
        font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 500;
      }

      .seletor { margin-bottom: 12px; cursor: pointer; }

      .lista-campeao {
        max-height: 230px; overflow-y: auto;
        border: 2px solid var(--linha); border-top: none;
        background: rgba(0,0,0,.28);
        scrollbar-width: thin; scrollbar-color: var(--linha) transparent;
        margin-bottom: 0;
      }
      .lista-campeao::-webkit-scrollbar { width: 5px; }
      .lista-campeao::-webkit-scrollbar-track { background: transparent; }
      .lista-campeao::-webkit-scrollbar-thumb { background: var(--linha); border-radius: 3px; }

      .campeao-item {
        display: flex; align-items: center; gap: 8px;
        width: 100%; padding: 10px 14px;
        border: none; border-bottom: 1px solid rgba(255,255,255,.06);
        background: transparent; color: var(--giz); text-align: left;
        cursor: pointer; font: 600 16px 'Barlow Condensed', sans-serif;
        letter-spacing: .04em; transition: background-color var(--t);
      }
      .campeao-item:last-child { border-bottom: none; }
      .campeao-item:hover:not(:disabled):not(.campeao-item-ativo) { background: rgba(255,255,255,.06); }
      .campeao-item:disabled { cursor: wait; }
      .campeao-item-ativo {
        background: rgba(255,197,61,.13);
        border-left: 3px solid var(--ambar);
        color: var(--ambar); font-weight: 800;
      }
      .campeao-item-nome { flex: 1; }
      .campeao-vazio {
        padding: 12px 14px; margin: 0;
        font-family: 'IBM Plex Mono', monospace; font-size: 12px; opacity: .5;
      }

      .seletor-jogos {
        max-height: 50vh;
        overflow-y: auto;
        border: 2px solid var(--linha);
        margin-bottom: 14px;
        background: rgba(0,0,0,.22);
        scrollbar-width: thin;
        scrollbar-color: var(--linha) transparent;
      }
      .seletor-jogos::-webkit-scrollbar { width: 6px; }
      .seletor-jogos::-webkit-scrollbar-track { background: transparent; }
      .seletor-jogos::-webkit-scrollbar-thumb { background: var(--linha); border-radius: 3px; }

      .seletor-jogo {
        display: flex; align-items: center; gap: 9px;
        width: 100%; padding: 9px 12px;
        border: none; border-bottom: 1px solid rgba(255,255,255,.07);
        background: transparent; color: var(--giz); text-align: left;
        cursor: pointer; font: 600 15px 'Barlow Condensed', sans-serif;
        letter-spacing: .03em; transition: background-color var(--t);
      }
      .seletor-jogo:last-child { border-bottom: none; }
      .seletor-jogo:hover:not(.sj-ativo) { background: rgba(255,255,255,.05); }
      .seletor-jogo:focus-visible { outline: 2px solid var(--ambar); outline-offset: -2px; }

      .sj-ativo { background: rgba(255,197,61,.1); border-left: 3px solid var(--ambar) !important; }

      .sj-dot {
        width: 8px; height: 8px; border-radius: 50%; flex: none;
        transition: background-color var(--t);
      }
      .sj-aberto .sj-dot { background: #7ee2a0; box-shadow: 0 0 6px rgba(126,226,160,.5); }
      .sj-trav   .sj-dot { background: var(--ambar); box-shadow: 0 0 6px rgba(255,197,61,.4); }
      .sj-enc    .sj-dot { background: rgba(255,255,255,.25); }
      .sj-enc { opacity: .65; }

      .sj-nome { flex: 1; }
      .sj-quando {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 11px; opacity: .6; white-space: nowrap; flex-shrink: 0;
      }
      .sj-placar {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 13px; font-weight: 700;
        color: var(--ambar); white-space: nowrap; flex-shrink: 0;
      }

      .botao {
        background: var(--ambar); color: var(--ambar-escuro);
        border: none; padding: 10px 18px; cursor: pointer;
        font: 800 15px 'Barlow Condensed', sans-serif;
        letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
        transition: transform var(--t), box-shadow var(--t), filter var(--t), opacity var(--t);
        box-shadow: 0 2px 0 rgba(0,0,0,.3);
      }
      .botao:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 3px 0 rgba(0,0,0,.3); }
      .botao:active:not(:disabled) { transform: translateY(1px) scale(.99); box-shadow: 0 0 0 rgba(0,0,0,.3); }
      .botao:disabled { opacity: .55; cursor: wait; }
      .botao-largo { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px; font-size: 16px; }
      .linha-botoes { display: flex; gap: 8px; margin-bottom: 10px; }

      .spinner {
        width: 14px; height: 14px; border-radius: 50%;
        border: 2.5px solid rgba(26,20,8,.3); border-top-color: var(--ambar-escuro);
        animation: gira .7s linear infinite; flex: none;
      }
      @keyframes gira { to { transform: rotate(360deg); } }

      .botao-fantasma {
        background: transparent; color: var(--ambar);
        border: 2px solid var(--ambar); padding: 6px 12px; cursor: pointer;
        font: 700 13px 'Barlow Condensed', sans-serif;
        letter-spacing: .06em; text-transform: uppercase; white-space: nowrap;
        transition: background-color var(--t), transform var(--t);
      }
      .botao-fantasma:hover { background: rgba(255,197,61,.12); transform: translateY(-1px); }
      .botao-fantasma:active { transform: none; }

      .apagar {
        background: transparent; color: var(--erro);
        border: 2px solid transparent; cursor: pointer;
        font-size: 15px; padding: 4px 8px;
        transition: border-color var(--t), transform var(--t); opacity: .75;
      }
      .apagar:hover { border-color: var(--erro); opacity: 1; transform: scale(1.06); }

      .badge-pago, .badge-pendente {
        font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700;
        padding: 3px 8px; border-radius: 4px; white-space: nowrap;
      }
      .badge-pago { background: #14532d; color: #86efac; }
      .badge-pendente { background: #451a03; color: #fcd34d; }
      .badge-btn {
        border: none; cursor: pointer;
        transition: opacity var(--t), transform var(--t);
      }
      .badge-btn:hover { opacity: .8; transform: scale(1.05); }
      .badge-btn:disabled { opacity: .5; cursor: default; transform: none; }

      .resumo-pagamento {
        background: #1a1a1a; border: 1px solid #333; border-radius: 8px;
        padding: 10px 14px; margin-bottom: 8px;
      }
      .resumo-pagamento-txt { font-size: 13px; color: #ccc; }

      .timer-pagamento {
        background: linear-gradient(135deg, #1a0a00, #2a1200);
        border: 1px solid #92400e; border-radius: 10px;
        padding: 12px 16px; margin-bottom: 12px;
        display: flex; flex-direction: column; align-items: center; gap: 6px;
      }
      .timer-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; color: #fbbf24; text-transform: uppercase; }
      .timer-display { display: flex; align-items: center; gap: 4px; }
      .timer-bloco { display: flex; align-items: baseline; gap: 1px; }
      .timer-num {
        font-family: 'IBM Plex Mono', monospace; font-size: 28px; font-weight: 700;
        color: #fcd34d; line-height: 1;
      }
      .timer-unidade { font-size: 11px; color: #d97706; font-weight: 600; }
      .timer-sep { font-family: 'IBM Plex Mono', monospace; font-size: 22px; color: #92400e; font-weight: 700; padding: 0 2px; }
      .timer-data { font-size: 11px; color: #78350f; }

      .modal-pagamento { max-width: 340px; }
      .pagamento-corpo {
        display: flex; flex-direction: column; align-items: center;
        gap: 18px; padding: 4px 0 8px;
      }
      .pagamento-aviso { text-align: center; font-size: 14px; color: #ccc; line-height: 1.5; margin: 0; }
      .pagamento-valor {
        font-family: 'IBM Plex Mono', monospace; font-size: 42px; font-weight: 700;
        color: #4ade80; letter-spacing: -.02em;
      }
      .pagamento-pix-bloco {
        width: 100%; background: #111; border: 1px solid #333;
        border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
      }
      .pagamento-pix-label { font-size: 10px; font-weight: 700; letter-spacing: .08em; color: #888; text-transform: uppercase; }
      .pagamento-pix-linha { display: flex; align-items: center; gap: 10px; }
      .pagamento-pix-chave {
        font-family: 'IBM Plex Mono', monospace; font-size: 16px; color: #e2e8f0; flex: 1;
        letter-spacing: .04em;
      }
      .pagamento-copiar { padding: 6px 12px; font-size: 13px; white-space: nowrap; }
      .pagamento-timer {
        width: 100%; background: linear-gradient(135deg, #1a0a00, #2a1200);
        border: 1px solid #92400e; border-radius: 10px;
        padding: 12px 16px; display: flex; flex-direction: column; align-items: center; gap: 6px;
      }
      .pagamento-fechar { width: 100%; justify-content: center; opacity: .6; font-size: 13px; }

      .vs { opacity: .6; font-weight: 800; }

      .grupo-data-header {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
        color: var(--ambar); padding: 16px 2px 6px;
        border-bottom: 1px solid rgba(255,197,61,.25);
        margin-bottom: 8px;
      }
      .grupo-data-header:first-child { padding-top: 4px; }

      .nav-data {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; margin-bottom: 12px;
        padding: 6px 0;
        border-bottom: 1px solid rgba(255,255,255,.1);
      }
      .nav-data-nav {
        display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;
      }
      .nav-data-seta {
        flex: none; width: 34px; height: 34px;
        background: rgba(0,0,0,.3); border: 2px solid var(--linha);
        color: var(--giz); cursor: pointer; font-size: 20px; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        transition: border-color var(--t), background-color var(--t), opacity var(--t);
      }
      .nav-data-seta:hover:not(:disabled) {
        border-color: rgba(255,255,255,.45); background: rgba(255,255,255,.07);
      }
      .nav-data-seta:disabled { opacity: .3; cursor: default; }
      .nav-data-label {
        flex: 1; text-align: center; min-width: 0;
        font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700;
        letter-spacing: .1em; text-transform: uppercase; color: var(--ambar);
        transition: opacity var(--t); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .nav-data-label-dim { opacity: .35; }
      .nav-ao-vivo {
        flex: none; display: flex; align-items: center; gap: 6px;
        padding: 6px 12px;
        background: rgba(0,0,0,.3); border: 2px solid rgba(255,123,107,.4);
        color: rgba(255,123,107,.85); cursor: pointer; white-space: nowrap;
        font: 700 11px 'IBM Plex Mono', monospace; letter-spacing: .08em; text-transform: uppercase;
        transition: border-color var(--t), background-color var(--t), color var(--t);
      }
      .nav-ao-vivo:hover { border-color: var(--erro); color: var(--erro); background: rgba(255,123,107,.08); }
      .nav-ao-vivo-ativo {
        background: rgba(255,123,107,.15); border-color: var(--erro);
        color: var(--erro); box-shadow: 0 0 12px rgba(255,123,107,.25);
      }
      .nav-vivo-dot {
        width: 7px; height: 7px; border-radius: 50%; flex: none;
        background: var(--erro); animation: pulsa-cd .85s ease-in-out infinite;
      }
      .nav-sem-jogos {
        font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: .06em;
        color: rgba(255,255,255,.45); text-align: center;
        padding: 32px 16px; border: 2px dashed rgba(255,255,255,.12);
        margin-top: 4px;
      }

      .seletor-data-header {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
        color: var(--ambar); padding: 6px 12px 5px;
        background: rgba(0,0,0,.4);
        border: none; border-bottom: 1px solid rgba(255,197,61,.2);
        position: sticky; top: 0; z-index: 1;
        cursor: pointer;
      }
      .seletor-data-header:hover { background: rgba(255,197,61,.08); }
      .seletor-data-info { display: flex; align-items: center; gap: 7px; }
      .seletor-data-cnt {
        font-size: 9px; opacity: .65;
        background: rgba(255,197,61,.15); border-radius: 3px; padding: 1px 5px;
      }
      .seletor-data-chevron { font-size: 11px; opacity: .8; }

      .flag-img { display: inline-block; vertical-align: middle; border-radius: 2px; margin-right: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.4); }

      .jogo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .jogo.encerrado { border-color: var(--ambar); }
      .jogo-info { flex: 1; min-width: 160px; }
      .jogo-times { font-size: 19px; font-weight: 800; letter-spacing: .03em; }
      .jogo-meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap; }
      .jogo-quando { font-family: 'IBM Plex Mono', monospace; font-size: 11px; opacity: .7; }
      .jogo-resultado { display: flex; align-items: center; gap: 6px; }

      .placar-final {
        font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 20px;
        color: var(--ambar); text-shadow: 0 0 10px rgba(255,197,61,.5);
        white-space: nowrap;
      }
      .placar-vivo {
        display: flex; align-items: center; gap: 6px;
        font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 20px;
        color: var(--erro); white-space: nowrap;
      }
      .placar-vivo-dot {
        width: 8px; height: 8px; border-radius: 50%; flex: none;
        background: var(--erro); animation: pulsa-cd .85s ease-in-out infinite;
      }

      .tag {
        font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700;
        letter-spacing: .06em; padding: 2px 6px; white-space: nowrap;
        animation: pop .3s var(--t) both;
      }
      @keyframes pop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
      .tag-pendente { border: 1.5px solid var(--erro); color: var(--erro); }
      .tag-ok { border: 1.5px solid rgba(255,255,255,.35); opacity: .8; }
      .tag-travado { background: var(--ambar); color: var(--ambar-escuro); }

      .countdown {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 5px 8px; margin-top: 6px;
        font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: .05em;
        border-left: 3px solid; animation: sobe .3s var(--t) both;
      }
      .cd-ok      { border-color: rgba(255,255,255,.25); opacity: .7; }
      .cd-atencao { border-color: var(--ambar); color: var(--ambar); }
      .cd-alerta  { border-color: var(--ambar); color: var(--ambar); background: rgba(255,197,61,.07); padding: 6px 8px; }
      .cd-critico {
        border-color: var(--erro); color: var(--erro); background: rgba(255,123,107,.1); padding: 6px 8px;
        animation: pulsa-cd .85s ease-in-out infinite;
      }
      @keyframes pulsa-cd {
        0%, 100% { opacity: 1; }
        50%       { opacity: .55; }
      }
      .cd-msg   { flex: 1; }
      .cd-tempo { font-weight: 700; white-space: nowrap; }

      .trava-aviso {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; flex-wrap: wrap;
        border: 2px solid var(--ambar); background: rgba(255,197,61,.1);
        padding: 10px 12px; margin-bottom: 12px;
        font-size: 15px; letter-spacing: .03em;
        animation: sobe .35s var(--t) both;
      }

      .palpite-linha { display: flex; align-items: center; gap: 10px; }
      .palpite-nome { flex: 1; font-size: 18px; font-weight: 600; letter-spacing: .03em; display: flex; align-items: center; gap: 8px; overflow: hidden; min-width: 0; }
      .palpite-inputs { display: flex; align-items: center; gap: 6px; }
      .palpite-time-flag { display: flex; align-items: center; opacity: .75; line-height: 1; }
      .palpite-status {
        font-family: 'IBM Plex Mono', monospace; font-size: 10px;
        letter-spacing: .06em; opacity: .7; white-space: nowrap;
      }
      .palpite-status.ok { color: #7ee2a0; opacity: 1; }
      .palpite-status.erro { color: var(--erro); opacity: 1; }

      .pts {
        font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700;
        padding: 3px 7px; margin-left: 6px; white-space: nowrap;
        animation: pop .35s var(--t) both;
      }
      .pts-3 { background: var(--ambar); color: var(--ambar-escuro); box-shadow: 0 0 14px rgba(255,197,61,.45); }
      .pts-1 { border: 1.5px solid var(--ambar); color: var(--ambar); }
      .pts-0 { border: 1.5px solid var(--linha); opacity: .6; }

      .placar {
        border: 3px solid var(--giz); background: rgba(0,0,0,.45);
        box-shadow: 0 10px 30px rgba(0,0,0,.35), inset 0 0 40px rgba(0,0,0,.4);
      }
      .placar-cab, .placar-linha {
        display: grid;
        grid-template-columns: 34px 1fr 64px 64px 72px;
        align-items: center; gap: 4px;
        padding: 10px 12px;
      }
      .placar-cab {
        font-family: 'IBM Plex Mono', monospace; font-size: 10px;
        letter-spacing: .12em; color: var(--ambar);
        border-bottom: 2px solid var(--linha);
      }
      .placar-linha {
        border-bottom: 1px solid rgba(255,255,255,.12);
        font-size: 18px; font-weight: 600;
        animation: sobe .45s var(--t) both; animation-delay: calc(var(--i, 0) * 60ms);
        transition: background-color var(--t);
      }
      .placar-linha:hover { background: rgba(255,255,255,.05); }
      .placar-linha:last-child { border-bottom: none; }
      .podio-ouro  { background: rgba(255,197,61,.14); border-left: 3px solid #ffc53d; }
      .podio-prata { background: rgba(200,200,210,.08); border-left: 3px solid #b8b8cc; }
      .podio-bronze{ background: rgba(180,100,40,.08);  border-left: 3px solid #b87040; }
      .podio-ouro:hover  { background: rgba(255,197,61,.22) !important; }
      .podio-prata:hover { background: rgba(200,200,210,.14) !important; }
      .podio-bronze:hover{ background: rgba(180,100,40,.14) !important; }
      .col-pos-medal { font-size: 18px; opacity: 1; }
      .bonus-badge {
        font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700;
        color: #7ee2a0; border: 1.5px solid #7ee2a0; padding: 1px 5px;
        white-space: nowrap; flex: none;
      }
      .trend-up   { font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700; color: #7ee2a0; white-space: nowrap; flex: none; }
      .trend-down { font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700; color: var(--erro); white-space: nowrap; flex: none; }

      .modal-overlay {
        position: fixed; inset: 0; z-index: 100;
        background: rgba(0,0,0,.7); backdrop-filter: blur(3px);
        display: flex; align-items: flex-end; justify-content: center;
        animation: fade-modal .2s ease both;
      }
      @keyframes fade-modal { from { opacity: 0; } to { opacity: 1; } }
      .modal-painel {
        width: 100%; max-width: 680px; max-height: 84vh; overflow-y: auto;
        background: var(--grama); border: 2px solid var(--linha); border-bottom: none;
        padding: 18px 16px 48px;
        animation: sobe .28s var(--t) both;
        scrollbar-width: thin; scrollbar-color: var(--linha) transparent;
      }
      .modal-painel::-webkit-scrollbar { width: 5px; }
      .modal-painel::-webkit-scrollbar-thumb { background: var(--linha); border-radius: 3px; }
      .modal-header {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 16px; padding-bottom: 14px;
        border-bottom: 1px solid var(--linha);
      }
      .modal-nome { font-size: 22px; font-weight: 800; letter-spacing: .03em; }
      .modal-stats { font-family: 'IBM Plex Mono', monospace; font-size: 10px; opacity: .7; letter-spacing: .1em; margin-top: 3px; }
      .modal-jogo {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.07);
        font-size: 14px; font-weight: 600;
        animation: sobe .35s var(--t) both; animation-delay: calc(var(--i, 0) * 22ms);
      }
      .modal-jogo:last-child { border-bottom: none; }
      .modal-jogo-exato { background: rgba(255,197,61,.08); border-left: 3px solid var(--ambar); }
      .modal-jogo-ok    { border-left: 3px solid rgba(255,255,255,.2); }
      .modal-jogo-miss  { opacity: .45; }
      .modal-jogo-times { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .modal-placar-final { font-family: 'IBM Plex Mono', monospace; font-size: 12px; opacity: .55; margin: 0 4px; }
      .modal-jogo-direita { display: flex; align-items: center; gap: 8px; flex: none; }
      .modal-palpite { font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 700; color: var(--ambar); }
      .modal-sem-palpite { font-family: 'IBM Plex Mono', monospace; font-size: 11px; opacity: .3; }

      @keyframes gol {
        0%   { opacity: 0; transform: translate(-50%, 4px) scale(.6); }
        18%  { opacity: 1; transform: translate(-50%, -8px) scale(1.25); }
        55%  { opacity: 1; transform: translate(-50%, -6px) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -20px) scale(.85); }
      }
      .gol-burst {
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, 0);
        font-family: 'Barlow Condensed', sans-serif;
        font-weight: 800; font-size: 20px; letter-spacing: .12em;
        color: var(--ambar); text-shadow: 0 2px 10px rgba(0,0,0,.6);
        pointer-events: none; white-space: nowrap; z-index: 4;
        animation: gol 1.8s ease-out forwards;
      }
      .col-pos { font-family: 'IBM Plex Mono', monospace; font-size: 13px; opacity: .7; }
      .col-nome { display: flex; flex-direction: column; justify-content: center; overflow: hidden; min-width: 0; gap: 2px; }
      .col-nome-inner { display: flex; align-items: center; gap: 7px; overflow: hidden; min-width: 0; }
      .col-detalhe-mobile { display: none; }
      .col-num {
        text-align: center; font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 700;
        border-left: 1px solid rgba(255,255,255,.08); padding-left: 4px;
      }
      .col-num-hd { font-size: 9px; font-weight: 400; line-height: 1.6; letter-spacing: .1em; }
      .col-pts { text-align: right; border-left: 1px solid rgba(255,255,255,.12); padding-left: 6px; }

      .avatar {
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-weight: 800; font-family: 'Barlow Condensed', sans-serif; letter-spacing: .02em;
        flex: none; user-select: none; color: rgba(0,0,0,.72);
        box-shadow: 0 1px 5px rgba(0,0,0,.35); overflow: hidden;
      }

      .avatar-header-btn {
        background: transparent; border: none; cursor: pointer; padding: 0;
        transition: transform var(--t), opacity var(--t);
      }
      .avatar-header-btn:hover { transform: scale(1.08); opacity: .85; }

      .regras-btn {
        width: 34px; height: 34px; border-radius: 50%;
        background: transparent; border: 2px solid rgba(255,255,255,.18);
        cursor: pointer; color: var(--giz); opacity: .5;
        font-family: 'IBM Plex Mono', monospace; font-size: 15px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        transition: opacity var(--t), border-color var(--t);
      }
      .regras-btn:hover { opacity: 1; border-color: rgba(255,255,255,.5); }

      .regras-corpo { padding: 4px 16px 20px; overflow-y: auto; }
      .regras-secao {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
        color: var(--ambar); margin: 20px 0 10px;
      }
      .regras-secao:first-child { margin-top: 8px; }
      .regras-item { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 14px; }
      .regras-p { font-size: 13px; line-height: 1.55; margin: 0 0 8px; opacity: .85; }

      .tag-elim {
        background: rgba(58,157,224,.15); color: #7ec8e3;
        border: 1px solid rgba(58,157,224,.35);
      }
      .aviso-90min {
        font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700;
        color: var(--ambar); opacity: .75; white-space: nowrap; flex: none;
        border: 1px solid rgba(255,197,61,.3); border-radius: 4px; padding: 2px 5px;
      }
      .select-fase {
        background: var(--fundo); border: 2px solid var(--linha); color: var(--giz);
        font-family: 'IBM Plex Mono', monospace; font-size: 11px;
        padding: 6px 8px; border-radius: 0; flex: none;
      }
      .botao-zap { border-color: rgba(37,211,102,.45); color: #5ddb85; }
      .botao-zap:hover:not(:disabled) { background: rgba(37,211,102,.12); border-color: rgba(37,211,102,.8); }
      .botao-zap:disabled { border-color: var(--linha); color: var(--giz); opacity: .35; }

      .desempate-badge {
        font-family: 'IBM Plex Mono', monospace; font-size: 9px; font-weight: 700;
        background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
        color: rgba(255,255,255,0.45); padding: 1px 5px; border-radius: 3px;
        white-space: nowrap; letter-spacing: .03em;
      }

      .notif-bloco { margin: 8px 0 12px; }
      .notif-btn { width: 100%; justify-content: center; }
      .notif-aviso {
        font-size: 12px; color: rgba(255,255,255,.5); background: rgba(0,0,0,.2);
        border: 1px solid var(--linha); border-radius: 6px; padding: 10px 12px;
        margin: 8px 0 12px; line-height: 1.5;
      }

      .grafico-bloco { margin-top: 12px; margin-bottom: 4px; }
      .grafico-toggle {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        background: rgba(0,0,0,.3); border: 2px solid var(--linha);
        color: var(--ambar); font-family: 'IBM Plex Mono', monospace;
        font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
        padding: 10px 14px; cursor: pointer; transition: background var(--t);
      }
      .grafico-toggle:hover { background: rgba(255,197,61,.08); }
      .grafico-chevron { font-size: 9px; opacity: .7; }

      .stats-toggle {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        background: rgba(0,0,0,.3); border: 2px solid var(--linha);
        color: var(--ambar); font-family: 'IBM Plex Mono', monospace;
        font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
        padding: 10px 14px; cursor: pointer; transition: background var(--t);
      }
      .stats-toggle:hover { background: rgba(255,197,61,.08); }
      .stats-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;
      }
      @media (max-width: 480px) { .stats-grid { grid-template-columns: 1fr; } }
      .stats-card {
        background: rgba(0,0,0,.25); border: 2px solid var(--linha);
        padding: 12px 14px; display: flex; gap: 12px; align-items: flex-start;
      }
      .stats-emoji { font-size: 26px; flex: none; line-height: 1; padding-top: 2px; }
      .stats-info { flex: 1; min-width: 0; }
      .stats-titulo {
        font-family: 'IBM Plex Mono', monospace; font-size: 9px; letter-spacing: .12em;
        text-transform: uppercase; color: var(--ambar); margin-bottom: 5px;
      }
      .stats-nome {
        display: flex; align-items: center; gap: 6px;
        font-size: 14px; font-weight: 700; margin-bottom: 3px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .stats-detalhe { font-size: 11px; opacity: .55; font-family: 'IBM Plex Mono', monospace; }

      .perfil-picker {
        background: rgba(0,0,0,.32); border: 2px solid var(--linha);
        padding: 14px; margin-bottom: 16px;
      }
      .perfil-picker-topo {
        display: flex; align-items: center; justify-content: space-between;
      }
      .perfil-picker-preview { display: flex; align-items: center; gap: 12px; }
      .perfil-picker-nome { font-size: 20px; font-weight: 800; letter-spacing: .03em; }

      .paleta { display: flex; gap: 8px; flex-wrap: wrap; }
      .paleta-cor {
        width: 28px; height: 28px; border-radius: 50%;
        border: 2.5px solid transparent; cursor: pointer; flex: none;
        transition: transform var(--t), border-color var(--t);
      }
      .paleta-cor:hover:not(:disabled) { transform: scale(1.18); }
      .paleta-cor-ativa { border-color: var(--giz) !important; transform: scale(1.12); }

      .emoji-grid {
        display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;
      }
      .emoji-item {
        aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
        font-size: 18px; background: transparent; border: 2px solid transparent;
        cursor: pointer; border-radius: 4px; transition: background-color var(--t), border-color var(--t);
      }
      .emoji-item:hover:not(:disabled) { background: rgba(255,255,255,.08); }
      .emoji-item-ativo { border-color: var(--ambar); background: rgba(255,197,61,.1); }
      .emoji-item:disabled { opacity: .5; cursor: wait; }

      .led {
        font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 22px;
        color: var(--ambar); text-shadow: 0 0 12px rgba(255,197,61,.55);
        animation: acende 1s ease-out both; animation-delay: calc(var(--i, 0) * 60ms + .2s);
      }
      .led-mini { font-size: 20px; }
      @keyframes acende {
        0% { opacity: 0; text-shadow: none; }
        35% { opacity: .4; }
        45% { opacity: .15; }
        60% { opacity: .9; text-shadow: 0 0 18px rgba(255,197,61,.8); }
        100% { opacity: 1; text-shadow: 0 0 12px rgba(255,197,61,.55); }
      }

      .dica { font-size: 15px; opacity: .85; margin: 0 0 12px; letter-spacing: .02em; word-break: break-all; }
      .toast {
        border-left: 3px solid var(--ambar); padding: 8px 12px;
        background: rgba(0,0,0,.3); animation: sobe .3s var(--t) both;
      }
      .vazio {
        border: 2px dashed var(--linha); padding: 26px 18px; text-align: center;
        font-size: 17px; opacity: .85; letter-spacing: .03em;
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        margin-bottom: 10px;
      }
      .bola-quica { display: inline-block; font-size: 22px; animation: quica 1.6s cubic-bezier(.3,0,.4,1) infinite; }
      @keyframes quica {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-9px); }
      }
      .carregando {
        text-align: center; padding: 80px 0; font-size: 20px; letter-spacing: .05em;
        display: flex; align-items: center; justify-content: center; gap: 10px;
      }

      .rodape {
        margin-top: 26px; text-align: center;
        font-family: 'IBM Plex Mono', monospace; font-size: 11px;
        letter-spacing: .12em; opacity: .6; text-transform: uppercase;
        display: flex; align-items: center; justify-content: center; gap: 7px;
      }
      .ponto-salvo {
        width: 7px; height: 7px; border-radius: 50%; flex: none;
        background: #7ee2a0;
      }

      @media (max-width: 460px) {
        .placar-cab, .placar-linha { grid-template-columns: 26px 1fr 56px; padding: 9px 8px; }
        .col-num { display: none; }
        .col-pts { border-left: none; padding-left: 0; }
        .col-detalhe-mobile { display: block; font-family: 'IBM Plex Mono', monospace; font-size: 10px; opacity: .6; letter-spacing: .04em; }
        .jogo { flex-direction: column; align-items: stretch; }
        .jogo-resultado { justify-content: flex-end; }
        .linha-botoes { flex-direction: column; }
        .topo::before { width: 180px; height: 180px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .bolao-root *, .bolao-root *::before, .bolao-root *::after {
          animation: none !important; transition: none !important;
        }
      }
    `}</style>
  );
}
