# Design: importar histórico (rodadas 1-18) + tabela oficial com G4/Z4

> Origem: `proposta-historico-tabela-oficial.md` (briefing do Leonardo). Este documento é a
> spec aprovada, pronta pra virar plano de execução.

## Decisão de produto

A tabela do campeonato é a **tabela oficial da Série A** — precisa bater 100% com
CBF/imprensa, não é só estatística aproximada de forma. Isso não muda o código de
`tabelaCampeonato` (já soma tudo que estiver em `estado.jogos`), mas define a régua de
aceite: depois do import, os números (PTS/V/E/D/GP/GC/SG) das rodadas 1-18 têm que
conferir com a tabela real do 1º turno 2026.

## 1. Backend — nova ação `historico` em `api/futebol.js`

Extrair a lógica de upsert de `acaoJogosHoje` (busca de partidas, tradução de clube via
`traduzirClube`, dedupe por `external_id`, adoção de legado por casa/fora/data) para uma
função compartilhada:

```
async function importarRodada(matchday, { comPlacar }) { ... }
```

- `acaoJogosHoje()` passa a chamar `importarRodada(rodadaAtual, { comPlacar: false })` —
  comportamento **idêntico** ao atual (só refatorado, sem mudança de efeito observável).
- Nova `acaoHistorico(matchday)` chama `importarRodada(matchday, { comPlacar: true })`.
  Como são jogos já `FINISHED`, `comPlacar: true` também grava `gh`/`ga` (via
  `placarBolao(m.score)`, a mesma função usada em `acaoPlacares`) tanto no INSERT quanto
  no UPDATE. Isso é necessário porque `acaoPlacares` só varre uma janela de 14 dias e
  nunca alcançaria rodadas antigas.

Nova rota: `GET /api/futebol?t=TOKEN&acao=historico&matchday=N`, admin-only (mesma auth
de `jogos-hoje`/`resultados`). Valida `1 <= matchday <= 18` — fora disso, 400. Não é uma
ação genérica de "importar qualquer rodada": é especificamente o backfill do 1º turno.

`rodada`/`peso` gravados normalmente via `pesoDoJogo` (peso é irrelevante pra pontuação
já que ninguém palpitou, mas não há motivo pra deixar a coluna diferente do padrão).

## 2. Frontend — botão "Importar histórico" (aba Jogos, painel admin)

**Visibilidade condicional**: o botão só renderiza se não existir nenhum jogo com
`rodada === 18` em `estado.jogos` (checagem no array já carregado no client, sem novo
endpoint). Assim que a rodada 18 estiver completa, ele some sozinho nas próximas cargas —
é uma ação de backfill único, não recorrente como "Jogos de hoje"/"Buscar resultados".

**Loop client-side** (evita risco de timeout de function longa no servidor):

- Estado local `importando: { rodada, total: 18 } | null`.
- `for (n = 1; n <= 18; n++)`: chama `/api/futebol?...&acao=historico&matchday=${n}`,
  aguarda resposta, atualiza `importando.rodada = n`, espera ~6.5s antes da próxima
  (respeita os 10 req/min da football-data.org com folga — 18 chamadas ≈ 2 min).
- UI: botão vira texto de progresso `"Importando rodada 7 de 18…"` com spinner (reusa
  `.spinner` já existente no CSS).
- Acumula `adicionados`/`atualizados` de cada resposta; ao final, um único aviso, ex.:
  `"18 rodadas importadas — 187 jogos adicionados ⚽"`.
- Erro em qualquer chamada (rede, 502 etc.): para o loop, aviso indica a rodada que
  falhou (`"Falhou na rodada 9 — clique de novo pra retomar"`) e o botão reaparece —
  idempotente graças ao dedupe por `external_id`, então re-clicar é seguro.
- Desabilita os outros botões de busca automática durante o import (mesmo padrão de
  `disabled={buscandoJogos || buscandoResultados}` já usado).

## 3. Destaque G4/Z4 na tabela (`ModalEstatisticas`)

Sem mudança em `tabelaCampeonato` (`src/App.jsx:1326`) — só no JSX que renderiza as
linhas (`src/App.jsx:1442-1452`). A Série A sempre tem 20 times, então G4 (`i < 4`) e Z4
(`i >= tabela.length - 4`) nunca se sobrepõem.

- Classe extra na `<tr>`: `stat-row-g4` (linhas 0-3) ou `stat-row-z4` (últimas 4),
  somada à já existente `stat-row-on`.
- CSS novo: borda esquerda verde + leve fundo verde pro G4; borda esquerda vermelha +
  leve fundo vermelho pro Z4, seguindo o padrão visual das variáveis de cor já usadas
  no app.
- **Sem legenda textual** — só o destaque visual (decisão do Leonardo: quem acompanha
  Brasileirão reconhece G4/Z4 pela posição na tabela).

## Arquivos afetados

- `api/futebol.js` — refactor de `acaoJogosHoje` + nova `acaoHistorico`/rota `historico`.
- `src/App.jsx` — botão + loop de import (componente `Jogos`), destaque G4/Z4
  (`ModalEstatisticas`).
- `src/App.css` (ou equivalente) — classes `.stat-row-g4`/`.stat-row-z4`.

## Testando

- Rodar o import contra produção uma vez, depois conferir manualmente a tabela contra a
  tabela oficial real do 1º turno 2026 (fonte: CBF/impressa) — checar especialmente
  W.O./jogos adiados, que a doc original já sinalizava como caso raro de divergência.
- Confirmar que rodar o import duas vezes não duplica jogos (dedupe por `external_id`).
- Confirmar que o botão some depois que a rodada 18 estiver completa.
