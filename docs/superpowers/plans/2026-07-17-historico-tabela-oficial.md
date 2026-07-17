# Importar histórico (rodadas 1-18) + tabela oficial G4/Z4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer pro banco os jogos das rodadas 1-18 da Série A 2026 (resultado final, sem
palpite possível) e destacar visualmente G4/Z4 na tabela do campeonato já existente.

**Architecture:** Backend extrai a lógica de upsert de `acaoJogosHoje` (api/futebol.js)
numa função compartilhada `importarRodada(matchday, { comPlacar })`, reaproveitada por uma
nova ação `historico` que também grava o placar final (jogos já `FINISHED`). O frontend
chama essa ação 18 vezes em loop (uma rodada por vez, com pausa), pra respeitar o rate
limit da football-data.org sem arriscar timeout de function. A tabela oficial
(`tabelaCampeonato`) não muda — só ganha classes CSS condicionais nas 4 primeiras/últimas
linhas.

**Tech Stack:** React (Vite, sem framework de teste teste de componente), Vercel
serverless functions (`api/*.js`), Neon Postgres via `@neondatabase/serverless`, teste
puro em Node (`node src/ranking.test.mjs`, sem framework).

## Global Constraints

- Intervalo do histórico é fechado: rodadas 1 a 18 (não é uma ação genérica de "importar
  qualquer rodada").
- A tabela é a **tabela oficial** — os números pós-import precisam bater com a tabela real
  do 1º turno 2026 (CBF/imprensa), inclusive casos raros (W.O., jogos adiados).
- `acaoJogosHoje` não pode mudar de comportamento observável — é refactor, não feature.
- Sem legenda textual pro destaque G4/Z4 — só cor/borda.
- Este repo não tem harness de teste para código que toca `sql`/rede (nenhum `api/*.js`
  tem teste automatizado hoje) nem para componentes React — a verificação desses trechos
  é manual (curl contra ambiente real / navegador), documentada em cada task.

---

## Task 1: `matchdayHistoricoValido` em `lib/clubes.js`

**Files:**
- Modify: `lib/clubes.js` (adicionar ao final do arquivo, depois de `RODADA_LIMITE_ARTILHEIRO`)
- Test: `src/ranking.test.mjs` (já importa de `lib/clubes.js` e roda via `npm test`)

**Interfaces:**
- Produces: `RODADA_HISTORICO_MIN` (`1`), `RODADA_HISTORICO_MAX` (`18`),
  `matchdayHistoricoValido(matchday: number | string) => boolean` — usados pela Task 3
  (validação da rota `historico` em `api/futebol.js`) e pela Task 4 (`RODADA_HISTORICO_MAX`
  no loop do frontend).

- [ ] **Step 1: Escrever o teste que falha**

Em `src/ranking.test.mjs`, ajustar o import do topo (linha 7) pra incluir os novos nomes:

```js
import { pesoDaRodada, pesoDoJogo, ehClassico, matchdayHistoricoValido, RODADA_HISTORICO_MIN, RODADA_HISTORICO_MAX } from "../lib/clubes.js";
```

E adicionar um novo bloco de checagens logo depois do bloco existente que testa
`pesoDoJogo` (procure por `pesoDoJogo(20, "Botafogo", "Santos") === 1` — é a última
checagem desse bloco, por volta da linha 229) — acrescente **depois** dele, ainda dentro do
mesmo bloco `{ ... }`:

```js
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: erro no console, algo como `TypeError: matchdayHistoricoValido is not a function`
(o import resolve pra `undefined` porque a função ainda não existe em `lib/clubes.js`), e
saída final `✗ N verificação(ões) falharam` com exit code 1.

- [ ] **Step 3: Implementar em `lib/clubes.js`**

No final do arquivo, depois de `export const RODADA_LIMITE_ARTILHEIRO = 21;` (linha 105),
adicionar:

```js

/* Intervalo do import de histórico (1º turno 2026, ver
   proposta-historico-tabela-oficial.md) — rodadas 1-18, já disputadas antes do bolão
   existir. Intervalo fechado: não é validação genérica de "matchday existe". */
export const RODADA_HISTORICO_MIN = 1;
export const RODADA_HISTORICO_MAX = 18;

export function matchdayHistoricoValido(matchday) {
  const n = Number(matchday);
  return Number.isInteger(n) && n >= RODADA_HISTORICO_MIN && n <= RODADA_HISTORICO_MAX;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: última linha `✓ ranking.test.mjs — todos os cenários passaram (novo == antigo + alinhamento M4 + escala de peso)`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add lib/clubes.js src/ranking.test.mjs
git commit -m "feat: valida intervalo de rodadas do import de histórico (1-18)"
```

---

## Task 2: extrair `importarRodada` compartilhada em `api/futebol.js` (refactor, sem mudar comportamento)

**Files:**
- Modify: `api/futebol.js:137-215` (função `acaoJogosHoje`)

**Interfaces:**
- Consumes: `traduzirClube`, `pesoDoJogo` (já importados de `lib/clubes.js`), `sql`
  (já importado de `lib/db.js`), `norm`/`dataSP`/`placarBolao` (já definidos no próprio
  arquivo).
- Produces: `importarRodada(matchday: number, opts: { comPlacar: boolean }) => Promise<{ adicionados: number, atualizados: number, total: number }>` — usada por `acaoJogosHoje` (já existente) e por `acaoHistorico` (Task 3).

Esta task só move código de lugar e generaliza o parâmetro `matchday` (hoje hardcoded pra
`rodadaAtual`) — **não muda nenhum comportamento observável** de `acaoJogosHoje`.

- [ ] **Step 1: Substituir o corpo de `acaoJogosHoje` por `importarRodada` + wrapper**

Em `api/futebol.js`, substituir o bloco inteiro de `export async function acaoJogosHoje() {`
até o `}` de fechamento (linhas 137-215) por:

```js
async function importarRodada(matchday, { comPlacar }) {
  const relevantes = await buscarPartidas(`matchday=${matchday}`);

  /* puxa todos os jogos uma vez só pra evitar N SELECTs no loop */
  const todos = await sql`
    SELECT id, casa, fora, kickoff, external_id FROM jogos
  `;
  const porExt = new Map();
  const legados = [];
  for (const j of todos) {
    if (j.external_id) porExt.set(j.external_id, j);
    else legados.push(j);
  }

  let adicionados = 0;
  let atualizados = 0;

  for (const m of relevantes) {
    const externalId = String(m.id);
    const casa = traduzirClube(m.homeTeam?.name);
    const fora = traduzirClube(m.awayTeam?.name);
    const kickoff = m.utcDate;
    const rodada = m.matchday ?? null;
    const peso = pesoDoJogo(rodada, casa, fora);
    if (!casa || !fora) continue;

    /* comPlacar: jogo de histórico já é FINISHED — grava o placar final direto
       (acaoPlacares não alcançaria essas rodadas, sua janela é só 14 dias). */
    const placar = comPlacar && m.status === "FINISHED" ? placarBolao(m.score) : null;
    const gh = placar ? placar.home : null;
    const ga = placar ? placar.away : null;

    /* (a) já carimbado — atualiza kickoff, rodada, peso e placar (se veio) */
    const achado = porExt.get(externalId);
    if (achado) {
      const rows = await sql`
        UPDATE jogos
           SET kickoff = ${kickoff}, rodada = ${rodada}, peso = ${peso},
               gh = COALESCE(${gh}, gh), ga = COALESCE(${ga}, ga)
         WHERE id = ${achado.id}
           AND (kickoff IS DISTINCT FROM ${kickoff} OR rodada IS DISTINCT FROM ${rodada} OR peso IS DISTINCT FROM ${peso}
                OR gh IS DISTINCT FROM COALESCE(${gh}, gh) OR ga IS DISTINCT FROM COALESCE(${ga}, ga))
        RETURNING id
      `;
      if (rows.length > 0) atualizados++;
      continue;
    }

    /* (b) adoção de legado — cadastro manual prévio do mesmo confronto */
    const idx = legados.findIndex(
      (j) =>
        norm(j.casa) === norm(casa) &&
        norm(j.fora) === norm(fora) &&
        (j.kickoff == null || dataSP(j.kickoff) === dataSP(kickoff))
    );
    if (idx >= 0) {
      const cand = legados[idx];
      await sql`
        UPDATE jogos
           SET external_id = ${externalId},
               kickoff = COALESCE(kickoff, ${kickoff}),
               rodada = ${rodada},
               peso = ${peso},
               gh = COALESCE(gh, ${gh}),
               ga = COALESCE(ga, ${ga})
         WHERE id = ${cand.id}
      `;
      legados.splice(idx, 1);
      atualizados++;
      continue;
    }

    /* (c) novo */
    await sql`
      INSERT INTO jogos (casa, fora, kickoff, external_id, rodada, peso, gh, ga)
      VALUES (${casa}, ${fora}, ${kickoff}, ${externalId}, ${rodada}, ${peso}, ${gh}, ${ga})
    `;
    adicionados++;
  }

  return { adicionados, atualizados, total: relevantes.length };
}

export async function acaoJogosHoje() {
  /* rodada atual da temporada (ex.: 19) — busca TODOS os jogos dela de uma
     vez, não só os "de hoje". Isso deixa a rodada inteira disponível pra
     palpitar com antecedência, em vez de ir liberando jogo por jogo
     conforme cada dia chega. */
  const rodadaAtual = await matchdayAtual();
  if (rodadaAtual == null) return { adicionados: 0, atualizados: 0, total: 0 };
  return importarRodada(rodadaAtual, { comPlacar: false });
}
```

- [ ] **Step 2: Checar sintaxe**

Run: `node --check api/futebol.js`
Expected: nenhuma saída (exit code 0). Isso só valida sintaxe — `import`/`export` do topo
do arquivo dependem de `DATABASE_URL` (via `lib/db.js`), então `node --check` (que só faz
parse, não executa) é o que dá pra rodar sem banco.

- [ ] **Step 3: Smoke test manual (comportamento preservado)**

Este repo não tem mock de banco pra `api/*.js` — a verificação de comportamento é manual,
contra um ambiente com `DATABASE_URL`/`FOOTBALL_DATA_KEY` reais (dev local com `vercel dev`
ou o deploy de preview). Com um token de admin válido:

```bash
curl -s "https://SEU-DEPLOY/api/futebol?t=SEU_TOKEN_ADMIN&acao=jogos-hoje"
```

Expected: mesmo formato de sempre, `{"adicionados":N,"atualizados":N,"total":N}`, e a
rodada atual continua aparecendo certinho na aba Jogos do app (nenhum jogo sumiu ou
duplicou). Se já tinha rodado antes hoje, `adicionados`/`atualizados` podem vir `0` — isso
é esperado (idempotente).

- [ ] **Step 4: Commit**

```bash
git add api/futebol.js
git commit -m "refactor: extrai importarRodada de acaoJogosHoje (sem mudar comportamento)"
```

---

## Task 3: nova ação `historico` em `api/futebol.js`

**Files:**
- Modify: `api/futebol.js` (import no topo, handler, nova função exportada)

**Interfaces:**
- Consumes: `importarRodada` (Task 2), `matchdayHistoricoValido` (Task 1, de
  `lib/clubes.js`).
- Produces: rota `GET /api/futebol?t=TOKEN&acao=historico&matchday=N` (admin-only),
  resposta `{ adicionados, atualizados, total }` — consumida pela Task 4 (loop do
  frontend).

- [ ] **Step 1: Importar o validador**

Em `api/futebol.js:7`, trocar:

```js
import { traduzirClube, pesoDoJogo } from "../lib/clubes.js";
```

por:

```js
import { traduzirClube, pesoDoJogo, matchdayHistoricoValido } from "../lib/clubes.js";
```

- [ ] **Step 2: Adicionar a rota no handler**

Em `api/futebol.js`, dentro de `export default async function handler`, logo depois do
bloco `if (acao === "resultados") { ... }` e antes do `res.status(400).json({ error: "acao inválida...`:

```js
    if (acao === "historico") {
      const matchday = Number(req.query.matchday);
      if (!matchdayHistoricoValido(matchday)) {
        res.status(400).json({ error: "matchday inválido — use um valor entre 1 e 18" });
        return;
      }
      res.status(200).json(await acaoHistorico(matchday));
      return;
    }
    res.status(400).json({ error: "acao inválida — use 'jogos-hoje', 'resultados', 'historico' ou 'placar-vivo'" });
```

(a última linha substitui a mensagem de erro existente, que hoje não lista `'historico'`).

- [ ] **Step 3: Adicionar `acaoHistorico`**

Logo depois da função `acaoJogosHoje` (a que ficou depois do refactor da Task 2),
adicionar:

```js

/* Importa uma rodada já disputada (1-18, o 1º turno) e já grava o placar final —
   diferente de acaoJogosHoje, que só cadastra o confronto e deixa o placar pra
   acaoPlacares (janela de 14 dias, não alcançaria rodadas antigas). */
export async function acaoHistorico(matchday) {
  return importarRodada(matchday, { comPlacar: true });
}
```

- [ ] **Step 4: Checar sintaxe**

Run: `node --check api/futebol.js`
Expected: nenhuma saída (exit code 0).

- [ ] **Step 5: Smoke test manual (rota nova)**

Contra o mesmo ambiente real da Task 2:

```bash
curl -s "https://SEU-DEPLOY/api/futebol?t=SEU_TOKEN_ADMIN&acao=historico&matchday=1"
```

Expected: `{"adicionados":N,"atualizados":0,"total":N}` com `N` = número de jogos da
rodada 1 (dado real da football-data.org). Conferir no banco (ou na aba Jogos, seção
"↩ Rodadas anteriores") que os jogos da rodada 1 apareceram **com placar final
preenchido** (não `null`).

Rodar o **mesmo comando de novo** (mesma rodada 1):

```bash
curl -s "https://SEU-DEPLOY/api/futebol?t=SEU_TOKEN_ADMIN&acao=historico&matchday=1"
```

Expected: `{"adicionados":0,"atualizados":0,"total":N}` — dedupe por `external_id` impede
duplicar os jogos já importados na chamada anterior.

Também testar o caso de erro:

```bash
curl -s "https://SEU-DEPLOY/api/futebol?t=SEU_TOKEN_ADMIN&acao=historico&matchday=19"
```

Expected: `{"error":"matchday inválido — use um valor entre 1 e 18"}`, HTTP 400.

- [ ] **Step 6: Commit**

```bash
git add api/futebol.js
git commit -m "feat: ação historico em /api/futebol para importar rodadas 1-18"
```

---

## Task 4: botão "Importar histórico" na aba Jogos (frontend)

**Files:**
- Modify: `src/App.jsx:8` (import), `src/App.jsx:1480-1481` (novo state), `src/App.jsx`
  (nova função depois de `buscarResultados`, por volta da linha 1645), `src/App.jsx:1651-1666`
  (JSX dos botões)

**Interfaces:**
- Consumes: `RODADA_HISTORICO_MAX` (Task 1, `lib/clubes.js`), rota
  `acao=historico&matchday=N` (Task 3), `api()` (helper já existente em `src/App.jsx:106`).

- [ ] **Step 1: Importar a constante compartilhada**

Em `src/App.jsx:8`, trocar:

```js
import { TIMES, CLUBE_INFO, pesoDoJogo as pesoDoJogoBase } from "../lib/clubes.js";
```

por:

```js
import { TIMES, CLUBE_INFO, pesoDoJogo as pesoDoJogoBase, RODADA_HISTORICO_MAX } from "../lib/clubes.js";
```

- [ ] **Step 2: Novo state**

Em `src/App.jsx`, logo depois de (linha 1481):

```js
  const [buscandoResultados, setBuscandoResultados] = useState(false);
```

adicionar:

```js
  const [importandoHistorico, setImportandoHistorico] = useState(null); // { rodada, total } | null
```

- [ ] **Step 3: Função `importarHistorico`**

Em `src/App.jsx`, logo depois do fechamento da função `buscarResultados` (procure o `};`
que fecha o bloco iniciado em `const buscarResultados = async () => {`, por volta da linha
1645), adicionar:

```js

  const importarHistorico = async () => {
    setAviso("");
    let adicionados = 0;
    let atualizados = 0;
    let rodadaAtualImport = 1;
    try {
      for (rodadaAtualImport = 1; rodadaAtualImport <= RODADA_HISTORICO_MAX; rodadaAtualImport++) {
        setImportandoHistorico({ rodada: rodadaAtualImport, total: RODADA_HISTORICO_MAX });
        const r = await api(`/api/futebol?t=${encodeURIComponent(token)}&acao=historico&matchday=${rodadaAtualImport}`);
        adicionados += r.adicionados || 0;
        atualizados += r.atualizados || 0;
        if (rodadaAtualImport < RODADA_HISTORICO_MAX) {
          await new Promise((resolve) => setTimeout(resolve, 6500));
        }
      }
      recarregar();
      setAviso(
        `${RODADA_HISTORICO_MAX} rodadas importadas — ${adicionados} adicionado${adicionados === 1 ? "" : "s"} · ${atualizados} atualizado${atualizados === 1 ? "" : "s"} ⚽`
      );
    } catch (e) {
      console.error(e);
      recarregar();
      setAviso(`Falhou na rodada ${rodadaAtualImport} — clique de novo pra retomar (não duplica o que já importou).`);
    }
    setImportandoHistorico(null);
  };
```

- [ ] **Step 4: Condição de visibilidade + JSX do botão**

Em `src/App.jsx`, dentro do `return (...)` do componente `Jogos`, logo antes da linha
`{ehAdmin && (` (linha 1649), adicionar a constante de visibilidade:

```js
  const precisaImportarHistorico = !estado.jogos.some((j) => j.rodada === RODADA_HISTORICO_MAX);
```

(pode ficar logo depois da declaração de `importarHistorico`, antes do `return`).

Em seguida, no JSX, logo depois do fechamento do `<div className="linha-botoes">` que
contém os botões "⚡ Jogos de hoje" / "🏁 Buscar resultados" / "📲 Cobrar galera" (fecha
na linha 1666, `</div>`), adicionar:

```jsx
          {precisaImportarHistorico && (
            <div className="linha-botoes">
              <button
                className="botao botao-largo"
                onClick={importarHistorico}
                disabled={buscandoJogos || buscandoResultados || !!importandoHistorico}
              >
                {importandoHistorico
                  ? <><span className="spinner" aria-hidden="true"></span> Importando rodada {importandoHistorico.rodada} de {importandoHistorico.total}…</>
                  : "↩ Importar histórico (rodadas 1-18)"}
              </button>
            </div>
          )}
```

Também atualizar os `disabled` dos dois botões existentes (linhas 1652 e 1655) pra
incluir o novo estado, trocando:

```jsx
            <button className="botao botao-largo" onClick={buscarJogosDoDia} disabled={buscandoJogos || buscandoResultados}>
```

por:

```jsx
            <button className="botao botao-largo" onClick={buscarJogosDoDia} disabled={buscandoJogos || buscandoResultados || !!importandoHistorico}>
```

e:

```jsx
            <button className="botao botao-largo" onClick={buscarResultados} disabled={buscandoJogos || buscandoResultados}>
```

por:

```jsx
            <button className="botao botao-largo" onClick={buscarResultados} disabled={buscandoJogos || buscandoResultados || !!importandoHistorico}>
```

- [ ] **Step 5: Verificação manual no navegador**

Este projeto não tem test runner de componente React — a verificação é manual, no app
rodando de verdade (é uma UI stateful com loop assíncrono e chamadas de rede reais).

Run: `npm run dev`

No navegador, logado como admin, aba Jogos, **sem nenhum jogo de rodada 18 ainda**:
1. Confirmar que o botão "↩ Importar histórico (rodadas 1-18)" aparece numa linha própria,
   abaixo dos outros dois botões.
2. Clicar nele. Expected: o botão vira `"Importando rodada 1 de 18…"` com spinner, os
   outros dois botões ficam desabilitados, e o texto avança (`rodada 2 de 18`, `3 de 18`,
   ...) a cada ~6.5s.
3. Ao terminar (~2 min depois), expected: aviso final tipo
   `"18 rodadas importadas — 187 adicionados · 0 atualizados ⚽"`, e a aba Jogos mostra as
   rodadas 1-18 dentro de "↩ Rodadas anteriores", com placar preenchido.
4. Recarregar a página. Expected: o botão "Importar histórico" **não aparece mais**
   (porque agora existe jogo com `rodada === 18`).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: botão de importar histórico (rodadas 1-18) no painel admin"
```

---

## Task 5: destaque G4/Z4 na tabela do campeonato

**Files:**
- Modify: `src/App.jsx:1442-1452` (JSX das linhas da tabela em `ModalEstatisticas`)
- Modify: `src/App.jsx:4904-4905` (CSS, bloco `<style>` do componente)

**Interfaces:**
- Consumes: `tabela` (array já ordenado, retornado por `tabelaCampeonato(jogos)` —
  nenhuma mudança nessa função).

- [ ] **Step 1: Classes condicionais no JSX**

Em `src/App.jsx`, o bloco que renderiza as linhas da tabela (dentro de `ModalEstatisticas`,
por volta da linha 1442-1452) hoje é:

```jsx
                  {tabela.map((r, i) => {
                    const on = r.time === jogo.casa || r.time === jogo.fora;
                    return (
                      <tr key={r.time} className={on ? "stat-row-on" : ""}>
                        <td className="stat-td-time">{i + 1} {fl(r.time)}{r.time}</td>
                        <td className="stat-pts">{r.pts}</td>
                        <td>{r.j}</td><td>{r.v}</td><td>{r.e}</td><td>{r.d}</td><td>{r.gp}</td><td>{r.gc}</td>
                        <td className={r.sg > 0 ? "stat-sg-pos" : r.sg < 0 ? "stat-sg-neg" : ""}>{r.sg > 0 ? "+" : ""}{r.sg}</td>
                      </tr>
                    );
                  })}
```

Trocar a linha do `const on` e a `<tr>` por:

```jsx
                  {tabela.map((r, i) => {
                    const on = r.time === jogo.casa || r.time === jogo.fora;
                    const zona = i < 4 ? "stat-row-g4" : i >= tabela.length - 4 ? "stat-row-z4" : "";
                    return (
                      <tr key={r.time} className={`${on ? "stat-row-on" : ""} ${zona}`.trim()}>
                        <td className="stat-td-time">{i + 1} {fl(r.time)}{r.time}</td>
                        <td className="stat-pts">{r.pts}</td>
                        <td>{r.j}</td><td>{r.v}</td><td>{r.e}</td><td>{r.d}</td><td>{r.gp}</td><td>{r.gc}</td>
                        <td className={r.sg > 0 ? "stat-sg-pos" : r.sg < 0 ? "stat-sg-neg" : ""}>{r.sg > 0 ? "+" : ""}{r.sg}</td>
                      </tr>
                    );
                  })}
```

(a Série A sempre tem 20 times cadastrados em `CLUBE_INFO`, então G4 e Z4 nunca se
sobrepõem — `i < 4` cobre só as 4 primeiras linhas, `i >= tabela.length - 4` só as 4
últimas.)

- [ ] **Step 2: CSS do destaque**

Em `src/App.jsx`, no bloco `<style>` do componente, hoje (linhas 4904-4905):

```
      .stat-pts { font-weight: 800; color: var(--ambar); }
      .stat-row-on { background: rgba(255,197,61,.08); }
```

Trocar por (novas regras **antes** de `.stat-row-on`, pra que o destaque amber de "time
deste jogo" continue prevalecendo sobre o fundo verde/vermelho quando as duas condições
coincidem — a borda lateral de zona continua aparecendo de qualquer forma, é uma
propriedade CSS diferente):

```
      .stat-pts { font-weight: 800; color: var(--ambar); }
      .stat-row-g4 td:first-child { border-left: 3px solid #7ee2a0; }
      .stat-row-g4 { background: rgba(126,226,160,.07); }
      .stat-row-z4 td:first-child { border-left: 3px solid var(--erro); }
      .stat-row-z4 { background: rgba(255,123,107,.07); }
      .stat-row-on { background: rgba(255,197,61,.08); }
```

- [ ] **Step 3: Verificação manual no navegador**

Sem framework de teste de componente neste projeto — verificação visual direta.

Run: `npm run dev` (se não estiver rodando ainda)

No navegador, abrir as estatísticas de qualquer jogo (ícone 📊 na aba Jogos), com a
tabela já tendo pelo menos as rodadas 1-18 importadas (Task 4) pra ter os 20 times com
jogos. Expected:
- As 4 primeiras linhas (topo da tabela, mais pontos) têm borda esquerda **verde** e leve
  fundo verde.
- As 4 últimas linhas (fundo da tabela) têm borda esquerda **vermelha** e leve fundo
  vermelho.
- Nenhuma legenda textual nova aparece.
- Se um dos dois times do jogo aberto estiver no G4 ou Z4, a linha dele continua com o
  fundo âmbar de destaque (`stat-row-on`) — a borda lateral verde/vermelha continua visível
  do lado esquerdo.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: destaque visual G4/Z4 na tabela do campeonato"
```
