# 🟢 Proposta: Bolão do Brasileirão — 2º turno 2026

> **Para o próximo Claude Code:** este documento é o briefing completo pra você começar a
> trabalhar nesse novo projeto (fork/cópia deste repositório `bolao-copa`) sem ter visto a
> conversa onde isso foi decidido. Leia inteiro antes de propor código. O dono do projeto é
> o Leonardo — trate isso como uma continuação do mesmo produto, não como um projeto do zero:
> a maior parte da engenharia já existe e funciona, só o **formato do campeonato** muda.

---

## 1. O que é isto, em uma frase

O `bolao-copa` (este repo) é um bolão de palpites pra Copa do Mundo 2026, com ranking,
pontuação por peso de fase, bônus de campeão/artilheiro, PWA, tudo rodando em produção. A
ideia agora é **fazer uma versão irmã pro 2º turno do Campeonato Brasileiro Série A 2026**,
que **começa hoje na rodada 19 de 38** (a data em que essa proposta foi escrita: 2026-07-16).
Não é reescrever —
é **forkar este repo e adaptar as partes que são específicas de Copa do Mundo**.

---

## 2. A mudança de formato (o cerne de tudo)

| | Copa do Mundo (este app) | Brasileirão 2º turno (novo) |
|---|---|---|
| Formato | Grupos + mata-mata | Pontos corridos (todo mundo joga com todo mundo 1×) |
| Duração | ~1 mês, compacto | ~5-6 meses (turno inteiro) |
| Nº de jogos | ~104 (Copa 2026, 48 seleções) | rodada 19 à 38 (20 rodadas) × 10 jogos = **200 jogos** |
| "Fase" do jogo | grupos → 16-avos → oitavas → quartas → semi → final | **não existe** — é tudo "rodada N" de uma liga |
| Peso por fase | 1×/2×/3×/4×/5× (escalona até a final) | **não faz sentido do jeito atual** — não há final de mata-mata |
| Quem participa | Seleções (32/48 países) | **20 clubes** |
| "Campeão" (bônus) | Time que vence a final | Time campeão da Série A **no fim da temporada** (não tem uma partida-final; é definido pela tabela) |
| Identidade visual | Bandeira do país (emoji 🇧🇷) | **Não tem** — precisa de emoji/cor por clube (mesmo esquema que já existe pro avatar dos participantes) |

Isso muda **pouco código de infraestrutura** e **bastante configuração/dado**. Ver seção 4.

---

## 3. O que reaproveitar 100% como está

Praticamente toda a "engenharia" do bolão não sabe nem se importa que é Copa do Mundo:

- **`src/ranking.js`** — motor de pontuação (exato/resultado, desempate, `compararRanking`,
  `criterioDesempate`). Testado (`ranking.test.mjs`). Único cuidado: os valores de
  `pesoDoJogo`/fase (ver seção 4).
- **Regra de ouro** (palpite trava no kickoff) — validada no servidor (`api/palpite.js`), não
  muda em nada.
- **Auth por token, participantes, admin** (`lib/db.js`, `api/participante.js`) — genérico.
- **Ranking, pódio, modal de palpites, Meu Perfil, reações, avatar picker, PWA/service
  worker** — todo o `src/App.jsx` visual, exceto os pedaços listados na seção 4.
- **Bônus de campeão + artilheiro** (mecânica de palpitar → confirmar → distribuir pontos) —
  o *conceito* se aplica igual, só muda **quando** confirma (ver seção 4).
- **`src/App.jsx` → `ModalCampeaoBolao` / `BannerCampeaoBolao`** (o "campeão do bolão",
  celebração de quem ganhou o bolão inteiro) — feature nova, recém-construída, 100% genérica,
  não tem nada de Copa do Mundo nela. Usa como está.

---

## 4. O que precisa mudar

### 4.1 Times em vez de seleções
- `src/App.jsx` linha ~2593: `const SELECOES = [...]` → vira lista dos 20 clubes da Série A
  2026.
- `src/App.jsx` linha ~2495: `const FLAG_CODES = {...}` (bandeira por seleção, usada pelo
  helper `fl()`) → **não existe equivalente pronto pra escudo de clube**. Duas opções:
  1. Trocar `fl()` por um emoji/cor por clube (reaproveita o MESMO padrão já usado pros
     avatares dos participantes — `Avatar`, `PALETA_CORES`, `EMOJIS_AVATAR`).
  2. Não ter "escudo" nenhum — só o nome do time, texto puro.
  A opção 1 é mais fiel ao espírito visual do app atual, mas dá trabalho manual (escolher
  emoji+cor pra 20 clubes). Decisão do Leonardo antes de começar a construir.

### 4.2 Fase e peso do jogo
- `api/futebol.js`:
  - `mapearFase(stage)` (linha ~118) hoje distingue `"GROUP_STAGE"` de mata-mata.
    Brasileirão via football-data.org vem com `stage: "REGULAR_SEASON"` sempre — **não tem
    fase pra distinguir**. Simplifica pra sempre retornar o mesmo valor (ex.: `"returno"`).
  - `pesoDaStage(stage)` (linha ~137, tabela `PESO_POR_STAGE`) hoje escalona 1×→5× por fase
    de mata-mata. Pra pontos corridos **não existe fase pra escalonar**. Opções:
    - **Mais simples:** peso sempre 1× (todo jogo vale igual — é literalmente o que o campo
      já faz por padrão, `DEFAULT 1` no schema).
      **Alternativa (se a galera quiser tempero):** pesar por **rodada** — ex. últimas 3-4
      rodadas do turno (briga por título/rebaixamento) valem mais. Isso é decisão de
      produto, não técnica — perguntar antes de implementar.
- `schema.sql`: **nenhuma migração de schema necessária** — `fase` é `VARCHAR(20)` livre
  (não é enum) e `peso` já tem `DEFAULT 1`. É tudo mudança de lógica em `futebol.js`, não de
  banco.

### 4.3 Bônus "campeão" — quando confirma
Hoje o admin confirma a seleção campeã depois da final (uma partida decide). No Brasileirão,
"campeão do turno/temporada" só é decidido **quando a tabela oficial fecha no fim da
temporada** — não tem uma partida única pra assistir e confirmar. A mecânica de
palpitar→travar→admin confirma continua igual (`api/campeao.js`), só o **gatilho** de
confirmação é "acabou a temporada" em vez de "acabou a final". Vale decidir: esse bolão é só
do **2º turno** (ranking próprio, reseta) ou acompanha a **classificação geral** da Série A
(que já vinha do 1º turno)? Isso muda o que "campeão" significa pro bolão. **Perguntar ao
Leonardo antes de implementar campeão/artilheiro.**

### 4.4 Artilheiro
Mecânica igual (`api/artilheiro.js`, `BonusAdmin`), só decidir o escopo: artilheiro do 2º
turno isolado, ou artilheiro da temporada inteira (2026)? Mesma decisão de produto do 4.3.

### 4.5 Copy e marca
Textos espalhados pelo `src/App.jsx` dizem "BOLÃO DOS GURIS", "COPA DO MUNDO · 2026",
"seleção campeã" etc. (`topo-titulo`, `ModalRegras`, labels de aba). Passar uma busca por
"Copa", "seleção", "Mundial" e trocar pro vocabulário de liga (time, campeonato, rodada).

---

## 5. API de dados — pesquisa feita, recomendação

Pesquisei alternativas antes de decidir. Comparativo:

| API | Cobre Brasileirão? | Free tier | Limite | Observação |
|---|---|---|---|---|
| **football-data.org** (já integrado) | ✅ Sim — código `BSA`, free "pra sempre" | Sim | **10 req/min** (sem teto diário) | Já é o provedor deste repo; placar ao vivo vem atrasado (limitação conhecida) |
| API-Football (api-football.com/RapidAPI) | Sim | Sim | **100 req/dia (teto fixo)** | Arriscado: domingo de Brasileirão tem 2-3 jogos simultâneos, um polling de 1×/min ao vivo estoura 100 chamadas em menos de 1h |
| api-futebol.com.br (BR) | Sim | Sim | **100 req/dia** | Mesmo risco de teto diário; paga via PIX se precisar mais |
| `ezefranca/campeonato-brasileiro-api` (GitHub) | Sim | Sim, sem chave | Sem limite documentado | Não é API oficial — faz scraping do Globo.com. Grátis mas frágil (pode quebrar se a Globo mudar o HTML) |
| TheSportsDB | Parcial | Sim (comunidade) | Variável | Cobertura fraca pra ligas fora do topo europeu — não recomendado pra placar ao vivo |

**Recomendação: manter football-data.org.** Já está integrado (`api/futebol.js`,
`FOOTBALL_DATA_KEY`), Brasileirão confirmado no free tier, e o limite por-minuto combina
melhor com o cron atual do que um teto diário fixo. Só muda o **código da competição** (de
Copa do Mundo pra `BSA`) e o **mapeamento de stage** (seção 4.2).

⚠️ **Atenção a um detalhe de infra:** se este app da Copa e o novo app do Brasileirão rodarem
**ao mesmo tempo** usando a **mesma chave** da football-data.org, os dois crons competem pelo
mesmo limite de 10 req/min (o limite é por chave/conta, não por projeto). Como a Copa deve
estar terminando por essa época, o overlap deve ser curto — mas se for rodar os dois em
paralelo por mais que alguns dias, **registrar uma conta/chave nova e gratuita** pro projeto
do Brasileirão evita qualquer disputa.

---

## 6. Infraestrutura — checklist prático

Isso **não é o mesmo deploy** do app da Copa. É um projeto novo, separado, do zero na infra
(mesmo reaproveitando o código):

- [ ] **Novo repositório** — fork/cópia deste repo (git novo, não branch do mesmo repo).
- [ ] **Novo projeto na Vercel** — conectado ao novo repositório. Novo domínio
  (`*.vercel.app` ou domínio próprio).
- [ ] **Novo banco Neon Postgres** — banco separado do da Copa (não misturar temporadas/
  torneios diferentes no mesmo banco — o schema não foi pensado pra multi-torneio). Rodar
  `schema.sql` nele (a planta já é fiel e testada em banco vazio).
- [ ] **Variáveis de ambiente no novo projeto Vercel:**
  - `DATABASE_URL` → connection string do **novo** Neon.
  - `FOOTBALL_DATA_KEY` → reaproveitar a mesma chave é possível, mas ver o alerta da seção 5
    (contenção de rate limit se os dois apps rodarem juntos). Mais seguro: chave nova.
  - `CRON_SECRET` → **gerar um segredo novo**, não reaproveitar o da Copa (são sistemas
    independentes; vazar um não deveria comprometer o outro).
- [ ] **`vercel.json` (crons nativos)** — o padrão atual (`cron-resultados` 2×/dia,
  `cron-jogos` 1×/dia às 01:00 SP) deve funcionar igual: o cron de "jogos do dia" já busca
  numa janela de datas (não por fase/rodada), então pega os jogos da rodada normalmente sem
  mudança de lógica.
- [ ] **Cron externo (cron-job.org) pro placar AO VIVO** — este é **manual, fora do
  código**: hoje existe um cron externo configurado batendo em `/api/cron-resultados` (ou
  `/api/futebol?acao=placar-vivo`) a cada ~1 min pra placar ao vivo (o cron nativo da Vercel
  no free tier não dá granularidade de minuto). **Precisa criar um NOVO job no cron-job.org**
  apontando pra URL do **novo** deploy, com o **novo** `CRON_SECRET` (via header
  `Authorization: Bearer` ou `?key=`, os dois já são aceitos pelo código).
- [ ] **Links novos pro grupo** — como é banco/deploy novo, todo mundo recebe um link (`?t=`)
  novo. Os links antigos da Copa continuam funcionando pro app antigo (são independentes).
- [ ] **PWA** — nome/ícone do manifest (`public/manifest.json` ou equivalente) e cache do
  service worker devem ser revisados se quiser uma identidade visual própria pro app do
  Brasileirão (não obrigatório, mas evita confundir com o app da Copa se alguém tiver os
  dois instalados como PWA no celular).

---

## 7. Decisões de produto em aberto (perguntar ao Leonardo antes de codar)

1. **Escopo do bolão:** só o 2º turno (ranking zera, roda isolado) ou acompanha a
   classificação geral da Série A 2026 (turno 1 + turno 2)?
2. **Peso por jogo:** tudo 1× (simples) ou pesar rodadas finais/clássicos?
3. **"Campeão" e "artilheiro":** do 2º turno isolado ou da temporada inteira? (depende da
   resposta #1)
4. **Identidade visual dos 20 clubes:** emoji+cor por clube (como os avatares hoje) ou só
   nome em texto?
5. **Nome/marca do novo bolão** — mantém "Bolão dos Guris" (mesmo grupo, campeonato
   diferente) ou é um grupo/nome novo?
6. **football-data.org:** reaproveitar a chave existente ou criar uma nova (ver alerta da
   seção 5)?

---

## 8. Primeiros passos sugeridos

1. Ler este documento inteiro + dar uma passada em `code-review-status.md` e
   `melhorias-seguranca.md` (histórico e decisões já tomadas neste repo — muita coisa aqui
   evitou bug ou rework, vale entender o "porquê" antes de mexer).
2. Perguntar ao Leonardo as 6 decisões da seção 7 — **não assumir nenhuma**.
3. Só depois: adaptar `SELECOES`/`FLAG_CODES` (4.1), `mapearFase`/`pesoDaStage` em
   `api/futebol.js` (4.2), trocar código da competição pra `BSA` nas chamadas à
   football-data.org, revisar copy (4.5).
4. Provisionar a infra da seção 6 (Vercel + Neon + envs + cron externo) — em paralelo ou
   depois do código, como preferir.
5. Testar com `npm run build` + `npm test` (mesma disciplina deste repo: build limpo e
   `ranking.test.mjs` verde antes de considerar pronto).
