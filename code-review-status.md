# Status do Code Review — Bolão da Copa 2026

Rastreamento dos itens do relatório *"Code Review · Super Squad Sênior"* (`code-review-bolao.pdf`).
Marca o que já foi feito e o que falta. Atualizar conforme avançamos.

**Última atualização:** 2026-06-16

**Placar:** Críticos 3/3 ✅ · Importantes 6/6 ✅ · Polimento 3/8

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

## 🟡 Importantes — 6/6 ✅

- [x] **M1 — Lógica de pontuação duplicada em ~6 lugares**
  Extraído `src/ranking.js` (módulo puro, testável): `pontosDoPalpite`, `calcularStats`,
  `compararRanking`, `criterioDesempate` + constantes. O `App.jsx` importa de lá; ranking
  principal e `posAntes` passam por `calcularStats`/`compararRanking`. Rede de segurança:
  `src/ranking.test.mjs` prova que o ranking novo == antigo (rodar com `npm test`).

- [x] **M2 — Setas de tendência usam ordenação diferente do ranking**
  O `posAntes` agora usa o **mesmo** `compararRanking` do ranking principal (antes desempatava
  por nome e pulava campeã/artilheiro). Setas ↑/↓ entre empatados deixam de mentir.

- [x] **M3 — Ação manual do admin engolida pelo dedup**
  `buscarResultados` agora trata `r.cached`: mostra "busca automática roda no máx. 1x/min,
  aguarde" em vez do enganoso "nenhum resultado novo". Tratado sem early-return (o botão não
  trava). *Parte opcional não feita:* deixar a ação manual do admin furar o dedup (decidido
  manter o limite por enquanto, pra não reabrir a porta do rate limit).

- [x] **M4 — Pontos ao vivo inconsistentes entre ranking e perfil/gráfico/modal**
  Política escolhida (Opção A, decidida com o Leonardo): **conta o jogo ao vivo em todo
  lugar**, com selo visual **"⚡ parcial"**. Novo helper `temPlacar` (inclui ao vivo) em
  `ranking.js`. Perfil, gráfico e modal trocaram `temResultado` → `temPlacar`, então seus
  totais batem com o ranking durante o jogo. Selo aparece no ranking, perfil, gráfico e modal
  quando há jogo ao vivo contando. `temJogos` do ranking passou a considerar `temPlacar`
  (a dica "placar acende com o 1º resultado" some quando o ao vivo já está pontuando).
  - *Decidido manter:* **confete dispara no exato ao vivo** (preferência do Leonardo por
    "o mais ao vivo possível"); fácil mudar pra só-no-final depois (1 linha).
  - *Decidido NÃO mexer:* **EstatísticasInúteis** ficam sobre jogos encerrados — são métricas
    retrospectivas de zoeira (pé-frio, sniper%), não o total de pontos do jogador, então não
    criam a inconsistência que o M4 trata.

- [x] **M5 — Elementos clicáveis não focáveis por teclado**
  Linha do ranking e banner do próximo jogo (os dois `div` com `onClick`) ganharam
  `role="button"`, `tabIndex={0}` e `onKeyDown` (Enter/Espaço com `preventDefault`).
  Abordagem aditiva — não muda nada pra mouse/toque, só adiciona acesso por teclado.
  O "cartão de jogo" que o relatório citava já é `<button>` hoje (não precisou mexer).

- [x] **M6 — Horário exibido no fuso do dispositivo, não de SP** (`src/App.jsx` `fmtQuando`)
  Adicionado `timeZone: "America/Sao_Paulo"` no `toLocaleString` do `fmtQuando`. Agora o amigo
  viajando fora do Brasil vê o horário de Brasília, igual ao resto do app.

---

## 🟢 Polimento — 3/8

- [ ] **P1 — Feature morta: push notifications**
  Tabela `push_subscriptions` existe, mas **não há** endpoint de inscrição nem handler de
  `push` no `sw.js` (confirmado: `public/sw.js` só tem install/activate). Implementar ou
  remover a tabela.

- [x] **P2 — Código morto**
  Removido: `const { casa, fora } = rows[0]` morto em `api/futebol.js` (`acaoPlacares`) +
  `RETURNING` simplificado pra `id`; comentário obsoleto de GET em `api/reacao.js` (não há
  GET, só POST); comentário de seção órfão `/* NOTIFICAÇÕES */` no `App.jsx` (sobra do push).

- [x] **P3 — Números mágicos espalhados**
  Extraídas as constantes **duplicadas/visíveis**: `VALOR_ENTRADA` (R$20, em 3 lugares),
  `DEADLINE_PAGAMENTO` + `DEADLINE_PAGAMENTO_LABEL` (data em 3 lugares). Bônus +9/+6 já eram
  constantes (`BONUS_CAMPEAO`/`BONUS_ARTILHEIRO` no `ranking.js`). *Sobraram de fora* só
  literais **de uso único** (janela de 14 dias no `futebol.js`, etc.) — não são "espalhados",
  baixa prioridade.

- [ ] **P4 — Whitelist de emojis duplicada client/server**
  `EMOJIS_REACAO` (App.jsx) e `EMOJIS_VALIDOS` (api/reacao.js) são idênticos mas mantidos
  na mão. Idem dois mapas de países. *Solução:* fonte única compartilhada.

- [x] **P5 — CPF (chave PIX) hardcoded no bundle público**
  Resolvido na **raiz**: o Leonardo criou uma **chave PIX aleatória** (formato UUID, sem PII)
  e trocou o CPF por ela. Como uma chave aleatória é feita pra ser pública, pode seguir
  hardcoded sem problema — não precisou da solução via API autenticada (que o `VITE_` nem
  resolveria, pois o Vite embute env no bundle público). Rótulo "Chave PIX (CPF)" → "Chave
  PIX"; CSS do bloco ajustado (`word-break`, `min-width:0`, fonte 13px) pra a chave longa
  não estourar o layout.

- [ ] **P6 — `App.jsx` gigante (~3.700 linhas + ~900 de CSS inline)**
  Quebrar em arquivos por componente e mover CSS pra `.css` importado. Esforço alto,
  valor a médio prazo. *(Atacar depois de M1, que já reduz parte da duplicação.)*

- [ ] **P7 — `ProximoCountdown` e `Countdown` quase idênticos**
  Unificar num único componente parametrizado.

- [ ] **P8 — Sorts com `kickoff` nulo geram `NaN`**
  `new Date(null)` gera ordem instável. Tratar `null` explicitamente nos sorts.

---

## ✅ Bônus no total do modal — RESOLVIDO (antecipado, não esperou o fim da Copa)

Item derivado do M4. Era pra adiar, mas dava pra fazer e **testar a lógica** agora (o golden
test tem dados com bônus), então foi feito.

- **Modal:** o total (`X pts`), exatos e resultados vêm direto da **linha do ranking**
  (`participante.pontos/exatos/resultados`) — mesma fonte do ranking, **inclui o bônus**.
  Quando há bônus, o modal mostra **linhas visíveis** "🏆 Acertou a campeã +9" / "⚽ Acertou
  o artilheiro +6", então a conta (jogos + bônus = total) fecha na tela.
- **Perfil:** mantido sem bônus de propósito — o "aproveitamento %" é precisão de palpite, e
  somar bônus ali distorceria o %.
- **Durante a Copa nada muda** (bônus = 0); só passa a ficar certo no último dia.
- Golden test reforçado: prova `modal (= ranking) == perfil + bônus` e que o bônus é exercido.
- ⏳ *Único não-verificável agora:* o **visual** das linhas de bônus só dá pra ver com um
  campeão confirmado (fim da Copa). Lógica provada; é JSX reusando classes existentes.

---

## 📋 Ordem sugerida pelo relatório (roadmap)

| # | Itens | Esforço/Impacto | Status |
|---|-------|-----------------|--------|
| 1 | C1 | Baixo esforço · Risco altíssimo | ✅ feito |
| 2 | C2 + C3 | Médio esforço | ✅ feito |
| 3 | M3 + M4 | Baixo esforço · confusão visível | ✅ feito (M4 = Opção A) |
| 4 | M1 + M2 | Médio esforço · destrava o resto | ✅ feito (com golden test) |
| 5 | M5 + M6 | Baixo esforço | ✅ feito |
| 6 | P1–P8 | Alto esforço · manutenibilidade | ⬜ |

> Observação: o relatório coloca M3+M4 antes de M1, mas M4 ("alinhar pontos ao vivo") fica
> bem mais limpo de resolver **depois** do M1 (a fonte única de cálculo). Vale considerar
> M1 → M4 → M2 → M3.

---

## ✅ Pontos fortes (do relatório — nada a fazer, só registro)

Regra de ouro no servidor · anti-cópia na query · auth por token de 96 bits · confirmação
irreversível de campeão/artilheiro · estados de loading/erro/vazio · sincronização de
relógio pelo servidor.
