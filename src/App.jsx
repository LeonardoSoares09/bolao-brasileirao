import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   BOLÃO DA COPA 2026 — versão compartilhada (Vercel + Neon)
   Cada amigo acessa pelo seu link com token (?t=...).
   Regras: placar exato = 3 pts | resultado certo = 1 pt
   Travamento de palpites validado NO SERVIDOR.
   ============================================================ */

const PTS_EXATO = 3;
const PTS_RESULTADO = 1;

const reduzMovimento = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function pontosDoPalpite(palpite, jogo) {
  if (!palpite || jogo.gh === null || jogo.ga === null) return null;
  const ph = Number(palpite.h), pa = Number(palpite.a);
  if (Number.isNaN(ph) || Number.isNaN(pa)) return null;
  if (ph === jogo.gh && pa === jogo.ga) return PTS_EXATO;
  const sinal = (x, y) => (x > y ? 1 : x < y ? -1 : 0);
  if (sinal(ph, pa) === sinal(jogo.gh, jogo.ga)) return PTS_RESULTADO;
  return 0;
}

const temResultado = (m) => m.gh !== null && m.ga !== null;

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
  const [estado, setEstado] = useState(null);
  const [erroAuth, setErroAuth] = useState("");
  const [tab, setTab] = useState("ranking");
  const [abrirPerfil, setAbrirPerfil] = useState(false);
  const offsetRef = useRef(0);
  const [, setTick] = useState(0);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      const e = await api(`/api/estado?t=${encodeURIComponent(token)}`);
      offsetRef.current = Date.parse(e.agora) - Date.now();
      setEstado(e);
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

  const ranking = estado.participantes
    .map((p) => {
      let pontos = 0, exatos = 0, resultados = 0;
      for (const m of estado.jogos) {
        const pts = pontosDoPalpite(palpitesMap[m.id]?.[p.id], m);
        if (pts === PTS_EXATO) { exatos++; pontos += pts; }
        else if (pts === PTS_RESULTADO) { resultados++; pontos += pts; }
      }
      return { ...p, pontos, exatos, resultados };
    })
    .sort((a, b) => b.pontos - a.pontos || b.exatos - a.exatos || a.nome.localeCompare(b.nome));

  const encerrados = estado.jogos.filter(temResultado).length;
  const ehAdmin = estado.eu.isAdmin;
  const euParticipante = estado.participantes.find((p) => p.id === estado.eu.id);

  return (
    <Casca>
      <header className="topo entra-1">
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
              size={38}
            />
          </button>
        )}
        <div className="eyebrow">⚽ Fala, {estado.eu.nome}! · {estado.participantes.length} na disputa · {encerrados} jogo{encerrados === 1 ? "" : "s"} encerrado{encerrados === 1 ? "" : "s"}</div>
        <h1>BOLÃO DA COPA</h1>
        <div className="sub">2026 · placar exato {PTS_EXATO} pts · resultado certo {PTS_RESULTADO} pt</div>
      </header>

      {abrirPerfil && estado.eu.id !== null && (
        <PerfilPicker
          nome={estado.eu.nome}
          emoji={euParticipante?.avatarEmoji || ""}
          cor={euParticipante?.avatarCor || ""}
          onSalvar={salvarAvatar}
          onFechar={() => setAbrirPerfil(false)}
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
            onClick={() => setTab(id)}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      <main key={tab} className="conteudo-aba">
        {tab === "ranking" && <Ranking ranking={ranking} temJogos={encerrados > 0} />}
        {tab === "jogos" && (
          <Jogos
            estado={estado}
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
          />
        )}
        {tab === "campeao" && (
          <Campeao token={token} euId={estado.eu.id} />
        )}
        {tab === "galera" && (
          <Galera estado={estado} ehAdmin={ehAdmin} token={token} recarregar={carregar} />
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

function Ranking({ ranking, temJogos }) {
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
          <span className="col-num">EXATOS</span>
          <span className="col-num">RESULT.</span>
          <span className="col-pts">PTS</span>
        </div>
        {ranking.map((p, i) => (
          <div
            key={p.id}
            className={"placar-linha" + (i === 0 && p.pontos > 0 ? " lider" : "")}
            style={{ "--i": Math.min(i, 10) }}
          >
            <span className="col-pos">{i + 1}</span>
            <span className="col-nome">
              <Avatar nome={p.nome} emoji={p.avatarEmoji} cor={p.avatarCor} size={24} />
              <span>{p.nome}{i === 0 && p.pontos > 0 ? " 🏆" : ""}</span>
            </span>
            <span className="col-num">{p.exatos}</span>
            <span className="col-num">{p.resultados}</span>
            <LedPontos valor={p.pontos} />
          </div>
        ))}
      </div>
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
function Jogos({ estado, contagensMap, comecou, ehAdmin, token, recarregar, offsetMs = 0 }) {
  const [casa, setCasa] = useState("");
  const [fora, setFora] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [buscandoJogos, setBuscandoJogos] = useState(false);
  const [buscandoResultados, setBuscandoResultados] = useState(false);
  const [aviso, setAviso] = useState("");

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
        body: JSON.stringify({ t: token, casa, fora, kickoff: kickoff || null }),
      });
      setCasa(""); setFora(""); setKickoff("");
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
          </div>

          <div className="cartao form-jogo">
            <div className="form-linha">
              <input value={casa} onChange={(e) => setCasa(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addJogo()} placeholder="Time da casa" />
              <span className="vs">×</span>
              <input value={fora} onChange={(e) => setFora(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addJogo()} placeholder="Visitante" />
            </div>
            <div className="form-linha">
              <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} aria-label="Data e hora do jogo" />
              <button className="botao" onClick={addJogo}>Adicionar jogo</button>
            </div>
          </div>
        </>
      )}

      {aviso && <p className="dica toast" role="status">{aviso}</p>}

      {estado.jogos.length === 0 && (
        <Vazio texto={ehAdmin ? "Nenhum jogo ainda. Use o botão de busca ou adicione manualmente." : "O organizador ainda não cadastrou os jogos."} />
      )}

      {agruparPorData(estado.jogos).map(([chave, grupo]) => (
        <div key={chave}>
          <div className="grupo-data-header">{labelData(chave, offsetMs)}</div>
          {grupo.map((m, i) => {
            const encerrado = temResultado(m);
            const travado = comecou(m);
            const faltam = !encerrado ? estado.participantes.length - (contagensMap[m.id] || 0) : 0;
            return (
              <div key={m.id} className={"cartao jogo entra-cartao" + (encerrado ? " encerrado" : "")} style={{ "--i": Math.min(i, 8) }}>
                <div className="jogo-info">
                  <div className="jogo-times">{m.casa} <span className="vs">×</span> {m.fora}</div>
                  <div className="jogo-meta">
                    {fmtQuando(m) && <span className="jogo-quando">{fmtQuando(m)}</span>}
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
                ) : (
                  encerrado && <div className="placar-final led-mini">{m.gh} : {m.ga}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
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
function Palpites({ estado, palpitesMap, comecou, token, recarregar, offsetMs = 0 }) {
  const [jogoSel, setJogoSel] = useState("");
  const jogo = estado.jogos.find((m) => String(m.id) === String(jogoSel)) || estado.jogos[0];

  if (estado.jogos.length === 0) return <Vazio texto="Ainda não há jogos cadastrados." />;
  if (estado.participantes.length === 0) return <Vazio texto="Ainda não há participantes cadastrados." />;

  const encerrado = temResultado(jogo);
  const travado = comecou(jogo) || encerrado;
  const ehAdmin = estado.eu.isAdmin;
  const revelado = travado; /* palpites dos outros só aparecem depois que começa */

  return (
    <div>
      <div className="seletor-jogos" role="listbox" aria-label="Selecionar jogo">
        {agruparPorData(estado.jogos).map(([chave, grupo]) => (
          <div key={chave}>
            <div className="seletor-data-header">{labelData(chave, offsetMs)}</div>
            {grupo.map((m) => {
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
                  <span className="sj-nome">{m.casa} <span className="vs">×</span> {m.fora}</span>
                  {fmtQuando(m) && <span className="sj-quando">{fmtQuando(m)}</span>}
                  {enc && <span className="sj-placar">{m.gh}:{m.ga}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {!encerrado && !travado && jogo.kickoff && (
        <Countdown kickoff={jogo.kickoff} offsetMs={offsetMs} />
      )}

      {encerrado && (
        <p className="dica">Resultado final: <strong>{jogo.casa} {jogo.gh} × {jogo.ga} {jogo.fora}</strong></p>
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
        <input type="number" min="0" inputMode="numeric" value={h} placeholder="–"
          disabled={bloqueado}
          onChange={(e) => mudar("h", e.target.value)}
          aria-label={`Palpite de ${participante.nome} para ${jogo.casa}`} />
        <span className="vs">:</span>
        <input type="number" min="0" inputMode="numeric" value={a} placeholder="–"
          disabled={bloqueado}
          onChange={(e) => mudar("a", e.target.value)}
          aria-label={`Palpite de ${participante.nome} para ${jogo.fora}`} />
        {encerrado && pts !== null && (
          <span className={"pts pts-" + pts}>{pts === PTS_EXATO ? "🎯 " : ""}{pts} pt{pts === 1 ? "" : "s"}</span>
        )}
        {encerrado && pts === null && <span className="pts pts-0">—</span>}
      </div>
    </div>
  );
}

/* ================= GALERA ================= */
function Galera({ estado, ehAdmin, token, recarregar }) {
  const [nome, setNome] = useState("");
  const [novoAdmin, setNovoAdmin] = useState(false);
  const [lista, setLista] = useState(null); /* com tokens, só admin */
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(null);

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

  if (!ehAdmin) {
    return (
      <div>
        {estado.participantes.length === 0 && <Vazio texto="Ainda não há participantes." />}
        {estado.participantes.map((p, i) => (
          <div key={p.id} className="cartao palpite-linha entra-cartao" style={{ "--i": Math.min(i, 8) }}>
            <Avatar nome={p.nome} emoji={p.avatarEmoji} cor={p.avatarCor} size={30} />
            <span className="palpite-nome">{p.nome}{p.id === estado.eu.id ? " (você)" : ""}</span>
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

      {aviso && <p className="dica toast" role="status">{aviso}</p>}

      {lista === null && <p className="dica">Carregando…</p>}
      {lista && lista.length === 0 && <Vazio texto="Adicione os 9 nomes do grupo — cada um ganha um link próprio." />}
      {lista &&
        lista.map((p, i) => (
          <div key={p.id} className="cartao palpite-linha entra-cartao" style={{ "--i": Math.min(i, 8) }}>
            <Avatar nome={p.nome} emoji={p.avatarEmoji} cor={p.avatarCor} size={30} />
            <span className="palpite-nome">{p.nome}{p.isAdmin ? " ⭐" : ""}</span>
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
const BANDEIRAS = {
  // CONCACAF
  "Canadá": "🇨🇦", "Costa Rica": "🇨🇷", "Estados Unidos": "🇺🇸",
  "Honduras": "🇭🇳", "México": "🇲🇽", "Panamá": "🇵🇦",
  // CONMEBOL
  "Argentina": "🇦🇷", "Brasil": "🇧🇷", "Colômbia": "🇨🇴",
  "Equador": "🇪🇨", "Uruguai": "🇺🇾", "Venezuela": "🇻🇪",
  // UEFA
  "Alemanha": "🇩🇪", "Áustria": "🇦🇹", "Bélgica": "🇧🇪",
  "Croácia": "🇭🇷", "Dinamarca": "🇩🇰", "Escócia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Espanha": "🇪🇸", "França": "🇫🇷", "Holanda": "🇳🇱",
  "Hungria": "🇭🇺", "Inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Itália": "🇮🇹",
  "Portugal": "🇵🇹", "Sérvia": "🇷🇸", "Suíça": "🇨🇭", "Turquia": "🇹🇷",
  // CAF
  "África do Sul": "🇿🇦", "Argélia": "🇩🇿", "Camarões": "🇨🇲",
  "Costa do Marfim": "🇨🇮", "Egito": "🇪🇬", "Mali": "🇲🇱",
  "Marrocos": "🇲🇦", "Nigéria": "🇳🇬", "Senegal": "🇸🇳",
  // AFC
  "Arábia Saudita": "🇸🇦", "Austrália": "🇦🇺", "Catar": "🇶🇦",
  "Coreia do Sul": "🇰🇷", "Irã": "🇮🇷", "Iraque": "🇮🇶",
  "Japão": "🇯🇵", "Uzbequistão": "🇺🇿",
  // OFC
  "Nova Zelândia": "🇳🇿",
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
                {BANDEIRAS[meu.selecao]} {meu.selecao}
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
                    <span className="campeao-item-bandeira">{BANDEIRAS[s]}</span>
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
            <span className="pts pts-1">{BANDEIRAS[c.selecao]} {c.selecao}</span>
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
        --grama: #0d3a21;
        --grama2: #114a2a;
        --linha: rgba(255,255,255,.28);
        --giz: #f2f6ef;
        --ambar: #ffc53d;
        --ambar-escuro: #1a1408;
        --erro: #ff7b6b;
        --t: .22s cubic-bezier(.2,.7,.3,1);
        min-height: 100vh;
        background:
          repeating-linear-gradient(90deg, var(--grama) 0 72px, var(--grama2) 72px 144px);
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

      .topo { text-align: center; margin-bottom: 22px; position: relative; padding: 18px 0 14px; }
      .topo::before {
        content: ''; position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: 230px; height: 230px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.10);
        pointer-events: none;
      }
      .topo::after {
        content: ''; position: absolute; left: -16px; right: -16px; top: 50%;
        border-top: 2px solid rgba(255,255,255,.07);
        pointer-events: none;
      }
      .eyebrow {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
        color: var(--ambar); margin-bottom: 6px; position: relative; z-index: 1;
      }
      .topo h1 {
        margin: 0; font-weight: 800; font-size: clamp(44px, 9vw, 72px);
        letter-spacing: .03em; line-height: .95;
        text-shadow: 0 3px 0 rgba(0,0,0,.35);
        position: relative; z-index: 1;
      }
      .sub { font-size: 15px; letter-spacing: .06em; opacity: .85; margin-top: 6px; text-transform: uppercase; position: relative; z-index: 1; }

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
      .campeao-item-bandeira { font-size: 20px; flex: none; width: 26px; text-align: center; }
      .campeao-item-nome { flex: 1; }
      .campeao-vazio {
        padding: 12px 14px; margin: 0;
        font-family: 'IBM Plex Mono', monospace; font-size: 12px; opacity: .5;
      }

      .seletor-jogos {
        max-height: 210px;
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

      .vs { opacity: .6; font-weight: 800; }

      .grupo-data-header {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
        color: var(--ambar); padding: 16px 2px 6px;
        border-bottom: 1px solid rgba(255,197,61,.25);
        margin-bottom: 8px;
      }
      .grupo-data-header:first-child { padding-top: 4px; }

      .seletor-data-header {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
        color: var(--ambar); padding: 6px 12px 5px;
        background: rgba(0,0,0,.4);
        border-bottom: 1px solid rgba(255,197,61,.2);
        position: sticky; top: 0; z-index: 1;
      }

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
      .placar-linha.lider { background: rgba(255,197,61,.12); }
      .placar-linha.lider:hover { background: rgba(255,197,61,.18); }
      .col-pos { font-family: 'IBM Plex Mono', monospace; font-size: 13px; opacity: .7; }
      .col-nome { display: flex; align-items: center; gap: 7px; overflow: hidden; min-width: 0; }
      .col-num { text-align: center; font-family: 'IBM Plex Mono', monospace; font-size: 14px; }
      .col-pts { text-align: right; }

      .avatar {
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-weight: 800; font-family: 'Barlow Condensed', sans-serif; letter-spacing: .02em;
        flex: none; user-select: none; color: rgba(0,0,0,.72);
        box-shadow: 0 1px 5px rgba(0,0,0,.35); overflow: hidden;
      }

      .avatar-header-btn {
        position: absolute; top: 14px; right: 0; z-index: 2;
        background: transparent; border: none; cursor: pointer; padding: 0;
        transition: transform var(--t);
      }
      .avatar-header-btn:hover { transform: scale(1.1); }

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
        .placar-cab, .placar-linha { grid-template-columns: 26px 1fr 48px 48px 56px; padding: 9px 8px; }
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
