# Bolão do Brasileirão 2º Turno 2026 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformular este repositório (que já É o fork do `bolao-copa`) de um bolão de Copa do Mundo (grupos + mata-mata, seleções) para um bolão do 2º turno do Brasileirão Série A 2026 (pontos corridos, rodada 19 a 38, 20 clubes). Nada de Copa do Mundo deve sobrar no produto final — nem em código nem em copy.

**Architecture:** A engenharia central (auth por token, regra de ouro do kickoff, ranking/desempate em `ranking.js`, PWA/service worker, reações, avatar, bônus campeão/artilheiro, `ModalCampeaoBolao`) já é 100% genérica e não muda. As mudanças reais são: (1) trocar o dado de identidade (seleções → 20 clubes, com emoji+cor curados à mão), (2) trocar `fase` (grupos/mata-mata) por `rodada` (1..38) como o dado real que o Brasileirão usa, com peso derivado de rodada + clássico regional em vez de fase de mata-mata, e (3) apagar duas features que só faziam sentido pra seleções e que ficariam mortas com a troca (Elo/chances de vitória, tabela de grupo — esta última é **adaptada** pra virar a tabela completa do campeonato, não apagada). Um módulo novo `lib/clubes.js` centraliza os dados de clube (nomes, emoji/cor, tradução de nomes da API, lista de clássicos, cálculo de peso) e é importado tanto pelo client (`src/App.jsx`) quanto pelas serverless functions (`api/futebol.js`, `api/jogo.js`) — evita duplicar a regra de peso em dois lugares.

**Tech Stack:** React 18 + Vite, Vercel Serverless Functions, Neon Postgres (`@neondatabase/serverless`), football-data.org API (competição `BSA`).

## Global Constraints

- Este diretório (`bolao-brasileirao`) já É o fork — não criar novo repositório nem novo diretório. Pode reformular/apagar qualquer coisa específica de Copa do Mundo; nada precisa ficar pra trás por compatibilidade.
- Escopo do bolão: ranking **zera** na rodada 19 (ninguém jogou o 1º turno) — não acompanha a classificação geral da Série A.
- Peso por jogo: **escalonado por rodada** — rodadas 19–30 = 1×, 31–35 = 2×, 36–38 = 3× — **e** clássico regional = 2×. Quando as duas regras se aplicam ao mesmo jogo, vale o **maior** dos dois pesos (não multiplica/empilha).
- Clássicos regionais (únicos pares que valem peso extra): Flamengo×Fluminense, Palmeiras×Corinthians, Grêmio×Internacional, Atlético Mineiro×Cruzeiro, Athletico Paranaense×Coritiba, Bahia×Vitória.
- Campeão e artilheiro do bônus são do **2º turno isolado** (não da temporada inteira). O mecanismo de confirmação em `api/resultado-especial.js` já é 100% manual/genérico — **nenhuma mudança de código é necessária ali**, é só uma decisão de quando o admin aperta o botão.
- Identidade visual dos 20 clubes: emoji + cor por clube, curados à mão (mesma convenção do `Avatar` dos participantes), não hash automático.
- Nome/marca: mantém **"BOLÃO DOS GURIS"**; o "eyebrow" acima do título passa a indicar Brasileirão 2º turno 2026 em vez de Copa do Mundo.
- API de dados: football-data.org, competição `BSA` (não `WC`). A chave nova já está configurada como `FOOTBALL_DATA_KEY` na Vercel — não precisa provisionar nada de API neste plano.
- Os 20 clubes da Série A 2026 (confirmados via `GET /v4/competitions/BSA/teams` na football-data.org e cruzados com a Wikipédia, 2026-07-16): Athletico Paranaense, Atlético Mineiro, Bahia, Botafogo, Bragantino (Red Bull Bragantino), Chapecoense, Corinthians, Coritiba, Cruzeiro, Flamengo, Fluminense, Grêmio, Internacional, Mirassol, Palmeiras, Remo, Santos, São Paulo, Vasco da Gama, Vitória.
- Este repo não tem suíte de testes de UI — a única suíte automatizada é `npm test` (`node src/ranking.test.mjs`), cobrindo só `src/ranking.js`. Verificação das mudanças em `App.jsx`/`api/*.js` é por `npm run build` limpo (falha de import/sintaxe aparece ali) e leitura cuidadosa — não há como rodar teste automatizado de UI neste repo hoje.

---

## Task 1: `lib/clubes.js` — módulo de dados dos clubes (novo)

**Files:**
- Create: `lib/clubes.js`

**Interfaces:**
- Produces: `TIMES` (array de 20 strings, nomes de exibição, ordenados pt-BR), `CLUBE_INFO` (objeto `{ [nome]: { emoji, cor } }`), `TRADUCAO_CLUBES` (objeto `{ [nomeOficialAPI]: nomeDeExibicao }`), `CLASSICOS` (array de pares `[a, b]`), `ehClassico(casa, fora)` → boolean, `pesoDaRodada(rodada)` → 1|2|3, `pesoDoJogo(rodada, casa, fora)` → 1|2|3.
- Consumes: nada (módulo raiz, sem imports).

- [ ] **Step 1: Escrever `lib/clubes.js` completo**

```js
/* lib/clubes.js — dados dos 20 clubes da Série A 2026 (2º turno) e regra de
   peso por jogo. Módulo compartilhado: importado tanto pelo client
   (src/App.jsx) quanto pelas serverless functions (api/futebol.js,
   api/jogo.js) — a regra de peso mora aqui pra não duplicar entre ingestão
   automática e cadastro manual. */

/* Nome de exibição por clube. Emoji+cor curados à mão (mesmo padrão do
   Avatar dos participantes — PALETA_CORES/EMOJIS_AVATAR em App.jsx), não
   hash automático: cor é a cor primária real do clube, emoji é uma
   referência a apelido/mascote quando existe um óbvio. */
export const CLUBE_INFO = {
  "Athletico Paranaense": { emoji: "🌪️", cor: "#CC0000" },
  "Atlético Mineiro":     { emoji: "🐓", cor: "#1A1A1A" },
  "Bahia":                { emoji: "⭐", cor: "#0C4CAB" },
  "Botafogo":             { emoji: "🔥", cor: "#2B2B2B" },
  "Bragantino":           { emoji: "🐂", cor: "#E2231A" },
  "Chapecoense":          { emoji: "🌾", cor: "#046A38" },
  "Corinthians":          { emoji: "🖤", cor: "#000000" },
  "Coritiba":             { emoji: "🍗", cor: "#026937" },
  "Cruzeiro":             { emoji: "🦊", cor: "#002366" },
  "Flamengo":             { emoji: "🦅", cor: "#C81428" },
  "Fluminense":           { emoji: "🍚", cor: "#7A1F3D" },
  "Grêmio":               { emoji: "🔱", cor: "#0D3B7E" },
  "Internacional":        { emoji: "🔴", cor: "#E4162B" },
  "Mirassol":             { emoji: "🌽", cor: "#FFC72C" },
  "Palmeiras":            { emoji: "🌳", cor: "#006437" },
  "Remo":                 { emoji: "🚣", cor: "#002D72" },
  "Santos":               { emoji: "🐟", cor: "#000000" },
  "São Paulo":            { emoji: "🎗️", cor: "#CC0000" },
  "Vasco da Gama":        { emoji: "⚓", cor: "#000000" },
  "Vitória":              { emoji: "🦁", cor: "#D2202E" },
};

export const TIMES = Object.keys(CLUBE_INFO).sort((a, b) => a.localeCompare(b, "pt-BR"));

/* Nome oficial que a football-data.org retorna em homeTeam.name/awayTeam.name
   pra competição BSA → nosso nome de exibição. Confirmado via
   GET /v4/competitions/BSA/teams em 2026-07-16 (20/20 clubes batem). */
export const TRADUCAO_CLUBES = {
  "CR Flamengo": "Flamengo",
  "CA Mineiro": "Atlético Mineiro",
  "Grêmio FBPA": "Grêmio",
  "CA Paranaense": "Athletico Paranaense",
  "SE Palmeiras": "Palmeiras",
  "Botafogo FR": "Botafogo",
  "Cruzeiro EC": "Cruzeiro",
  "Chapecoense AF": "Chapecoense",
  "São Paulo FC": "São Paulo",
  "EC Bahia": "Bahia",
  "SC Corinthians Paulista": "Corinthians",
  "CR Vasco da Gama": "Vasco da Gama",
  "EC Vitória": "Vitória",
  "Fluminense FC": "Fluminense",
  "Coritiba FBC": "Coritiba",
  "RB Bragantino": "Bragantino",
  "Clube do Remo": "Remo",
  "Mirassol FC": "Mirassol",
  "SC Internacional": "Internacional",
  "Santos FC": "Santos",
};

export const traduzirClube = (nome) => (nome && TRADUCAO_CLUBES[nome]) || nome || "";

/* Clássicos regionais que valem peso extra (2×), independente da rodada.
   Lista fechada — só estes 6 pares (um por estado com 2+ clubes na Série A
   2026); decisão de produto, não é "todo confronto do mesmo estado". */
export const CLASSICOS = [
  ["Flamengo", "Fluminense"],
  ["Palmeiras", "Corinthians"],
  ["Grêmio", "Internacional"],
  ["Atlético Mineiro", "Cruzeiro"],
  ["Athletico Paranaense", "Coritiba"],
  ["Bahia", "Vitória"],
];

export function ehClassico(casa, fora) {
  return CLASSICOS.some(([a, b]) => (a === casa && b === fora) || (a === fora && b === casa));
}

/* Peso por rodada: 19–30 = 1×, 31–35 = 2×, 36–38 = 3× (reta final da
   temporada). rodada ausente/inválida cai no 1× (mesmo default do resto
   do app). */
export function pesoDaRodada(rodada) {
  const r = Number(rodada);
  if (!Number.isFinite(r)) return 1;
  if (r >= 36) return 3;
  if (r >= 31) return 2;
  return 1;
}

/* Peso final do jogo: o MAIOR entre peso-por-rodada e peso-de-clássico (não
   empilha — um clássico na reta final continua 3×, não vira 6×). */
export function pesoDoJogo(rodada, casa, fora) {
  const porRodada = pesoDaRodada(rodada);
  const porClassico = ehClassico(casa, fora) ? 2 : 1;
  return Math.max(porRodada, porClassico);
}
```

- [ ] **Step 2: Verificar que o módulo carrega sem erro de sintaxe**

Run: `node --input-type=module -e "import('./lib/clubes.js').then(m => console.log(m.TIMES.length, m.pesoDoJogo(37, 'Flamengo', 'Fluminense'), m.pesoDoJogo(20, 'Flamengo', 'Fluminense'), m.pesoDoJogo(37, 'Botafogo', 'Santos')))"`

Expected: `20 3 2 3` (20 clubes; clássico na rodada 37 fica 3× — o maior entre rodada e clássico; clássico fora da reta final fica 2×; não-clássico na reta final fica 3×).

- [ ] **Step 3: Commit**

```bash
git add lib/clubes.js
git commit -m "feat: adiciona dados dos 20 clubes da Série A 2026 e regra de peso por rodada/clássico"
```

---

## Task 2: Schema — trocar `fase` por `rodada`

**Files:**
- Modify: `schema.sql`
- Create: `migrations/V08__troca_fase_por_rodada.sql`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `jogos.rodada INT` (nova); coluna `jogos.fase` deixa de existir.

- [ ] **Step 1: Atualizar `schema.sql`**

Em `schema.sql`, no bloco da tabela `jogos` (linhas 27-53 hoje), trocar o comentário e a definição da tabela:

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- Jogos. `external_id` = id da partida na football-data.org (busca automática).
-- `live` = true enquanto a bola rola (placar parcial).
-- `rodada` = número da rodada da Série A (19 a 38, 2º turno 2026) — vem do
-- campo `matchday` da football-data.org, ou digitado à mão no cadastro manual.
-- `peso` = multiplicador de pontos do jogo: 1× (rodadas 19-30), 2× (rodadas
-- 31-35 OU clássico regional), 3× (rodadas 36-38) — o maior dos dois quando
-- os dois critérios se aplicam (ver lib/clubes.js:pesoDoJogo). Calculado na
-- ingestão/cadastro, mas fica gravado na coluna pra não depender de
-- recalcular toda vez.
-- `api_gh`/`api_ga` = último placar que a football-data reportou ao vivo. O cron
-- só regrava o placar quando esse valor muda, pra não desfazer correção manual do
-- admin (ex.: gol anulado por VAR) enquanto a API atrasada repete o placar antigo.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jogos (
  id          SERIAL PRIMARY KEY,
  casa        TEXT NOT NULL,
  fora        TEXT NOT NULL,
  kickoff     TIMESTAMPTZ,
  gh          INT CHECK (gh >= 0),
  ga          INT CHECK (ga >= 0),
  external_id TEXT UNIQUE,
  rodada      INT,
  peso        INT NOT NULL DEFAULT 1,
  live        BOOLEAN NOT NULL DEFAULT FALSE,
  api_gh      INT,
  api_ga      INT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Também trocar o título do arquivo (linha 1): `-- Bolão da Copa 2026 — schema do banco (Neon Postgres)` → `-- Bolão do Brasileirão 2026/2 — schema do banco (Neon Postgres)`.

- [ ] **Step 2: Criar a migration delta**

```sql
-- V08: troca `fase` (grupos/mata-mata, específico de Copa do Mundo) por
-- `rodada` (número da rodada da Série A) — o Brasileirão não tem fase de
-- mata-mata, então `fase` deixou de fazer sentido como conceito.
-- Roda numa base NOVA (banco recém-criado a partir do schema.sql) — este
-- delta é só documentação/histórico do que mudou em relação ao schema
-- herdado do bolao-copa, não precisa ser aplicado manualmente se o banco
-- já nasceu do schema.sql atualizado.
ALTER TABLE jogos ADD COLUMN IF NOT EXISTS rodada INT;
ALTER TABLE jogos DROP COLUMN IF EXISTS fase;
```

- [ ] **Step 3: Commit**

```bash
git add schema.sql migrations/V08__troca_fase_por_rodada.sql
git commit -m "schema: troca coluna fase por rodada em jogos"
```

---

## Task 3: `api/futebol.js` — ingestão via competição BSA

**Files:**
- Modify: `api/futebol.js`

**Interfaces:**
- Consumes: `TRADUCAO_CLUBES`, `traduzirClube`, `pesoDoJogo` de `../lib/clubes.js` (Task 1).
- Produces: mesma interface pública (`acaoJogosHoje`, `acaoPlacares`, `acaoResultados`, `handler` default) — só muda o que roda por dentro.

- [ ] **Step 1: Trocar o cabeçalho do arquivo — remover `TRADUCAO`/`mapearFase`/`PESO_POR_STAGE`/`pesoDaStage` de seleção, importar de `lib/clubes.js`**

Substituir linhas 1-140 (do topo do arquivo até o fim de `pesoDaStage`) por:

```js
/* /api/futebol — integração com football-data.org (competição BSA, Série A).
   GET ?t=TOKEN&acao=jogos-hoje  → busca partidas do dia (fuso SP) e insere/adota
   GET ?t=TOKEN&acao=resultados  → grava placar final dos jogos FINISHED
   Somente admin. Auth via header X-Auth-Token (env FOOTBALL_DATA_KEY). */

import { sql, autenticar } from "../lib/db.js";
import { traduzirClube, pesoDoJogo } from "../lib/clubes.js";

/* normaliza pra comparação: sem acento, sem caixa, sem borda */
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const FOOTBALL_API = "https://api.football-data.org/v4/competitions/BSA/matches";
```

- [ ] **Step 2: Simplificar `placarBolao` — Brasileirão não tem prorrogação/pênaltis**

Trocar a função `placarBolao` (que hoje trata `regularTime`/`extraTime` pra descontar pênaltis de mata-mata) por uma versão direta — jogo de pontos corridos sempre vale o placar dos 90 minutos, sem ramificação:

```js
/* Placar que o bolão pontua: sempre os 90 minutos (fullTime). Diferente da
   Copa do Mundo, jogo de pontos corridos não tem prorrogação nem pênaltis —
   fullTime já é o placar final em qualquer status. */
function placarBolao(score) {
  const ft = score?.fullTime || {};
  return { home: ft.home ?? null, away: ft.away ?? null };
}
```

- [ ] **Step 3: Atualizar `acaoJogosHoje` pra usar `rodada`/`peso` em vez de `fase`/`peso`**

Dentro do loop de `acaoJogosHoje` (função inteira permanece, só troca o corpo do loop `for (const m of relevantes)`):

```js
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
    const ehHoje = dataSP(m.utcDate) === hoje;
    if (!casa || !fora) continue;

    /* (a) já carimbado — atualiza kickoff, rodada e peso se mudou */
    const achado = porExt.get(externalId);
    if (achado) {
      const rows = await sql`
        UPDATE jogos
           SET kickoff = ${kickoff}, rodada = ${rodada}, peso = ${peso}
         WHERE id = ${achado.id}
           AND (kickoff IS DISTINCT FROM ${kickoff} OR rodada IS DISTINCT FROM ${rodada} OR peso IS DISTINCT FROM ${peso})
        RETURNING id
      `;
      if (rows.length > 0) atualizados++;
      continue;
    }

    /* (b) adoção de legado — qualquer dia da janela */
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
               peso = ${peso}
         WHERE id = ${cand.id}
      `;
      legados.splice(idx, 1);
      atualizados++;
      continue;
    }

    /* (c) novo — só pra hoje (não ressuscita jogos antigos não cadastrados) */
    if (ehHoje) {
      await sql`
        INSERT INTO jogos (casa, fora, kickoff, external_id, rodada, peso)
        VALUES (${casa}, ${fora}, ${kickoff}, ${externalId}, ${rodada}, ${peso})
      `;
      adicionados++;
    }
  }

  return { adicionados, atualizados, total: relevantes.length };
```

- [ ] **Step 4: Rodar build pra garantir que não sobrou nenhuma referência a `mapearFase`/`pesoDaStage`/`TRADUCAO` antigos**

Run: `grep -n "mapearFase\|pesoDaStage\|PESO_POR_STAGE" api/futebol.js`
Expected: nenhum resultado (arquivo vazio de saída).

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add api/futebol.js
git commit -m "feat: api/futebol.js busca Série A (BSA) e grava rodada/peso em vez de fase"
```

---

## Task 4: `api/jogo.js` — cadastro manual usa `rodada`

**Files:**
- Modify: `api/jogo.js`

**Interfaces:**
- Consumes: `pesoDoJogo` de `../lib/clubes.js` (Task 1).
- Produces: mesma interface pública (POST/PUT/DELETE), `POST` agora aceita `rodada` no lugar de `fase`, e `peso` aceita só `1`, `2` ou `3` (antes 1-5).

- [ ] **Step 1: Trocar o handler POST**

Trocar linhas 19-44 (handler POST completo) por:

```js
  if (req.method === "POST") {
    const casa = String(req.body?.casa || "").trim();
    const fora = String(req.body?.fora || "").trim();
    const kickoff = req.body?.kickoff ? new Date(req.body.kickoff) : null;
    const rodada = intOuNull(req.body?.rodada);
    /* peso de pontuação: aceita 1..3 explícito; senão deriva de rodada +
       clássico (ver lib/clubes.js:pesoDoJogo). */
    const pesoReq = intOuNull(req.body?.peso);
    const peso = [1, 2, 3].includes(pesoReq) ? pesoReq : pesoDoJogo(rodada, casa, fora);
    if (!casa || !fora || casa.length > 60 || fora.length > 60) {
      res.status(400).json({ error: "Times inválidos" });
      return;
    }
    if (kickoff && Number.isNaN(kickoff.getTime())) {
      res.status(400).json({ error: "Data/hora inválida" });
      return;
    }
    const rows = await sql`
      INSERT INTO jogos (casa, fora, kickoff, rodada, peso)
      VALUES (${casa}, ${fora}, ${kickoff}, ${rodada}, ${peso})
      RETURNING id
    `;
    res.status(200).json({ ok: true, id: rows[0].id });
    return;
  }
```

- [ ] **Step 2: Importar `pesoDoJogo`**

No topo do arquivo, trocar:
```js
import { sql, autenticar, intOuNull } from "../lib/db.js";
```
por:
```js
import { sql, autenticar, intOuNull } from "../lib/db.js";
import { pesoDoJogo } from "../lib/clubes.js";
```

- [ ] **Step 3: Atualizar o comentário do cabeçalho do arquivo**

Trocar linha 2 (`POST { t, casa, fora, kickoff }   → cria jogo`) por:
```js
   POST { t, casa, fora, kickoff, rodada, peso? } → cria jogo (peso derivado se omitido)
```

- [ ] **Step 4: Verificar**

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add api/jogo.js
git commit -m "feat: api/jogo.js aceita rodada e deriva peso via lib/clubes.js"
```

---

## Task 5: `api/estado.js` — renomear `fase`→`rodada` e `selecoesEliminadas`→`timesForaDaDisputa`

**Files:**
- Modify: `api/estado.js`

**Interfaces:**
- Produces: resposta JSON de `GET /api/estado` com `jogos[].rodada` (em vez de `.fase`) e campo `timesForaDaDisputa` (em vez de `selecoesEliminadas`).

- [ ] **Step 1: Trocar a query de jogos (linha 18)**

De:
```js
    sql`SELECT id, casa, fora, kickoff, gh, ga, fase, peso, live FROM jogos ORDER BY kickoff NULLS LAST, id`,
```
para:
```js
    sql`SELECT id, casa, fora, kickoff, gh, ga, rodada, peso, live FROM jogos ORDER BY kickoff NULLS LAST, id`,
```

- [ ] **Step 2: Trocar a chave de config lida (linha 46) e o comentário (linha 45)**

De:
```js
    /* dados "ao vivo" administrados pelo admin (ver api/live-admin.js): gols
       atuais dos artilheiros escolhidos e seleções marcadas como eliminadas. */
    sql`SELECT chave, valor FROM config WHERE chave IN ('artilheiro_gols', 'selecoes_eliminadas')`,
```
para:
```js
    /* dados "ao vivo" administrados pelo admin: gols atuais dos artilheiros
       escolhidos e times marcados como fora da disputa pelo título. */
    sql`SELECT chave, valor FROM config WHERE chave IN ('artilheiro_gols', 'times_fora_disputa')`,
```

- [ ] **Step 3: Trocar o campo de resposta (linha 84)**

De:
```js
    selecoesEliminadas: Array.isArray(cfg.selecoes_eliminadas) ? cfg.selecoes_eliminadas : [],
```
para:
```js
    timesForaDaDisputa: Array.isArray(cfg.times_fora_disputa) ? cfg.times_fora_disputa : [],
```

- [ ] **Step 4: Verificar**

Run: `grep -n "fase\|selecoesEliminadas\|selecoes_eliminadas" api/estado.js`
Expected: nenhum resultado.

- [ ] **Step 5: Commit**

```bash
git add api/estado.js
git commit -m "refactor: api/estado.js expõe rodada e timesForaDaDisputa"
```

---

## Task 6: `api/resultado-especial.js` — renomear `selecoes-eliminadas`→`times-fora-disputa`

**Files:**
- Modify: `api/resultado-especial.js`

**Interfaces:**
- Consumes: nada novo.
- Produces: `POST { t, tipo: "times-fora-disputa", times: string[] }` (era `tipo: "selecoes-eliminadas", codigos: string[]`).

- [ ] **Step 1: Trocar o bloco de tratamento (linhas 56-68)**

De:
```js
    if (tipoRaw === "selecoes-eliminadas") {
      const codigos = req.body?.codigos;
      if (!Array.isArray(codigos)) {
        res.status(400).json({ error: "codigos inválido" });
        return;
      }
      const limpo = [...new Set(
        codigos.filter((c) => typeof c === "string" && c).map((c) => c.slice(0, 10))
      )];
      await salvarConfig("selecoes_eliminadas", limpo);
      res.status(200).json({ ok: true });
      return;
    }
```
para:
```js
    if (tipoRaw === "times-fora-disputa") {
      const times = req.body?.times;
      if (!Array.isArray(times)) {
        res.status(400).json({ error: "times inválido" });
        return;
      }
      const limpo = [...new Set(
        times.filter((c) => typeof c === "string" && c).map((c) => c.slice(0, 60))
      )];
      await salvarConfig("times_fora_disputa", limpo);
      res.status(200).json({ ok: true });
      return;
    }
```

(o limite sobe de 10 pra 60 caracteres porque agora guarda o nome completo do clube, ex. "Athletico Paranaense", não mais um código de 2 letras.)

- [ ] **Step 2: Atualizar o comentário do topo do arquivo (linhas 8-11)**

De:
```js
/* dados "ao vivo" administrados na mão, guardados na tabela config (JSON):
   'artilheiro_gols' (ranking do artilheiro) e 'selecoes_eliminadas' (visual na
   aba Campeão). Ficam AQUI (e não num endpoint novo) porque o plano Hobby limita
   a 12 Serverless Functions — uma a mais estoura e vira 404. */
```
para:
```js
/* dados "ao vivo" administrados na mão, guardados na tabela config (JSON):
   'artilheiro_gols' (ranking do artilheiro) e 'times_fora_disputa' (visual na
   aba Campeão). Ficam AQUI (e não num endpoint novo) porque o plano Hobby limita
   a 12 Serverless Functions — uma a mais estoura e vira 404. */
```

- [ ] **Step 3: Verificar**

Run: `grep -n "selecoes-eliminadas\|selecoes_eliminadas\|codigos" api/resultado-especial.js`
Expected: nenhum resultado.

- [ ] **Step 4: Commit**

```bash
git add api/resultado-especial.js
git commit -m "refactor: renomeia selecoes-eliminadas para times-fora-disputa"
```

---

## Task 7: `api/campeao.js` — copy

**Files:**
- Modify: `api/campeao.js`

- [ ] **Step 1: Trocar as duas mensagens de erro user-facing**

Linha 47, de:
```js
      res.status(400).json({ error: "Seleção inválida" });
```
para:
```js
      res.status(400).json({ error: "Time inválido" });
```

Linha 81, de:
```js
      res.status(400).json({ error: "Escolha uma seleção antes de confirmar" });
```
para:
```js
      res.status(400).json({ error: "Escolha um time antes de confirmar" });
```

(O nome da coluna `selecao` no banco e no payload JSON fica como está — é um identificador interno, não aparece pro usuário, e renomear tocaria `schema.sql`, `api/estado.js` e `ranking.js` sem ganho nenhum pra quem usa o app.)

- [ ] **Step 2: Atualizar o comentário do topo do arquivo**

Linha 1, de `/* /api/campeao — palpite do campeão da Copa` para `/* /api/campeao — palpite do time campeão`.

- [ ] **Step 3: Commit**

```bash
git add api/campeao.js
git commit -m "copy: api/campeao.js fala em time em vez de seleção"
```

---

## Task 8: `src/ranking.js` — rótulos de peso genéricos + testes

**Files:**
- Modify: `src/ranking.js`
- Modify: `src/ranking.test.mjs`

**Interfaces:**
- Produces: `rotuloDoPeso(peso)` retorna `null` (peso 1), `{texto, destaque:false}` (peso 2) ou `{texto, destaque:true}` (peso 3) — antes ia de 1 a 5 com nomes de fase de mata-mata.

- [ ] **Step 1: Reescrever `rotuloDoPeso` (linhas 23-37 hoje)**

De:
```js
/* Rótulo da rodada a partir do peso. O banco só guarda `fase` como
   grupos|eliminatórias, então o peso é a única pista de QUAL rodada é.
   3× identifica as quartas sem ambiguidade; 4× é semi OU disputa de 3º lugar
   (indistinguíveis com o que temos) — daí o rótulo duplo, em vez de chutar.
   `destaque` liga o realce âmbar das fases decisivas. Null = grupos (sem tag). */
export function rotuloDoPeso(peso) {
  switch (Number(peso)) {
    case 5: return { texto: "🏆 Final", destaque: true };
    case 4: return { texto: "⚔ Semi / 3º lugar", destaque: true };
    case 3: return { texto: "⚔ Quartas de final", destaque: false };
    case 2: return { texto: "⚔ Mata-mata", destaque: false };
    default: return null;
  }
}
export const rotuloDaFase = (jogo) => rotuloDoPeso(pesoDoJogo(jogo));
```
para:
```js
/* Rótulo do peso do jogo (rodada final e/ou clássico regional — ver
   lib/clubes.js:pesoDoJogo). `destaque` liga o realce âmbar da reta final.
   Null = peso normal (sem tag). */
export function rotuloDoPeso(peso) {
  switch (Number(peso)) {
    case 3: return { texto: "🔥 3× pts", destaque: true };
    case 2: return { texto: "⚡ 2× pts", destaque: false };
    default: return null;
  }
}
export const rotuloDaFase = (jogo) => rotuloDoPeso(pesoDoJogo(jogo));
```

(mantém o nome `rotuloDaFase` — é usado em vários pontos do `App.jsx`; renomear é troca cosmética sem ganho, e authoring risk desnecessário no meio de uma mudança maior.)

- [ ] **Step 2: Atualizar os testes de `rotuloDoPeso` em `src/ranking.test.mjs` (linhas 192-198 hoje)**

De:
```js
  check(rotuloDoPeso(5).texto.includes("Final"), "5× rotula Final");
  check(rotuloDoPeso(5).destaque === true, "5× tem destaque");
  check(!rotuloDoPeso(4).texto.includes("🏆"), "4× não pode ser rotulado como Final");
  check(rotuloDoPeso(4).destaque === true, "4× tem destaque");
  check(rotuloDoPeso(3).texto.includes("Quartas"), "3× rotula Quartas");
  check(rotuloDoPeso(2).texto.includes("Mata-mata"), "2× rotula Mata-mata");
  check(rotuloDoPeso(1) === null, "grupos não tem rótulo de mata-mata");
```
para:
```js
  check(rotuloDoPeso(3).texto.includes("3×"), "peso 3 rotula 3×");
  check(rotuloDoPeso(3).destaque === true, "peso 3 tem destaque");
  check(rotuloDoPeso(2).texto.includes("2×"), "peso 2 rotula 2×");
  check(rotuloDoPeso(2).destaque === false, "peso 2 não tem destaque");
  check(rotuloDoPeso(1) === null, "peso normal não tem rótulo");
```

- [ ] **Step 3: Rodar a suíte**

Run: `npm test`
Expected: todas as checagens passam, nenhuma falha impressa.

- [ ] **Step 4: Commit**

```bash
git add src/ranking.js src/ranking.test.mjs
git commit -m "refactor: rotuloDoPeso vira genérico (peso 2×/3×), sem nome de fase de mata-mata"
```

---

## Task 9: `src/App.jsx` — trocar `SELECOES`/`FLAG_CODES`/`fl()` por dados de clube

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `TIMES`, `CLUBE_INFO` de `../lib/clubes.js` (Task 1).
- Produces: `fl(nome)` mantém a mesma assinatura (recebe nome do time, devolve nó React ou `null`) — todos os ~20 call-sites existentes (`fl(jogo.casa)`, etc.) continuam funcionando sem mudança.

- [ ] **Step 1: Importar os dados de clube**

No topo de `src/App.jsx`, junto dos outros imports, adicionar:
```js
import { TIMES, CLUBE_INFO } from "../lib/clubes.js";
```

- [ ] **Step 2: Apagar `FLAG_CODES` e `SELECOES`, reescrever `fl()`**

Trocar o bloco inteiro de `FLAG_CODES` (linha 2495) até o fim de `SELECOES` (linha 2610 hoje — do comentário `/* 46 classificados confirmados...` até o `.sort(...)` de `SELECOES`) por:

```js
/* Badge emoji+cor do clube — mesmo padrão visual do Avatar dos
   participantes (círculo colorido + emoji), em vez da bandeira de país da
   versão Copa do Mundo. */
const fl = (nome) => {
  const info = CLUBE_INFO[nome];
  if (!info) return null;
  return <span className="clube-badge" style={{ background: info.cor }} title={nome}>{info.emoji}</span>;
};
```

`SELECOES` some daqui pra sempre — os call-sites que hoje usam `SELECOES` (busca de campeão, lista de times pra palpite) passam a usar `TIMES` (importado no Step 1). Isso é feito nos próximos steps.

- [ ] **Step 3: Trocar os 2 usos de `SELECOES` no resto do arquivo por `TIMES`**

Run: `grep -n "SELECOES" src/App.jsx`

Vai aparecer duas linhas (uma no filtro de busca de campeão, ~2732, outra no filtro de palpites, ~3400 antes da renumeração dos steps anteriores). Em cada uma, trocar o identificador `SELECOES` por `TIMES` (o formato do filtro — `.filter((s) => normBusca(s).includes(normBusca(campeaoFiltro)))` etc. — não muda, só o array-fonte).

- [ ] **Step 4: Adicionar o CSS do badge**

Em `src/App.jsx`, no bloco `<style>` (procurar por `.flag-img` — a classe antiga do `<img>` de bandeira — pra colocar ao lado), adicionar:

```css
      .clube-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        font-size: 12px;
        line-height: 1;
        margin-right: 4px;
        flex: none;
      }
```

Pode remover a regra `.flag-img` antiga (era `width/height` fixo pra `<img>` de bandeira — não se aplica mais, o elemento agora é um `<span>`).

- [ ] **Step 5: Verificar**

Run: `grep -n "FLAG_CODES\|SELECOES\|flagcdn" src/App.jsx`
Expected: nenhum resultado.

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: App.jsx usa emoji+cor por clube em vez de bandeira de seleção"
```

---

## Task 10: `src/App.jsx` — remover feature de Elo/chances de vitória

**Files:**
- Modify: `src/App.jsx`

Esta feature (achada na exploração, não estava na proposta original) fica **morta** assim que `FLAG_CODES` vira `CLUBE_INFO` — as chaves não vão bater com o `ELO_BASE` (que é indexado por código de país), então `chances` sempre será `null` e o bloco JSX (que já é condicional) nunca mais renderiza. Não há dado de Elo de clube brasileiro levantado pra este projeto, então em vez de deixar código morto, ele é removido.

**Interfaces:**
- Produces: `ModalEstatisticas` não calcula mais `chances`; o bloco "CHANCES DE GANHAR" não existe mais no JSX.

- [ ] **Step 1: Apagar `ELO_BASE`, `eloAjustado`, `chancesDoJogo`**

Apagar o bloco inteiro das linhas 1345-1399 (comentário `/* Snapshot de Elo...` até o fim da função `chancesDoJogo`).

- [ ] **Step 2: Remover o cálculo de `chances` e `equilibrado` em `ModalEstatisticas`**

Na função `ModalEstatisticas` (linha ~1403), remover:
```js
  const chances = chancesDoJogo(eloAjustado(jogos), jogo.casa, jogo.fora);
  const pct = (x) => Math.round(x * 100);
  /* Elo e mercado discordam em jogos apertados; não cravamos "Favorito" quando
     a diferença de chance de vitória é pequena — mostramos "equilibrado". */
  const equilibrado = chances && Math.abs(chances.casa - chances.fora) < 0.06;
```

- [ ] **Step 3: Remover o bloco JSX "CHANCES DE GANHAR"**

Apagar o bloco `{chances && (...)}` inteiro (linhas 1456-1490 hoje, do `{chances && (` até o `)}` correspondente antes do bloco `{tabela.length > 0 && (`).

- [ ] **Step 4: Verificar**

Run: `grep -n "ELO_BASE\|eloAjustado\|chancesDoJogo\|CHANCES DE GANHAR" src/App.jsx`
Expected: nenhum resultado.

Run: `npm run build`
Expected: build termina sem erro (confirma que nada mais referenciava essas funções).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "chore: remove feature de Elo/chances de vitória (sem dado de clube pra sustentar)"
```

---

## Task 11: `src/App.jsx` — tabela de grupo vira tabela completa do campeonato

**Files:**
- Modify: `src/App.jsx`

A Copa tinha "grupo" (4 seleções, round-robin); o Brasileirão é round-robin de 20 clubes o campeonato inteiro. Em vez de apagar `grupoDoJogo`/`tabelaDoGrupo` como código morto, a trava de fase é removida e a função passa a considerar todos os clubes que já jogaram no bolão — vira a tabela completa do 2º turno, reaproveitando o cálculo de V/E/D/GP/GC/PTS que já existe e é usado.

**Interfaces:**
- Produces: `tabelaCampeonato(jogos)` (nova, substitui `grupoDoJogo`+`tabelaDoGrupo`) → array ordenado de linhas `{time, j, v, e, d, gp, gc, pts, sg}` com TODOS os clubes que aparecem em `jogos`.

- [ ] **Step 1: Trocar `grupoDoJogo` + `tabelaDoGrupo` (linhas 1267-1299 hoje) por uma função única**

De:
```js
/* grupo inferido dos nossos próprios jogos: na fase de grupos (round-robin de
   4), os times que enfrentam casa/fora são justamente os 4 do grupo. Mata-mata
   não tem grupo (devolve []). */
function grupoDoJogo(jogos, jogo) {
  if (jogo.fase !== "grupos") return [];
  const { casa: a, fora: b } = jogo;
  const set = new Set([a, b]);
  for (const j of jogos) {
    if (j.fase !== "grupos") continue;
    if (j.casa === a || j.fora === a || j.casa === b || j.fora === b) {
      set.add(j.casa); set.add(j.fora);
    }
  }
  return [...set];
}

/* tabela do grupo calculada dos nossos jogos (inclui ao vivo via temPlacar). */
function tabelaDoGrupo(jogos, times) {
  const tset = new Set(times);
  const tab = {};
  for (const t of times) tab[t] = { time: t, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0 };
  for (const j of jogos) {
    if (j.fase !== "grupos" || !tset.has(j.casa) || !tset.has(j.fora) || !temPlacar(j)) continue;
    const A = tab[j.casa], B = tab[j.fora];
    A.j++; B.j++;
    A.gp += j.gh; A.gc += j.ga; B.gp += j.ga; B.gc += j.gh;
    if (j.gh > j.ga) { A.v++; A.pts += 3; B.d++; }
    else if (j.gh < j.ga) { B.v++; B.pts += 3; A.d++; }
    else { A.e++; B.e++; A.pts++; B.pts++; }
  }
  return Object.values(tab)
    .map((r) => ({ ...r, sg: r.gp - r.gc }))
    .sort((x, y) => y.pts - x.pts || y.sg - x.sg || y.gp - x.gp || x.time.localeCompare(y.time, "pt-BR"));
}
```
para:
```js
/* Tabela do campeonato (2º turno) calculada dos nossos próprios jogos —
   inclui ao vivo via temPlacar. Antes era "tabela do grupo" (round-robin de
   4 seleções); no Brasileirão é round-robin de todos os clubes cadastrados
   no bolão, então não há mais trava de fase — considera todo mundo. */
function tabelaCampeonato(jogos) {
  const tab = {};
  for (const j of jogos) {
    if (!tab[j.casa]) tab[j.casa] = { time: j.casa, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0 };
    if (!tab[j.fora]) tab[j.fora] = { time: j.fora, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0 };
    if (!temPlacar(j)) continue;
    const A = tab[j.casa], B = tab[j.fora];
    A.j++; B.j++;
    A.gp += j.gh; A.gc += j.ga; B.gp += j.ga; B.gc += j.gh;
    if (j.gh > j.ga) { A.v++; A.pts += 3; B.d++; }
    else if (j.gh < j.ga) { B.v++; B.pts += 3; A.d++; }
    else { A.e++; B.e++; A.pts++; B.pts++; }
  }
  return Object.values(tab)
    .map((r) => ({ ...r, sg: r.gp - r.gc }))
    .sort((x, y) => y.pts - x.pts || y.sg - x.sg || y.gp - x.gp || x.time.localeCompare(y.time, "pt-BR"));
}
```

- [ ] **Step 2: Trocar o uso em `ModalEstatisticas`**

De:
```js
  const grupo = grupoDoJogo(jogos, jogo);
  const tabela = grupo.length ? tabelaDoGrupo(jogos, grupo) : [];
```
para:
```js
  const tabela = tabelaCampeonato(jogos);
```

- [ ] **Step 3: Renomear o título da seção no JSX**

De:
```js
            <div className="secao-titulo">CLASSIFICAÇÃO DO GRUPO</div>
```
para:
```js
            <div className="secao-titulo">TABELA DO CAMPEONATO</div>
```

- [ ] **Step 4: Verificar**

Run: `grep -n "grupoDoJogo\|tabelaDoGrupo\|CLASSIFICAÇÃO DO GRUPO" src/App.jsx`
Expected: nenhum resultado.

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: tabela de grupo vira tabela completa do campeonato (round-robin de 20 clubes)"
```

---

## Task 12: `src/App.jsx` — form de admin: "Rodada" em vez de "Fase do jogo"

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `pesoDoJogo` de `../lib/clubes.js` (mesmo import de `TIMES`/`CLUBE_INFO` do Task 9 — adicionar `pesoDoJogo` na mesma linha de import).

- [ ] **Step 1: Atualizar o import do Task 9 pra incluir `pesoDoJogo` (com alias — `App.jsx` já importa um `pesoDoJogo` diferente de `src/ranking.js`, que opera sobre o objeto `jogo` inteiro, não sobre `rodada/casa/fora`; os dois nomes colidiriam)**

De:
```js
import { TIMES, CLUBE_INFO } from "../lib/clubes.js";
```
para:
```js
import { TIMES, CLUBE_INFO, pesoDoJogo as pesoDoJogoBase } from "../lib/clubes.js";
```

- [ ] **Step 2: Trocar o state `fase` por `rodada`**

Linha 1541, de:
```js
  const [fase, setFase] = useState("grupos");
```
para:
```js
  const [rodada, setRodada] = useState("");
```

- [ ] **Step 3: Reescrever `addJogo` inteira (linhas 1625-1640 hoje)**

De:
```js
  const addJogo = async () => {
    if (!casa.trim() || !fora.trim()) return;
    try {
      /* o seletor combina fase+peso: no banco `fase` é só grupos|eliminatórias,
         e o peso é que diz a rodada (2× mata-mata, 3× quartas, 4× semi/3º, 5× final) */
      const faseReal = fase === "grupos" ? "grupos" : "eliminatórias";
      const PESO_DO_SELETOR = { grupos: 1, "eliminatórias": 2, quartas: 3, semi: 4, final: 5 };
      const peso = PESO_DO_SELETOR[fase] ?? 1;
      await api("/api/jogo", {
        method: "POST",
        body: JSON.stringify({ t: token, casa, fora, kickoff: kickoff ? new Date(kickoff).toISOString() : null, fase: faseReal, peso }),
      });
      setCasa(""); setFora(""); setKickoff(""); setFase("grupos");
      recarregar();
    } catch (e) { setAviso(e.message); }
  };
```
para:
```js
  const addJogo = async () => {
    if (!casa.trim() || !fora.trim()) return;
    try {
      /* peso vem de lib/clubes.js: escalona por rodada e sobe pra 2× em
         clássico regional, pegando o maior dos dois critérios. */
      const peso = pesoDoJogoBase(rodada, casa, fora);
      await api("/api/jogo", {
        method: "POST",
        body: JSON.stringify({ t: token, casa, fora, kickoff: kickoff ? new Date(kickoff).toISOString() : null, rodada: rodada ? Number(rodada) : null, peso }),
      });
      setCasa(""); setFora(""); setKickoff(""); setRodada("");
      recarregar();
    } catch (e) { setAviso(e.message); }
  };
```

(`pesoDoJogoBase` é o alias definido no Step 1 deste Task.)

- [ ] **Step 4: Trocar o `<select>` de fase pelo `<input>` de rodada no JSX (linhas 1739-1745 hoje)**

De:
```js
              <select value={fase} onChange={(e) => setFase(e.target.value)} className="select-fase" aria-label="Fase do jogo">
                <option value="grupos">Fase de grupos (1×)</option>
                <option value="eliminatórias">Mata-mata — 16-avos/oitavas (2×)</option>
                <option value="quartas">Quartas de final (3×)</option>
                <option value="semi">Semifinal / 3º lugar (4×)</option>
                <option value="final">Final (5×)</option>
              </select>
```
para:
```js
              <input
                type="number"
                min="19"
                max="38"
                value={rodada}
                onChange={(e) => setRodada(e.target.value)}
                placeholder="Rodada"
                className="input-rodada"
                aria-label="Rodada do jogo"
              />
```

- [ ] **Step 5: Verificar**

Run: `grep -n "\bfase\b\|select-fase\|PESO_DO_SELETOR" src/App.jsx`
Expected: nenhum resultado (toda referência a `fase` como state/variável de UI já deve ter sumido — a coluna `jogo.fase` vinda da API também já não existe desde o Task 5).

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: cadastro manual de jogo usa rodada em vez de fase, peso calculado automaticamente"
```

---

## Task 13: `src/App.jsx` — remover badge/aviso de mata-mata (`jogo.fase === "eliminatórias"`)

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: a tag de peso na lista de jogos passa a aparecer sempre que `peso > 1` (não só quando `fase === "eliminatórias"`); o aviso "90min + prorrogação" desaparece (Brasileirão não tem prorrogação).

- [ ] **Step 1: Simplificar a condição da tag de peso na lista de jogos**

Linha ~1816, de:
```js
                        {m.fase === "eliminatórias" && rotuloDaFase(m) && (
                          <span className={"tag tag-elim" + (rotuloDaFase(m).destaque ? " tag-final" : "")}>
                            {rotuloDaFase(m).texto} · {pesoDoJogo(m)}× pts
                          </span>
                        )}
```
para:
```js
                        {rotuloDaFase(m) && (
                          <span className={"tag tag-elim" + (rotuloDaFase(m).destaque ? " tag-final" : "")}>
                            {rotuloDaFase(m).texto} · {pesoDoJogo(m)}× pts
                          </span>
                        )}
```

(esse `pesoDoJogo(m)` é o de `src/ranking.js` — que recebe o objeto `jogo` inteiro — e é diferente do `pesoDoJogoBase(rodada, casa, fora)` de `lib/clubes.js` já com alias resolvido no Task 12, Step 1. São duas funções de mesmo nome-base em módulos diferentes; o alias evita a colisão de import.)

- [ ] **Step 2: Remover o aviso de 90min+prorrogação em `ResultadoAdmin`**

Linha ~1913, apagar:
```js
      {jogo.fase === "eliminatórias" && (
        <span className="aviso-90min" title="Lançar o placar após a prorrogação (90min + prorrogação) — sem contar pênaltis">⏱ 90min + prorrog.</span>
      )}
```

- [ ] **Step 3: Verificar**

Run: `grep -n "eliminatórias\|aviso-90min" src/App.jsx`
Expected: nenhum resultado.

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "chore: remove badge e aviso de mata-mata (Brasileirão não tem prorrogação)"
```

---

## Task 14: `src/App.jsx` — copy do `BonusAdmin` (campeão + times fora da disputa)

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `estado.timesForaDaDisputa` (renomeado no Task 5, era `estado.selecoesEliminadas`).

- [ ] **Step 1: Trocar `eliminadaSel` pra usar o nome do clube direto (sem código)**

Linha 2729, de:
```js
  const eliminadaSel = (sel) => (estado.selecoesEliminadas || []).includes(FLAG_CODES[sel]);
```
para:
```js
  const foraDaDisputa = (time) => (estado.timesForaDaDisputa || []).includes(time);
```

(o `code = FLAG_CODES[sel]` não existe mais — `CLUBE_INFO` não tem um código curto, só emoji+cor, e não precisamos de um: clubes não têm o problema de nome duplicado EN/PT que as seleções tinham, então dá pra guardar o **nome do clube** direto na lista de "fora da disputa".)

- [ ] **Step 2: Trocar `salvarEliminadas` pra enviar `times` em vez de `codigos`**

Linha ~2700, de:
```js
  const salvarEliminadas = async (codigos) => {
    setSalvandoElim(true);
    try {
      await api("/api/resultado-especial", { method: "POST", body: JSON.stringify({ t: token, tipo: "selecoes-eliminadas", codigos }) });
      await recarregar();
    } catch (e) { setAviso(e.message); }
    setSalvandoElim(false);
  };
```
para:
```js
  const salvarForaDaDisputa = async (times) => {
    setSalvandoElim(true);
    try {
      await api("/api/resultado-especial", { method: "POST", body: JSON.stringify({ t: token, tipo: "times-fora-disputa", times }) });
      await recarregar();
    } catch (e) { setAviso(e.message); }
    setSalvandoElim(false);
  };
```

- [ ] **Step 3: Trocar o bloco JSX "SELEÇÕES ELIMINADAS" (linhas 2808-2844 hoje)**

De:
```js
      {/* Seleções eliminadas (manual, visual na aba Campeão) */}
      {selsCampeao.length > 0 && (
        <div className="cartao form-jogo" style={{ marginBottom: "10px" }}>
          <div className="secao-titulo" style={{ margin: "0 0 4px" }}>SELEÇÕES ELIMINADAS</div>
          <p className="dica" style={{ marginTop: 0, marginBottom: "8px", opacity: .7 }}>
            Marca a seleção eliminada → o card de quem a escolheu fica acinzentado na aba Campeão. Reversível.
          </p>
          {selsCampeao.map((sel) => {
            const elim = eliminadaSel(sel);
            const code = FLAG_CODES[sel];
            return (
              <div key={sel} className={"cartao palpite-linha" + (elim ? " card-eliminado" : "")} style={{ marginBottom: "6px" }}>
                <span className="palpite-nome">
                  {fl(sel)}{sel}
                  {elim && <span className="tag-eliminada" style={{ marginLeft: 8 }}>✗ eliminada</span>}
                </span>
                {elim ? (
                  <button className="botao-fantasma" style={{ padding: "4px 10px", fontSize: "13px" }}
                    onClick={() => salvarEliminadas((estado.selecoesEliminadas || []).filter((c) => c !== code))}
                    disabled={salvandoElim}>↩ desmarcar</button>
                ) : pedindoElim === sel ? (
                  <span style={{ display: "inline-flex", gap: "6px", flex: "none" }}>
                    <button className="botao" style={{ padding: "4px 10px", fontSize: "13px" }}
                      onClick={async () => { await salvarEliminadas([...new Set([...(estado.selecoesEliminadas || []), code])]); setPedindoElim(null); }}
                      disabled={salvandoElim || !code}>Sim, eliminar</button>
                    <button className="botao-fantasma" style={{ padding: "4px 10px", fontSize: "13px" }}
                      onClick={() => setPedindoElim(null)}>Não</button>
                  </span>
                ) : (
                  <button className="botao-fantasma" style={{ padding: "4px 10px", fontSize: "13px" }}
                    onClick={() => setPedindoElim(sel)} disabled={!code}
                    title={code ? "" : "Sem código de bandeira — não dá pra marcar"}>marcar eliminada</button>
                )}
              </div>
            );
          })}
```
para:
```js
      {/* Times fora da disputa pelo título (manual, visual na aba Campeão) */}
      {selsCampeao.length > 0 && (
        <div className="cartao form-jogo" style={{ marginBottom: "10px" }}>
          <div className="secao-titulo" style={{ margin: "0 0 4px" }}>TIMES FORA DA DISPUTA PELO TÍTULO</div>
          <p className="dica" style={{ marginTop: 0, marginBottom: "8px", opacity: .7 }}>
            Marca o time fora da disputa → o card de quem o escolheu fica acinzentado na aba Campeão. Reversível.
          </p>
          {selsCampeao.map((sel) => {
            const fora = foraDaDisputa(sel);
            return (
              <div key={sel} className={"cartao palpite-linha" + (fora ? " card-eliminado" : "")} style={{ marginBottom: "6px" }}>
                <span className="palpite-nome">
                  {fl(sel)}{sel}
                  {fora && <span className="tag-eliminada" style={{ marginLeft: 8 }}>✗ fora da disputa</span>}
                </span>
                {fora ? (
                  <button className="botao-fantasma" style={{ padding: "4px 10px", fontSize: "13px" }}
                    onClick={() => salvarForaDaDisputa((estado.timesForaDaDisputa || []).filter((c) => c !== sel))}
                    disabled={salvandoElim}>↩ desmarcar</button>
                ) : pedindoElim === sel ? (
                  <span style={{ display: "inline-flex", gap: "6px", flex: "none" }}>
                    <button className="botao" style={{ padding: "4px 10px", fontSize: "13px" }}
                      onClick={async () => { await salvarForaDaDisputa([...new Set([...(estado.timesForaDaDisputa || []), sel])]); setPedindoElim(null); }}
                      disabled={salvandoElim}>Sim, marcar</button>
                    <button className="botao-fantasma" style={{ padding: "4px 10px", fontSize: "13px" }}
                      onClick={() => setPedindoElim(null)}>Não</button>
                  </span>
                ) : (
                  <button className="botao-fantasma" style={{ padding: "4px 10px", fontSize: "13px" }}
                    onClick={() => setPedindoElim(sel)}>marcar fora da disputa</button>
                )}
              </div>
            );
          })}
```

- [ ] **Step 4: Copy da seção "SELEÇÃO CAMPEÃ" (linhas 2740-2753 hoje)**

De:
```js
        <div className="secao-titulo" style={{ margin: "0 0 8px" }}>SELEÇÃO CAMPEÃ · +{BONUS_CAMPEAO} pts para quem acertou</div>
```
para:
```js
        <div className="secao-titulo" style={{ margin: "0 0 8px" }}>TIME CAMPEÃO · +{BONUS_CAMPEAO} pts para quem acertou</div>
```

E o placeholder de busca, de:
```js
              placeholder="Buscar seleção campeã…"
```
para:
```js
              placeholder="Buscar time campeão…"
```

- [ ] **Step 5: Copy do botão/aviso de confirmação (linhas 2775-2781 hoje)**

De `🔒 Confirmar campeã e distribuir +{BONUS_CAMPEAO} pts` para `🔒 Confirmar campeão e distribuir +{BONUS_CAMPEAO} pts`.

De `⚠ Confirmar <strong>{campeaoSel}</strong> como campeã? Não poderá alterar.` para `⚠ Confirmar <strong>{campeaoSel}</strong> como campeão? Não poderá alterar.`

- [ ] **Step 6: Copy dos textos de busca de time (fora do BonusAdmin, aba Palpites — linhas 3441/3462 hoje)**

De `placeholder="Buscar seleção…"` para `placeholder="Buscar time…"`.
De `"Nenhuma seleção encontrada."` para `"Nenhum time encontrado."`.

- [ ] **Step 7: Verificar**

Run: `grep -n "seleç\|FLAG_CODES\|selecoesEliminadas\|eliminadaSel\|salvarEliminadas" src/App.jsx`
Expected: nenhum resultado.

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "copy: BonusAdmin e busca de time falam em 'time' em vez de 'seleção'"
```

---

## Task 15: `src/App.jsx` — `ModalRegras` e "eyebrow" do topo

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Trocar o eyebrow do topo (linha 434)**

De:
```js
        <div className="topo-eyebrow">COPA DO MUNDO · 2026</div>
```
para:
```js
        <div className="topo-eyebrow">BRASILEIRÃO · 2º TURNO 2026</div>
```

(`<h1 className="topo-titulo">BOLÃO DOS GURIS</h1>` na linha seguinte fica igual — decisão do Leonardo de manter o nome.)

- [ ] **Step 2: Reescrever a seção "Peso por fase" do `ModalRegras` (linhas 3817-3834 hoje)**

De:
```js
          <div className="regras-secao">Peso por fase 🔥</div>
          <p className="regras-p">
            Os pontos de cada jogo são <strong>multiplicados</strong> pela fase — erros no começo pesam menos,
            acertos no fim valem mais:
          </p>
          <div className="regras-pesos">
            <div className="regras-peso"><span className="regras-peso-x">1×</span><span>Fase de grupos</span></div>
            <div className="regras-peso"><span className="regras-peso-x">2×</span><span>16-avos e oitavas</span></div>
            <div className="regras-peso"><span className="regras-peso-x">3×</span><span>Quartas de final</span></div>
            <div className="regras-peso regras-peso-final"><span className="regras-peso-x">4×</span><span>Semifinal e 3º lugar</span></div>
            <div className="regras-peso regras-peso-final"><span className="regras-peso-x">5×</span><span>Final</span></div>
          </div>
          <p className="regras-p">
            Exemplo: placar exato na <strong>final</strong> vale <strong>{PTS_EXATO * 5} pts</strong> (3 × 5);
            nas <strong>quartas</strong> vale <strong>{PTS_EXATO * 3} pts</strong> (3 × 3);
            resultado certo nas <strong>oitavas</strong> vale <strong>{PTS_RESULTADO * 2} pts</strong> (1 × 2).
            Os bônus de campeã e artilheiro <strong>não</strong> têm peso.
          </p>
```
para:
```js
          <div className="regras-secao">Peso por rodada e clássico 🔥</div>
          <p className="regras-p">
            Os pontos de cada jogo são <strong>multiplicados</strong> pela rodada — quanto mais perto do fim
            do turno, mais vale — e clássicos regionais também pesam mais:
          </p>
          <div className="regras-pesos">
            <div className="regras-peso"><span className="regras-peso-x">1×</span><span>Rodadas 19 a 30</span></div>
            <div className="regras-peso"><span className="regras-peso-x">2×</span><span>Rodadas 31 a 35, ou clássico regional em qualquer rodada</span></div>
            <div className="regras-peso regras-peso-final"><span className="regras-peso-x">3×</span><span>Rodadas 36 a 38 (reta final)</span></div>
          </div>
          <p className="regras-p">
            Exemplo: placar exato numa rodada da <strong>reta final (36-38)</strong> vale <strong>{PTS_EXATO * 3} pts</strong> (3 × 3);
            resultado certo num <strong>clássico</strong> (Fla-Flu, Gre-Nal, Choque-Rei etc.) fora da reta final vale <strong>{PTS_RESULTADO * 2} pts</strong> (1 × 2).
            Quando as duas regras se aplicam ao mesmo jogo, vale o <strong>maior</strong> peso, não a soma.
            Os bônus de campeão e artilheiro <strong>não</strong> têm peso.
          </p>
```

- [ ] **Step 3: Apagar a seção "Mata-mata ⚔" (linhas 3846-3855 hoje)**

Apagar o bloco inteiro:
```js
          <div className="regras-secao">Mata-mata ⚔</div>
          <p className="regras-p">
            Nos jogos eliminatórios, o palpite vale pelo placar dos <strong>90 minutos + a prorrogação inteira</strong>.
            Os <strong>pênaltis ficam de fora</strong>.
          </p>
          <p className="regras-p">
            Exemplo: jogo está <strong>1×1</strong> nos 90min, sai um gol na prorrogação e termina <strong>2×1</strong>
            (sem pênaltis) → vale o <strong>2×1</strong>. Se ficar <strong>1×1</strong> na prorrogação e for decidido
            nos <strong>pênaltis</strong>, vale o <strong>1×1</strong> — o resultado dos pênaltis não conta.
          </p>
```

(Brasileirão não tem prorrogação/pênaltis em jogo de pontos corridos — a seção inteira não se aplica.)

- [ ] **Step 4: Copy dos bônus especiais (linhas 3836-3844 hoje)**

De:
```js
          <div className="regras-secao">Bônus especiais</div>
          <div className="regras-item">
            <span className="pts pts-3">+{BONUS_CAMPEAO} pts</span>
            <span>Acertar a seleção campeã (palpite travado antes da Copa)</span>
          </div>
          <div className="regras-item">
            <span className="pts pts-1">+{BONUS_ARTILHEIRO} pts</span>
            <span>Acertar o artilheiro da Copa (palpite travado antes da Copa)</span>
          </div>
```
para:
```js
          <div className="regras-secao">Bônus especiais</div>
          <div className="regras-item">
            <span className="pts pts-3">+{BONUS_CAMPEAO} pts</span>
            <span>Acertar o time campeão do turno (palpite travado antes do fim da rodada 38)</span>
          </div>
          <div className="regras-item">
            <span className="pts pts-1">+{BONUS_ARTILHEIRO} pts</span>
            <span>Acertar o artilheiro do turno (palpite travado antes do fim da rodada 38)</span>
          </div>
```

- [ ] **Step 5: Copy do desempate (linhas 3857-3860 hoje)**

De:
```js
          <div className="regras-item"><span className="pts pts-3">2º</span><span>Acertou a seleção campeã</span></div>
          <div className="regras-item"><span className="pts pts-3">3º</span><span>Acertou o artilheiro da Copa</span></div>
```
para:
```js
          <div className="regras-item"><span className="pts pts-3">2º</span><span>Acertou o time campeão</span></div>
          <div className="regras-item"><span className="pts pts-3">3º</span><span>Acertou o artilheiro do turno</span></div>
```

- [ ] **Step 6: Verificar**

Run: `grep -n "Copa\|seleção\|Mundial\|mata-mata\|Mata-mata\|prorrog" src/App.jsx`
Expected: nenhum resultado.

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "copy: ModalRegras explica peso por rodada/clássico, remove seção de mata-mata"
```

---

## Task 16: Branding — `package.json`, `README.md`, `index.html`, manifest da PWA

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `index.html`
- Modify: `api/manifest.js`
- Modify: `public/manifest.json`

- [ ] **Step 1: `package.json` — nome do projeto**

De:
```json
  "name": "bolao-copa-2026",
```
para:
```json
  "name": "bolao-brasileirao-2026-2",
```

- [ ] **Step 2: `api/manifest.js` — manifest dinâmico**

De:
```js
  const manifest = {
    id: "/bolao-copa-2026",
    name: "Bolão da Copa 2026",
    short_name: "Bolão Copa",
    description: "Acompanhe o bolão da Copa do Mundo 2026",
```
para:
```js
  const manifest = {
    id: "/bolao-brasileirao-2026-2",
    name: "Bolão dos Guris — Brasileirão 2026/2",
    short_name: "Bolão Guris",
    description: "Acompanhe o bolão do 2º turno do Brasileirão Série A 2026",
```

- [ ] **Step 3: `public/manifest.json` — espelha o dinâmico (mesmos 4 campos)**

De:
```json
{
  "name": "Bolão da Copa 2026",
  "short_name": "Bolão Copa",
  "description": "Acompanhe o bolão da Copa do Mundo 2026",
```
para:
```json
{
  "name": "Bolão dos Guris — Brasileirão 2026/2",
  "short_name": "Bolão Guris",
  "description": "Acompanhe o bolão do 2º turno do Brasileirão Série A 2026",
```

- [ ] **Step 4: `index.html` — meta tags e título**

Linha 7, de `<meta name="description" content="Acompanhe o bolão da Copa do Mundo 2026" />` para `<meta name="description" content="Acompanhe o bolão do 2º turno do Brasileirão Série A 2026" />`.

Linha 10, de `<meta name="apple-mobile-web-app-title" content="Bolão Copa" />` para `<meta name="apple-mobile-web-app-title" content="Bolão Guris" />`.

Linha 24, de `<title>Bolão da Copa 2026</title>` para `<title>Bolão dos Guris — Brasileirão 2026/2</title>`.

- [ ] **Step 5: `README.md` — título e menções à Copa**

Linha 1, de `# ⚽ Bolão da Copa 2026 — versão compartilhada` para `# ⚽ Bolão dos Guris — Brasileirão 2026/2`.

Linha 25 (variáveis de ambiente), de:
```md
| `FOOTBALL_DATA_KEY` | sua chave grátis de https://www.football-data.org/client/register (free tier cobre a Copa do Mundo) |
```
para:
```md
| `FOOTBALL_DATA_KEY` | sua chave grátis de https://www.football-data.org/client/register (free tier cobre a Série A, código de competição `BSA`) |
```

Linha 17, de:
```md
3. Rode também `migrations/V2__external_id.sql` (adiciona a coluna `external_id` em `jogos`, usada pela busca automática). Pode rodar a qualquer momento — é não-destrutivo e idempotente.
```
para (esse arquivo V2 já está arquivado em `_legado/` e incorporado ao `schema.sql` — a referência já estava desatualizada antes deste plano):
```md
3. O `schema.sql` já é a planta completa e atual — rodar ele uma vez num banco vazio cobre tudo (não precisa rodar migrations extras num banco novo).
```

- [ ] **Step 6: Verificar**

Run: `grep -rn "Copa\|Mundial" package.json README.md index.html api/manifest.js public/manifest.json`
Expected: nenhum resultado.

- [ ] **Step 7: Commit**

```bash
git add package.json README.md index.html api/manifest.js public/manifest.json
git commit -m "chore: rebranding pra Bolão dos Guris — Brasileirão 2026/2"
```

---

## Task 17: Verificação final

**Files:** nenhum (só leitura/execução).

- [ ] **Step 1: Build limpo**

Run: `npm run build`
Expected: sai `✓ built in ...` sem warning de import quebrado.

- [ ] **Step 2: Suíte de testes**

Run: `npm test`
Expected: todas as checagens de `src/ranking.test.mjs` passam.

- [ ] **Step 3: Varredura final por qualquer resíduo de Copa do Mundo**

Run: `grep -rniE "copa do mundo|seleç[aã]o|\bmundial\b|mata-mata|flagcdn" src/ api/ lib/ *.md *.json *.html --include="*.js" --include="*.jsx" --include="*.md" --include="*.json" --include="*.html" 2>/dev/null`
Expected: nenhum resultado (fora de `proposta-brasileirao-segundo-turno.md`/`proposta-carta-coringa.md`, que são documentos históricos e não fazem parte do produto).

- [ ] **Step 4: Rodar localmente e conferir visualmente (se houver `vercel dev`/env local configurado)**

Run: `npm run dev` (ou `vercel dev` se as envs locais já estiverem puxadas com `vercel env pull .env.local`)
Verificar manualmente no navegador: eyebrow do topo mostra "BRASILEIRÃO · 2º TURNO 2026", cadastro de jogo pede "Rodada" em vez de "Fase", badges de time aparecem como círculo emoji+cor, `ModalRegras` explica peso por rodada/clássico sem menção a mata-mata, `ModalEstatisticas` mostra "TABELA DO CAMPEONATO" em vez da tabela de grupo antiga e não mostra mais "CHANCES DE GANHAR".

Esta etapa não é bloqueante pra considerar o código pronto (não há banco/participantes reais neste ambiente ainda — isso é o Passo 4 do checklist de infra da seção 6 da proposta original, fora do escopo deste plano de código), mas é o jeito de pegar qualquer detalhe visual que passou despercebido antes de subir pra produção.

- [ ] **Step 5: Commit final (se o Step 4 revelar ajustes)**

Se o passeio manual do Step 4 revelar qualquer ajuste de copy/CSS esquecido, corrigir e commitar separadamente com mensagem descrevendo o ajuste pontual.
