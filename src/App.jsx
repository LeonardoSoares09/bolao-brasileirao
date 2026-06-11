import { useState, useEffect, useRef } from "react";

/* ============================================================
   BOLÃO DA COPA 2026 — app simples para grupo de 9 amigos
   Regras: placar exato = 3 pts | resultado certo = 1 pt
   Visual: campo de futebol + placar de estádio, animações CSS
   leves (zero libs extras), respeita prefers-reduced-motion
   ============================================================ */

const KEY = "bolao_copa_2026";
const PTS_EXATO = 3;
const PTS_RESULTADO = 1;

const vazio = { participants: [], matches: [], predictions: {} };

const uid = () => Math.random().toString(36).slice(2, 9);
const norm = (s) => String(s ?? "").trim().toLowerCase();

const reduzMovimento = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function pontosDoPalpite(palpite, jogo) {
  if (!palpite || jogo.gh === null || jogo.ga === null) return null;
  const ph = Number(palpite.h), pa = Number(palpite.a);
  if (palpite.h === "" || palpite.a === "" || Number.isNaN(ph) || Number.isNaN(pa)) return null;
  if (ph === jogo.gh && pa === jogo.ga) return PTS_EXATO;
  const sinal = (x, y) => (x > y ? 1 : x < y ? -1 : 0);
  if (sinal(ph, pa) === sinal(jogo.gh, jogo.ga)) return PTS_RESULTADO;
  return 0;
}

const iniciou = (m, agora) => !!m.kickoff && new Date(m.kickoff) <= agora;
const temResultado = (m) => m.gh !== null && m.ga !== null;
const palpiteCompleto = (pl) => !!pl && pl.h !== "" && pl.h != null && pl.a !== "" && pl.a != null;

function fmtQuando(m) {
  if (m.kickoff) {
    const d = new Date(m.kickoff);
    if (!Number.isNaN(d.getTime()))
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return m.quando || "";
}

function contarPendentes(m, participants, predictions) {
  return participants.filter((p) => !palpiteCompleto(predictions[m.id]?.[p.id])).length;
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
      const e = 1 - Math.pow(1 - p, 3); /* easeOutCubic */
      setV(Math.round(de + (para - de) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valor, dur]);
  return v;
}

/* Chamada à serverless function (/api/consultar), que fala com a API da Anthropic */
async function consultarClaude(prompt) {
  const response = await fetch("/api/consultar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) throw new Error("API retornou " + response.status);
  const { texto } = await response.json();
  const limpo = texto.replace(/```json|```/g, "").trim();
  const ini = limpo.indexOf("[");
  const fim = limpo.lastIndexOf("]");
  if (ini === -1 || fim === -1) throw new Error("resposta sem JSON");
  return JSON.parse(limpo.slice(ini, fim + 1));
}

export default function BolaoCopa() {
  const [data, setData] = useState(vazio);
  const [tab, setTab] = useState("ranking");
  const [loaded, setLoaded] = useState(false);
  const [salvo, setSalvo] = useState(true);
  const [agora, setAgora] = useState(() => new Date());
  const saveTimer = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  /* ---------- carregar (localStorage) ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setData({ ...vazio, ...JSON.parse(raw) });
    } catch (e) {
      console.error("Erro ao carregar:", e);
    }
    setLoaded(true);
  }, []);

  /* ---------- salvar (debounce) ---------- */
  useEffect(() => {
    if (!loaded) return;
    setSalvo(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
        setSalvo(true);
      } catch (e) {
        console.error("Erro ao salvar:", e);
      }
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  /* ---------- mutações ---------- */
  const addParticipante = (nome) => {
    nome = nome.trim();
    if (!nome) return;
    setData((d) => ({ ...d, participants: [...d.participants, { id: uid(), nome }] }));
  };
  const delParticipante = (id) =>
    setData((d) => {
      const preds = {};
      for (const [mid, byP] of Object.entries(d.predictions)) {
        const { [id]: _, ...resto } = byP;
        preds[mid] = resto;
      }
      return { ...d, participants: d.participants.filter((p) => p.id !== id), predictions: preds };
    });

  const addJogo = (casa, fora, kickoff) => {
    casa = casa.trim(); fora = fora.trim();
    if (!casa || !fora) return;
    setData((d) => ({
      ...d,
      matches: [...d.matches, { id: uid(), casa, fora, kickoff: kickoff || "", gh: null, ga: null }],
    }));
  };
  const delJogo = (id) =>
    setData((d) => {
      const { [id]: _, ...preds } = d.predictions;
      return { ...d, matches: d.matches.filter((m) => m.id !== id), predictions: preds };
    });
  const setResultado = (id, campo, valor) =>
    setData((d) => ({
      ...d,
      matches: d.matches.map((m) =>
        m.id === id ? { ...m, [campo]: valor === "" || valor === null ? null : Math.max(0, parseInt(valor, 10) || 0) } : m
      ),
    }));

  const setPalpite = (matchId, pid, campo, valor) =>
    setData((d) => {
      const atual = d.predictions[matchId]?.[pid] || { h: "", a: "" };
      return {
        ...d,
        predictions: {
          ...d.predictions,
          [matchId]: {
            ...(d.predictions[matchId] || {}),
            [pid]: { ...atual, [campo]: valor },
          },
        },
      };
    });

  /* ---------- ranking ---------- */
  const ranking = data.participants
    .map((p) => {
      let pontos = 0, exatos = 0, resultados = 0;
      for (const m of data.matches) {
        const pts = pontosDoPalpite(data.predictions[m.id]?.[p.id], m);
        if (pts === PTS_EXATO) { exatos++; pontos += pts; }
        else if (pts === PTS_RESULTADO) { resultados++; pontos += pts; }
      }
      return { ...p, pontos, exatos, resultados };
    })
    .sort((a, b) => b.pontos - a.pontos || b.exatos - a.exatos || a.nome.localeCompare(b.nome));

  const jogosComResultado = data.matches.filter(temResultado).length;

  if (!loaded)
    return (
      <div className="bolao-root">
        <Estilo />
        <div className="carregando"><span className="bola-quica">⚽</span> Abrindo o bolão…</div>
      </div>
    );

  return (
    <div className="bolao-root">
      <Estilo />

      <header className="topo entra-1">
        <div className="eyebrow">⚽ {data.participants.length} participante{data.participants.length === 1 ? "" : "s"} · {data.matches.length} jogo{data.matches.length === 1 ? "" : "s"} · {jogosComResultado} encerrado{jogosComResultado === 1 ? "" : "s"}</div>
        <h1>BOLÃO DA COPA</h1>
        <div className="sub">2026 · placar exato {PTS_EXATO} pts · resultado certo {PTS_RESULTADO} pt</div>
      </header>

      <nav className="abas entra-2" role="tablist">
        {[
          ["ranking", "Ranking"],
          ["jogos", "Jogos"],
          ["palpites", "Palpites"],
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
        {tab === "ranking" && <Ranking ranking={ranking} temJogos={jogosComResultado > 0} />}
        {tab === "jogos" && (
          <Jogos
            jogos={data.matches}
            participants={data.participants}
            predictions={data.predictions}
            agora={agora}
            addJogo={addJogo}
            delJogo={delJogo}
            setResultado={setResultado}
          />
        )}
        {tab === "palpites" && (
          <Palpites data={data} agora={agora} setPalpite={setPalpite} />
        )}
        {tab === "galera" && (
          <Galera participantes={data.participants} add={addParticipante} del={delParticipante} />
        )}
      </main>

      <footer className="rodape entra-3">
        <span className={salvo ? "ponto-salvo" : "ponto-salvando"} aria-hidden="true"></span>
        {salvo ? "Tudo salvo" : "Salvando…"}
      </footer>
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
    return <Vazio texto="Cadastre a galera na aba ao lado para montar o placar." />;
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
            <span className="col-nome">{p.nome}{i === 0 && p.pontos > 0 ? " 🏆" : ""}</span>
            <span className="col-num">{p.exatos}</span>
            <span className="col-num">{p.resultados}</span>
            <LedPontos valor={p.pontos} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= JOGOS ================= */
function Jogos({ jogos, participants, predictions, agora, addJogo, delJogo, setResultado }) {
  const [casa, setCasa] = useState("");
  const [fora, setFora] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [buscandoJogos, setBuscandoJogos] = useState(false);
  const [buscandoResultados, setBuscandoResultados] = useState(false);
  const [aviso, setAviso] = useState("");

  /* aviso some sozinho */
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const enviar = () => {
    addJogo(casa, fora, kickoff);
    setCasa(""); setFora(""); setKickoff("");
  };

  const buscarJogosDoDia = async () => {
    setBuscandoJogos(true);
    setAviso("");
    try {
      const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const lista = await consultarClaude(
        `Busque na web quais jogos da Copa do Mundo FIFA 2026 acontecem hoje, ${hoje}. Responda SOMENTE com um array JSON válido, sem markdown e sem nenhum texto extra, no formato: [{"casa":"Seleção A","fora":"Seleção B","kickoff":"YYYY-MM-DDTHH:mm"}], com o kickoff no horário de Brasília. Se não houver jogos da Copa hoje, responda [].`
      );
      const chave = (c, f) => norm(c) + "|" + norm(f);
      const existentes = new Set(jogos.map((m) => chave(m.casa, m.fora)));
      let novos = 0;
      for (const j of lista) {
        if (!j || !j.casa || !j.fora) continue;
        const k = chave(j.casa, j.fora);
        if (existentes.has(k)) continue;
        existentes.add(k);
        addJogo(String(j.casa), String(j.fora), String(j.kickoff || ""));
        novos++;
      }
      setAviso(
        lista.length === 0
          ? "Nenhum jogo da Copa hoje."
          : novos === 0
          ? "Os jogos de hoje já estão cadastrados."
          : `${novos} jogo${novos === 1 ? "" : "s"} de hoje adicionado${novos === 1 ? "" : "s"} ⚽`
      );
    } catch (e) {
      console.error(e);
      setAviso("Não consegui buscar agora — tenta de novo ou adiciona manualmente.");
    }
    setBuscandoJogos(false);
  };

  const buscarResultados = async () => {
    const pendentesDeResultado = jogos.filter((m) => !temResultado(m) && (!m.kickoff || iniciou(m, agora)));
    if (pendentesDeResultado.length === 0) {
      setAviso("Nenhum jogo iniciado aguardando resultado.");
      return;
    }
    setBuscandoResultados(true);
    setAviso("");
    try {
      const linhas = pendentesDeResultado
        .map((m) => `- ${m.casa} x ${m.fora}${fmtQuando(m) ? ` (${fmtQuando(m)})` : ""}`)
        .join("\n");
      const lista = await consultarClaude(
        `Busque na web o placar final destes jogos da Copa do Mundo FIFA 2026:\n${linhas}\n\nResponda SOMENTE com um array JSON válido, sem markdown e sem texto extra, no formato: [{"casa":"Seleção A","fora":"Seleção B","gh":2,"ga":1}]. Inclua APENAS jogos já encerrados com placar final confirmado (gh = gols da primeira seleção listada, ga = gols da segunda). Se nenhum terminou ainda, responda [].`
      );
      let atualizados = 0;
      for (const r of lista) {
        if (!r || r.gh == null || r.ga == null) continue;
        const m = pendentesDeResultado.find(
          (j) => norm(j.casa) === norm(r.casa) && norm(j.fora) === norm(r.fora)
        );
        if (!m) continue;
        setResultado(m.id, "gh", String(r.gh));
        setResultado(m.id, "ga", String(r.ga));
        atualizados++;
      }
      setAviso(
        atualizados === 0
          ? "Nenhum resultado final encontrado ainda."
          : `${atualizados} resultado${atualizados === 1 ? "" : "s"} atualizado${atualizados === 1 ? "" : "s"} — confere o ranking! 🏆`
      );
    } catch (e) {
      console.error(e);
      setAviso("Não consegui buscar os resultados — tenta de novo ou lança manualmente.");
    }
    setBuscandoResultados(false);
  };

  return (
    <div>
      <div className="linha-botoes">
        <button className="botao botao-largo" onClick={buscarJogosDoDia} disabled={buscandoJogos || buscandoResultados}>
          {buscandoJogos ? <><span className="spinner" aria-hidden="true"></span> Buscando…</> : "⚡ Jogos de hoje"}
        </button>
        <button className="botao botao-largo" onClick={buscarResultados} disabled={buscandoJogos || buscandoResultados}>
          {buscandoResultados ? <><span className="spinner" aria-hidden="true"></span> Buscando…</> : "🏁 Buscar resultados"}
        </button>
      </div>
      {aviso && <p className="dica toast" role="status">{aviso}</p>}

      <div className="cartao form-jogo">
        <div className="form-linha">
          <input
            value={casa}
            onChange={(e) => setCasa(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Time da casa"
          />
          <span className="vs">×</span>
          <input
            value={fora}
            onChange={(e) => setFora(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Visitante"
          />
        </div>
        <div className="form-linha">
          <input
            type="datetime-local"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
            aria-label="Data e hora do jogo"
          />
          <button className="botao" onClick={enviar}>Adicionar jogo</button>
        </div>
      </div>

      {jogos.length === 0 && <Vazio texto="Nenhum jogo ainda. Use o botão de busca ou adicione manualmente." />}

      {jogos.map((m, i) => {
        const encerrado = temResultado(m);
        const travado = iniciou(m, agora);
        const faltam = !encerrado && participants.length > 0 ? contarPendentes(m, participants, predictions) : 0;
        return (
          <div
            key={m.id}
            className={"cartao jogo entra-cartao" + (encerrado ? " encerrado" : "")}
            style={{ "--i": Math.min(i, 8) }}
          >
            <div className="jogo-info">
              <div className="jogo-times">{m.casa} <span className="vs">×</span> {m.fora}</div>
              <div className="jogo-meta">
                {fmtQuando(m) && <span className="jogo-quando">{fmtQuando(m)}</span>}
                {!encerrado && travado && <span className="tag tag-travado">🔒 em jogo</span>}
                {!encerrado && !travado && faltam > 0 && (
                  <span className="tag tag-pendente">⚠ faltam {faltam} palpite{faltam === 1 ? "" : "s"}</span>
                )}
                {!encerrado && !travado && participants.length > 0 && faltam === 0 && (
                  <span className="tag tag-ok">✓ palpites completos</span>
                )}
              </div>
            </div>
            <div className="jogo-resultado">
              <input
                type="number" min="0" inputMode="numeric"
                value={m.gh ?? ""} placeholder="–"
                onChange={(e) => setResultado(m.id, "gh", e.target.value)}
                aria-label={"Gols " + m.casa}
              />
              <span className="vs">:</span>
              <input
                type="number" min="0" inputMode="numeric"
                value={m.ga ?? ""} placeholder="–"
                onChange={(e) => setResultado(m.id, "ga", e.target.value)}
                aria-label={"Gols " + m.fora}
              />
              <button className="apagar" onClick={() => delJogo(m.id)} aria-label="Remover jogo">✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= PALPITES ================= */
function Palpites({ data, agora, setPalpite }) {
  const [jogoSel, setJogoSel] = useState("");
  const [destravados, setDestravados] = useState({});
  const jogo = data.matches.find((m) => m.id === jogoSel) || data.matches[0];

  if (data.matches.length === 0) return <Vazio texto="Cadastre os jogos primeiro, depois lance os palpites aqui." />;
  if (data.participants.length === 0) return <Vazio texto="Cadastre a galera primeiro na aba Galera." />;

  const encerrado = temResultado(jogo);
  const travado = iniciou(jogo, agora) && !destravados[jogo.id];
  const faltam = contarPendentes(jogo, data.participants, data.predictions);

  return (
    <div>
      <select className="seletor" value={jogo.id} onChange={(e) => setJogoSel(e.target.value)}>
        {data.matches.map((m) => {
          const n = !temResultado(m) ? contarPendentes(m, data.participants, data.predictions) : 0;
          return (
            <option key={m.id} value={m.id}>
              {m.casa} × {m.fora}
              {fmtQuando(m) ? ` — ${fmtQuando(m)}` : ""}
              {temResultado(m) ? ` (${m.gh}:${m.ga})` : n > 0 ? ` — ⚠${n}` : ""}
            </option>
          );
        })}
      </select>

      {encerrado && (
        <p className="dica">Resultado final: <strong>{jogo.casa} {jogo.gh} × {jogo.ga} {jogo.fora}</strong></p>
      )}
      {!encerrado && faltam > 0 && (
        <p className="dica">⚠ Faltam {faltam} palpite{faltam === 1 ? "" : "s"} neste jogo.</p>
      )}
      {iniciou(jogo, agora) && !encerrado && (
        <div className="trava-aviso">
          {travado ? (
            <>
              <span>🔒 Jogo iniciado — palpites travados.</span>
              <button
                className="botao-fantasma"
                onClick={() => setDestravados((d) => ({ ...d, [jogo.id]: true }))}
              >
                Destravar p/ correção
              </button>
            </>
          ) : (
            <span>🔓 Destravado para correção (cuidado com a maracutaia 👀)</span>
          )}
        </div>
      )}

      {data.participants.map((p, i) => {
        const palpite = data.predictions[jogo.id]?.[p.id] || { h: "", a: "" };
        const pts = pontosDoPalpite(palpite, jogo);
        const bloqueado = travado || (encerrado && !destravados[jogo.id]);
        return (
          <div key={p.id} className="cartao palpite-linha entra-cartao" style={{ "--i": Math.min(i, 8) }}>
            <span className="palpite-nome">{p.nome}</span>
            <div className="palpite-inputs">
              <input
                type="number" min="0" inputMode="numeric"
                value={palpite.h} placeholder="–"
                disabled={bloqueado}
                onChange={(e) => setPalpite(jogo.id, p.id, "h", e.target.value)}
                aria-label={`Palpite de ${p.nome} para ${jogo.casa}`}
              />
              <span className="vs">:</span>
              <input
                type="number" min="0" inputMode="numeric"
                value={palpite.a} placeholder="–"
                disabled={bloqueado}
                onChange={(e) => setPalpite(jogo.id, p.id, "a", e.target.value)}
                aria-label={`Palpite de ${p.nome} para ${jogo.fora}`}
              />
              {encerrado && pts !== null && (
                <span className={"pts pts-" + pts}>{pts === PTS_EXATO ? "🎯 " : ""}{pts} pt{pts === 1 ? "" : "s"}</span>
              )}
              {encerrado && pts === null && <span className="pts pts-0">—</span>}
            </div>
          </div>
        );
      })}

      {encerrado && !destravados[jogo.id] && (
        <button
          className="botao-fantasma"
          onClick={() => setDestravados((d) => ({ ...d, [jogo.id]: true }))}
        >
          🔓 Destravar palpites deste jogo p/ correção
        </button>
      )}
    </div>
  );
}

/* ================= GALERA ================= */
function Galera({ participantes, add, del }) {
  const [nome, setNome] = useState("");
  const enviar = () => { add(nome); setNome(""); };
  return (
    <div>
      <div className="cartao form-linha">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Nome do amigo"
        />
        <button className="botao" onClick={enviar}>Adicionar</button>
      </div>
      {participantes.length === 0 && <Vazio texto="Adicione os 9 nomes do grupo para começar." />}
      {participantes.map((p, i) => (
        <div key={p.id} className="cartao palpite-linha entra-cartao" style={{ "--i": Math.min(i, 8) }}>
          <span className="palpite-nome">{p.nome}</span>
          <button className="apagar" onClick={() => del(p.id)} aria-label={`Remover ${p.nome}`}>✕</button>
        </div>
      ))}
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

      /* luz de refletor do estádio */
      .bolao-root::before {
        content: '';
        position: fixed; inset: 0; pointer-events: none;
        background: radial-gradient(ellipse 120% 60% at 50% -12%, rgba(255,255,255,.12), transparent 60%);
      }

      /* ---------- entrada orquestrada ---------- */
      @keyframes sobe { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      .entra-1 { animation: sobe .55s var(--t) both; }
      .entra-2 { animation: sobe .55s var(--t) .12s both; }
      .conteudo-aba { animation: sobe .4s var(--t) both; }
      .entra-3 { animation: sobe .55s var(--t) .3s both; }
      .entra-cartao { animation: sobe .45s var(--t) both; animation-delay: calc(var(--i, 0) * 50ms); }

      /* ---------- topo com círculo central do campo ---------- */
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

      /* ---------- abas ---------- */
      .abas { display: flex; gap: 0; border: 2px solid var(--linha); margin-bottom: 18px; background: rgba(0,0,0,.18); }
      .aba {
        flex: 1; padding: 10px 4px; background: transparent; color: var(--giz);
        border: none; border-right: 2px solid var(--linha);
        font: 600 16px 'Barlow Condensed', sans-serif; letter-spacing: .08em;
        text-transform: uppercase; cursor: pointer;
        transition: background-color var(--t), color var(--t), box-shadow var(--t);
        position: relative;
      }
      .aba:last-child { border-right: none; }
      .aba:hover:not(.ativa) { background: rgba(255,255,255,.07); }
      .aba.ativa {
        background: var(--ambar); color: var(--ambar-escuro); font-weight: 800;
        box-shadow: inset 0 -3px 0 rgba(0,0,0,.22);
      }
      .aba:focus-visible { outline: 3px solid var(--ambar); outline-offset: -3px; }

      /* ---------- cartões ---------- */
      .cartao {
        border: 2px solid var(--linha);
        background: rgba(0,0,0,.22);
        padding: 12px 14px; margin-bottom: 10px;
        transition: border-color var(--t), transform var(--t), background-color var(--t);
      }
      .cartao:hover { border-color: rgba(255,255,255,.5); }

      .form-linha { display: flex; gap: 8px; align-items: center; }
      .form-jogo .form-linha + .form-linha { margin-top: 8px; }

      /* ---------- inputs ---------- */
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

      /* ---------- botões ---------- */
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
        letter-spacing: .06em; text-transform: uppercase;
        transition: background-color var(--t), transform var(--t);
      }
      .botao-fantasma:hover { background: rgba(255,197,61,.12); transform: translateY(-1px); }
      .botao-fantasma:active { transform: none; }

      .apagar {
        background: transparent; color: var(--erro);
        border: 2px solid transparent; cursor: pointer;
        font-size: 15px; padding: 4px 8px; margin-left: auto;
        transition: border-color var(--t), transform var(--t); opacity: .75;
      }
      .apagar:hover { border-color: var(--erro); opacity: 1; transform: scale(1.06); }

      .vs { opacity: .6; font-weight: 800; }

      /* ---------- jogos ---------- */
      .jogo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .jogo.encerrado { border-color: var(--ambar); }
      .jogo-info { flex: 1; min-width: 160px; }
      .jogo-times { font-size: 19px; font-weight: 800; letter-spacing: .03em; }
      .jogo-meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap; }
      .jogo-quando { font-family: 'IBM Plex Mono', monospace; font-size: 11px; opacity: .7; }
      .jogo-resultado { display: flex; align-items: center; gap: 6px; }

      .tag {
        font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 700;
        letter-spacing: .06em; padding: 2px 6px; white-space: nowrap;
        animation: pop .3s var(--t) both;
      }
      @keyframes pop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
      .tag-pendente { border: 1.5px solid var(--erro); color: var(--erro); }
      .tag-ok { border: 1.5px solid rgba(255,255,255,.35); opacity: .8; }
      .tag-travado { background: var(--ambar); color: var(--ambar-escuro); }

      .trava-aviso {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; flex-wrap: wrap;
        border: 2px solid var(--ambar); background: rgba(255,197,61,.1);
        padding: 10px 12px; margin-bottom: 12px;
        font-size: 15px; letter-spacing: .03em;
        animation: sobe .35s var(--t) both;
      }

      /* ---------- palpites ---------- */
      .palpite-linha { display: flex; align-items: center; gap: 10px; }
      .palpite-nome { flex: 1; font-size: 18px; font-weight: 600; letter-spacing: .03em; }
      .palpite-inputs { display: flex; align-items: center; gap: 6px; }

      .pts {
        font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700;
        padding: 3px 7px; margin-left: 6px; white-space: nowrap;
        animation: pop .35s var(--t) both;
      }
      .pts-3 { background: var(--ambar); color: var(--ambar-escuro); box-shadow: 0 0 14px rgba(255,197,61,.45); }
      .pts-1 { border: 1.5px solid var(--ambar); color: var(--ambar); }
      .pts-0 { border: 1.5px solid var(--linha); opacity: .6; }

      /* ---------- placar (assinatura) ---------- */
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
      .col-num { text-align: center; font-family: 'IBM Plex Mono', monospace; font-size: 14px; }
      .col-pts { text-align: right; }

      /* dígitos do placar "acendendo" como painel de estádio */
      .led {
        font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 22px;
        color: var(--ambar); text-shadow: 0 0 12px rgba(255,197,61,.55);
        animation: acende 1s ease-out both; animation-delay: calc(var(--i, 0) * 60ms + .2s);
      }
      @keyframes acende {
        0% { opacity: 0; text-shadow: none; }
        35% { opacity: .4; }
        45% { opacity: .15; }
        60% { opacity: .9; text-shadow: 0 0 18px rgba(255,197,61,.8); }
        100% { opacity: 1; text-shadow: 0 0 12px rgba(255,197,61,.55); }
      }

      /* ---------- avisos e estados ---------- */
      .dica { font-size: 15px; opacity: .85; margin: 0 0 12px; letter-spacing: .02em; }
      .toast {
        border-left: 3px solid var(--ambar); padding: 8px 12px;
        background: rgba(0,0,0,.3); animation: sobe .3s var(--t) both;
      }
      .vazio {
        border: 2px dashed var(--linha); padding: 26px 18px; text-align: center;
        font-size: 17px; opacity: .85; letter-spacing: .03em;
        display: flex; flex-direction: column; align-items: center; gap: 8px;
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
      .ponto-salvo, .ponto-salvando {
        width: 7px; height: 7px; border-radius: 50%; flex: none;
        background: #7ee2a0; transition: background-color var(--t);
      }
      .ponto-salvando { background: var(--ambar); animation: pulsa .8s ease-in-out infinite; }
      @keyframes pulsa { 50% { opacity: .35; } }

      /* ---------- responsivo ---------- */
      @media (max-width: 460px) {
        .placar-cab, .placar-linha { grid-template-columns: 26px 1fr 48px 48px 56px; padding: 9px 8px; }
        .jogo { flex-direction: column; align-items: stretch; }
        .jogo-resultado { justify-content: flex-end; }
        .linha-botoes { flex-direction: column; }
        .topo::before { width: 180px; height: 180px; }
      }

      /* ---------- acessibilidade: sem movimento ---------- */
      @media (prefers-reduced-motion: reduce) {
        .bolao-root *, .bolao-root *::before, .bolao-root *::after {
          animation: none !important; transition: none !important;
        }
      }
    `}</style>
  );
}
