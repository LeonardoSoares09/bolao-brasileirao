# Status do Code Review — Bolão da Copa 2026

Rastreamento dos itens do relatório *"Code Review · Super Squad Sênior"* (`code-review-bolao.pdf`).
Marca o que já foi feito e o que falta. Atualizar conforme avançamos.

**Última atualização:** 2026-06-16

**Placar:** Críticos 3/3 ✅ · Importantes 2/6 · Polimento 0/8 (1 parcial)

---

## 🔴 Críticos — 3/3 concluídos ✅

- [x] **C1 — Banco reconstruível pelo repositório**
  `schema.sql` virou a planta completa e fiel do schema `public` (testado num PG vazio).
  Migrations organizadas em `migrations/_legado/` + convenção em `migrations/README.md`.
  → commit `dc7bfc1`

- [x] **C2 — Race condition no dedup da football-data** (`api/futebol.js` `acaoPlacares`)
  Check-then-act trocado por `INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING` atômico:
  só um vencedor por janela de 55s. Cobre cold-start e `atualizado_em` NULL.
  → commit `53c6fa3`

- [x] **C3 — Polling ao vivo eterno em jogos órfãos** (`src/App.jsx` `temJogoVivo`)
  Janela limitada a 4h após o kickoff (relatório sugeria 3h; usei 4h pra cobrir
  prorrogação + pênaltis sem cortar o polling no clímax).
  → commit `53c6fa3`

---

## 🟡 Importantes — 2/6

- [ ] **M1 — Lógica de pontuação duplicada em ~6 lugares**
  Não existe `calcularRanking` ainda; a soma de pontos e o critério de desempate estão
  repetidos (ranking, posAntes, gráfico, estatísticas, modal de palpites, perfil).
  *Solução:* extrair `calcularRanking(estado, { incluirAoVivo })` único + array único de
  critérios de desempate (usado pra ordenar e pra rotular). **Destrava M2 e M4.**

- [ ] **M2 — Setas de tendência usam ordenação diferente do ranking**
  Ranking desempata por "primeiro palpite"; o "antes" desempata por nome → seta ↑/↓ falsa
  entre empatados. *Depende de M1* (gerar o "antes" com o mesmo comparador).

- [x] **M3 — Ação manual do admin engolida pelo dedup**
  `buscarResultados` agora trata `r.cached`: mostra "busca automática roda no máx. 1x/min,
  aguarde" em vez do enganoso "nenhum resultado novo". Tratado sem early-return (o botão não
  trava). *Parte opcional não feita:* deixar a ação manual do admin furar o dedup (decidido
  manter o limite por enquanto, pra não reabrir a porta do rate limit).

- [ ] **M4 — Pontos ao vivo inconsistentes entre ranking e perfil/gráfico/modal**
  `pontosDoPalpite` (App.jsx:27) conta pontos mesmo com jogo `live`, mas `temResultado`
  (App.jsx:37) exige `!live`. Ranking e perfil podem divergir durante o jogo; confete pode
  disparar em placar exato que ainda vai mudar. *Solução:* definir uma política (sugestão:
  parcial com selinho visual) e aplicar em todo lugar via M1.
  > ⚠️ O commit recente "ranking atualiza pontos durante jogo ao vivo" mexeu nisso — pode
  > ter **ampliado** a divergência. Revisar junto com M1.

- [ ] **M5 — Elementos clicáveis não focáveis por teclado**
  Linha do ranking, banner do próximo jogo e cartão de jogo são `div` com `onClick` sem
  `role="button"`, `tabIndex={0}` nem handler de teclado. *Solução:* virar `<button>` ou
  adicionar role/tabIndex/onKeyDown (Enter/Espaço).

- [x] **M6 — Horário exibido no fuso do dispositivo, não de SP** (`src/App.jsx` `fmtQuando`)
  Adicionado `timeZone: "America/Sao_Paulo"` no `toLocaleString` do `fmtQuando`. Agora o amigo
  viajando fora do Brasil vê o horário de Brasília, igual ao resto do app.

---

## 🟢 Polimento — 0/8 (1 parcial)

- [ ] **P1 — Feature morta: push notifications**
  Tabela `push_subscriptions` existe, mas **não há** endpoint de inscrição nem handler de
  `push` no `sw.js` (confirmado: `public/sw.js` só tem install/activate). Implementar ou
  remover a tabela.

- [ ] **P2 — Código morto**
  `api/futebol.js` — `const { casa, fora } = rows[0]` atribuído e nunca usado dentro do
  `acaoPlacares`. `api/reacao.js` documenta um GET não usado. Comentários de seção órfãos
  em `App.jsx`.

- [ ] **P3 — Números mágicos espalhados** *(parcial)*
  Já existem `PTS_EXATO` / `PTS_RESULTADO`. Ainda hardcoded: bônus +9/+6, R$20, janela de
  14 dias, deadline de pagamento, `99`, etc. *Solução:* extrair pra constantes nomeadas no topo.

- [ ] **P4 — Whitelist de emojis duplicada client/server**
  `EMOJIS_REACAO` (App.jsx) e `EMOJIS_VALIDOS` (api/reacao.js) são idênticos mas mantidos
  na mão. Idem dois mapas de países. *Solução:* fonte única compartilhada.

- [ ] **P5 — CPF (chave PIX) hardcoded no bundle público**
  `const PIX = "04554360024"` em `App.jsx`. É PII servida publicamente. *Solução:* vir de
  env/config em vez de estar no código do front.

- [ ] **P6 — `App.jsx` gigante (~3.700 linhas + ~900 de CSS inline)**
  Quebrar em arquivos por componente e mover CSS pra `.css` importado. Esforço alto,
  valor a médio prazo. *(Atacar depois de M1, que já reduz parte da duplicação.)*

- [ ] **P7 — `ProximoCountdown` e `Countdown` quase idênticos**
  Unificar num único componente parametrizado.

- [ ] **P8 — Sorts com `kickoff` nulo geram `NaN`**
  `new Date(null)` gera ordem instável. Tratar `null` explicitamente nos sorts.

---

## 📋 Ordem sugerida pelo relatório (roadmap)

| # | Itens | Esforço/Impacto | Status |
|---|-------|-----------------|--------|
| 1 | C1 | Baixo esforço · Risco altíssimo | ✅ feito |
| 2 | C2 + C3 | Médio esforço | ✅ feito |
| 3 | M3 + M4 | Baixo esforço · confusão visível | 🟡 M3 feito · M4 falta (ver M1) |
| 4 | M1 + M2 | Médio esforço · destrava o resto | ⬜ próximo sugerido |
| 5 | M5 + M6 | Baixo esforço | 🟡 M6 feito · M5 falta |
| 6 | P1–P8 | Alto esforço · manutenibilidade | ⬜ |

> Observação: o relatório coloca M3+M4 antes de M1, mas M4 ("alinhar pontos ao vivo") fica
> bem mais limpo de resolver **depois** do M1 (a fonte única de cálculo). Vale considerar
> M1 → M4 → M2 → M3.

---

## ✅ Pontos fortes (do relatório — nada a fazer, só registro)

Regra de ouro no servidor · anti-cópia na query · auth por token de 96 bits · confirmação
irreversível de campeão/artilheiro · estados de loading/erro/vazio · sincronização de
relógio pelo servidor.
