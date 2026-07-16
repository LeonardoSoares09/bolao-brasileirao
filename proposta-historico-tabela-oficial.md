# 🟢 Proposta: importar histórico (rodadas 1-18) + tabela oficial com G4/Z4

> **Para o próximo Claude Code:** briefing de uma feature específica, discutida e ainda não
> implementada. Leia inteiro antes de codar. Contexto do resto do projeto: leia primeiro
> `proposta-brasileirao-segundo-turno.md` (a reformulação Copa → Brasileirão já está feita e
> em produção — este documento é só a próxima feature em cima dela).

## O que o Leonardo pediu

Trazer pro banco **todos os jogos que já aconteceram na Série A 2026 até a rodada 19**
(ou seja, o 1º turno inteiro, rodadas 1-18) — resultados finais, sem possibilidade de
ninguém palpitar neles (já aconteceram). Objetivo: **estatísticas reais dos times** e uma
**tabela oficial da Série A** pra ajudar em análises, destacando **G4** (zona de
Libertadores, topo) e **Z4** (zona de rebaixamento, base).

## Por que isso é mais simples do que parece — o que já funciona sozinho

- **Trava automática**: a "regra de ouro" já trava palpite no kickoff. Jogos de rodadas
  passadas (já aconteceram) ficam travados sozinhos, sem precisar de nenhum campo/flag novo
  tipo "histórico = true".
- **Ranking do bolão não é afetado**: ninguém palpitou nesses jogos (o bolão só existe desde
  a rodada 19), então eles contam **0 pontos pra todo mundo** — `pontosDoPalpite` retorna
  `null` sem palpite. O ranking continua corretamente "zerado desde a rodada 19" (decisão já
  tomada, ver seção 7 da proposta original).
- **A tabela já existe**: `tabelaCampeonato(jogos)` em `src/App.jsx` (dentro de
  `ModalEstatisticas`) já calcula uma tabela completa (V/E/D/GP/GC/PTS/SG) a partir de
  `estado.jogos` — hoje só reflete rodada 19+ porque só isso está cadastrado. Trazendo as
  rodadas 1-18, ela vira automaticamente a tabela real da Série A, **sem mudar essa função**.
- **Agrupamento por rodada já existe**: a aba Palpites (feature recém-implementada) já
  agrupa jogos por rodada com uma seção colapsável "↩ Rodadas anteriores" — rodadas 1-18
  cairiam ali naturalmente.

## O que falta de verdade

1. **Importar o histórico** — não existe hoje um jeito de buscar rodadas passadas. O cron
   diário (`api/futebol.js:acaoJogosHoje`) foi *intencionalmente* redesenhado recentemente pra
   buscar só a rodada **atual** (`currentSeason.currentMatchday`), não mais uma janela de
   data. Pra importar 18 rodadas de uma vez, respeitando o rate limit de 10 req/min da
   football-data.org, precisa de uma ação nova — ex.: um endpoint/botão de admin
   "Importar histórico" que faz um loop `?matchday=1` até `?matchday=18`, uma chamada por vez
   com um `await sleep` entre elas (18 chamadas ≈ 2 min pra não estourar o limite), gravando
   direto na tabela `jogos` (mesma lógica de tradução de nome via `traduzirClube`, mesma
   coluna `rodada`/`peso` — `peso` é irrelevante pra esses jogos já que não geram pontos, mas
   preencher com o valor calculado normal não quebra nada).
2. **G4/Z4 na tabela** — `tabelaCampeonato` já ordena por pts/saldo/gols. Só falta destacar
   visualmente as 4 primeiras linhas (G4, borda/fundo verde) e as 4 últimas (Z4, vermelho) no
   JSX que renderiza a tabela (`ModalEstatisticas`, seção "TABELA DO CAMPEONATO").

## Decisão de produto em aberto (perguntar antes de codar)

**A tabela deve mostrar a posição REAL da Série A** (pontos do 1º turno + 2º turno somados,
= exatamente a tabela oficial do campeonato), **ou é só pra estatística/forma recente dos
times**, sem pretensão de ser "a tabela oficial"? Isso não muda o código de
`tabelaCampeonato` (ela já soma tudo que estiver em `estado.jogos`), mas muda a expectativa:
se é "tabela oficial", os números têm que bater 100% com a CBF/imprensa — vale conferir se o
import capturou tudo certo (V.O.: WO, jogos adiados, etc. — casos raros mas existem).

## Arquivos relevantes

- `api/futebol.js` — `acaoJogosHoje()`, `buscarPartidas()`, `traduzirClube` (de
  `lib/clubes.js`). É aqui que entra a nova ação de import.
- `lib/clubes.js` — `pesoDoJogo(rodada, casa, fora)`, `TRADUCAO_CLUBES`.
- `src/App.jsx` — `tabelaCampeonato(jogos)` e o JSX "TABELA DO CAMPEONATO" dentro de
  `ModalEstatisticas` (é onde entra o destaque G4/Z4).
- `schema.sql` — tabela `jogos`, coluna `rodada` (já existe, adicionada nesta mesma leva de
  mudanças).
- `api/jogo.js` — endpoint de cadastro manual, caso o import automático falhe pra algum jogo
  específico (fallback já existente, mesma lógica de sempre).

## Primeiros passos sugeridos

1. Perguntar a decisão de produto em aberto acima.
2. Implementar a ação de import (nova, endpoint/botão de admin) — 18 chamadas
   `?matchday=N` de N=1 a 18, respeitando rate limit.
3. Adicionar destaque G4/Z4 no JSX da tabela.
4. Testar contra produção (o banco já tem dados reais da rodada 19 em diante — cuidado pra
   não duplicar jogos já cadastrados; a lógica de `porExt`/adoção de legado em
   `acaoJogosHoje` já cobre isso, reaproveitar o mesmo padrão de dedupe por `external_id`).
