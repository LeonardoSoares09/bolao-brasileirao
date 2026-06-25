# Melhorias & Segurança — Bolão da Copa

Checklist vivo das melhorias de segurança/robustez levantadas na auditoria de
código. Serve de handoff: se abrir outro Claude (ou voltar depois), comece por
aqui pra saber o que já foi feito e o que falta.

> **Contexto do app:** SPA React/Vite + serverless functions na Vercel (`api/*.js`),
> banco Neon Postgres (`lib/db.js`). Auth por token na URL (`?t=...`). Deploy é
> direto na branch `main` (a Vercel builda pelo git). Vercel CLI **não** está
> instalada nesta máquina.

> **Veredito geral da auditoria:** segurança sólida. Todo SQL usa template tags
> parametrizadas do Neon (sem injeção), toda rota valida token, ações de admin
> checam `eu.isAdmin` no servidor, a "regra de ouro" (palpite trava no kickoff) é
> validada no backend. Sem `dangerouslySetInnerHTML`/`eval` (sem XSS). Os itens
> abaixo são endurecimento/robustez, não buracos críticos.

---

## ✅ Feito

### [x] Crash de cache inválido (tela verde no Chrome)
**Commit:** `9eae2a3`
**Sintoma:** link de usuário abria só com fundo verde (`#071a0e` do `<body>`) no
Chrome; funcionava no Safari. Console: `TypeError: Cannot read properties of
undefined (reading 'some')`.
**Causa:** `App.jsx` usava o `estado` salvo no `localStorage` como render inicial
**sem validar o formato**. Cache de um deploy antigo (faltando o campo `jogos`)
fazia `estado.jogos.some(...)` (linha do `temJogoVivo`) estourar de forma síncrona,
desmontando o app antes do fetch novo chegar. Safari não tinha esse cache → ok.
**Correção:**
- `src/App.jsx` → `lerEstadoCache(token)`: valida o formato (`eu`, `jogos`,
  `participantes`, `palpites`, `contagens`) antes de usar; descarta cache antigo.
- `src/main.jsx` → `ErrorBoundary` auto-curativo: em qualquer crash de render,
  limpa as chaves `bolao-*` do localStorage e recarrega **1x** (trava anti-loop
  via `sessionStorage`, liberada após 4s de app rodando ok). Se persistir, mostra
  mensagem amigável em vez da tela verde.

### [x] Item 1 — Headers de segurança (`vercel.json`)
**Status:** aplicado (aguardando deploy).
**O que foi adicionado** em `vercel.json` (bloco `headers`, source `/(.*)`):
| Header | Valor | Por quê |
|---|---|---|
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Impede vazar o token (`?t=`) via `Referer` para recursos externos (flagcdn.com, Google Fonts). É o padrão dos navegadores modernos — comportamento idêntico ao atual, mas explícito (protege webviews/navegadores antigos com padrão pior). |
| `X-Content-Type-Options` | `nosniff` | Bloqueia MIME-sniffing. |
| `X-Frame-Options` | `SAMEORIGIN` | Anti-clickjacking (impede embutir o site em iframe de terceiros). |
**Garantia de não-quebra:** backend não lê `Referer`; assets têm MIME correto; o
app nunca é embutido em iframe; nenhum header toca `Cache-Control`/rotas/crons.
Build + testes passam. Webviews de WhatsApp/Instagram são navegadores completos
(não iframes) → não afetados.

---

### [x] Item 3 — Rotação de token (regenerar link sem apagar palpites)
**Status:** aplicado (aguardando deploy).
**Por quê:** era o ponto mais sensível do modelo de auth — se um link vazasse,
não havia como invalidar sem deletar o participante (e o `DELETE` cascateia os
palpites). Agora dá pra gerar um link novo preservando os palpites.
**O que foi feito:**
- `api/participante.js` → `PUT` ganhou a flag `{ regenerarToken: true }`: gera
  token novo (`randomBytes(12)`) via `UPDATE ... RETURNING`, sem tocar nos
  palpites. **Aditivo** — chamadas de "pagou" não mandam a flag, então o PUT
  antigo segue idêntico.
- `src/App.jsx` (componente `Galera`, admin) → botão "🔄 Novo link" em cada
  participante, com `window.confirm()` antes (link antigo morre na hora).
- **Guard anti-lockout:** o botão não aparece (e o handler bloqueia) para o
  próprio `estado.eu.id` — trocar o próprio token invalidaria a sessão atual do
  admin. Master token (`eu.id === null`) não é participante, então não afetado.

### [x] Regra — 5º critério de desempate: média de antecedência
**Status:** aplicado (aguardando deploy).
**Por quê:** o 5º critério era "quem fez o **primeiro palpite** mais cedo"
(`MIN(criado_em)`), o que **penalizava permanentemente quem entrou depois do 1º
jogo** — vantagem estrutural pros fundadores. Não era bug (código, regras no app
e regras escritas batiam), era uma regra injusta.
**Nova regra:** desempata por **antecedência média** — quão antes do kickoff a
pessoa costuma palpitar (`AVG(kickoff - criado_em)` em segundos, sobre os jogos
que ela palpitou e que têm horário). Maior = mais rápida = vence. Premia
consistência, ignora data de entrada. Quem tem dado vence quem não tem; empate
real (mesma média) → divisão do prêmio.
**Arquivos:**
- `api/estado.js` → query agora calcula `antecedencia_seg` via `AVG(EXTRACT(EPOCH
  FROM (j.kickoff - p.criado_em)))`; campo retornado renomeado de
  `primeiroPalpites` → `antecedenciaMedia` (`{participante_id, segundos}`).
- `src/ranking.js` → `compararRanking` usa `compararAntecedencia` (maior média
  primeiro); label do `criterioDesempate` virou "palpita com mais antecedência".
- `src/App.jsx` → consome `estado.antecedenciaMedia` (var `antecedenciaMap`);
  texto do `ModalRegras` (5º) atualizado.
- `src/ranking.test.mjs` → referência e mapa do teste atualizados; **passa**.
**⚠️ As regras publicadas FORA do app** (onde você colou a lista) também precisam
trocar o 5º item pra: *"Quem palpita com mais antecedência (média antes do
apito)"*.

### [x] Item 8 — `window.open` do WhatsApp com `noopener`
**Status:** aplicado. `src/App.jsx` ~linha 1051: `window.open(..., "_blank",
"noopener")`. Risco era irrelevante (destino confiável), mas é boa prática.

---

## ⏳ Pendente / decisão do dono

### [ ] Item 2 — Remover endpoint TEMP de diagnóstico
**Arquivo:** `api/futebol.js` (`acao === "debug-status"`, ~linha 212-225).
**Status:** **deixado de propósito** — o dono quer manter até medir o placar ao
vivo no próximo jogo. É admin-only (risco baixo), mas devolve o JSON cru da
football-data. **Remover depois de medir.** Quando for remover: apagar o bloco
`if (acao === "debug-status") {...}` inteiro.

---

## 🟢 Informativo (aceitável pro tamanho do bolão — registrar, não urgente)

### [ ] Item 3 — Token = "senha" na URL, sem rotação
Se um link vazar (print, histórico em PC compartilhado, link errado no grupo), a
conta fica acessível. Não há "trocar senha" de um participante — só deletar e
recriar, e o `DELETE` em `api/participante.js` **derruba os palpites em cascata**.
*Melhoria futura possível:* endpoint admin de "regenerar token" (UPDATE do token
sem apagar palpites).

### [ ] Item 4 — Segredo do cron na URL (`?key=`)
`api/cron-resultados.js` aceita `CRON_SECRET` via query (`?key=`/`?secret=`) — aparece
nos logs da Vercel. Também aceita `Authorization: Bearer <CRON_SECRET>` (mais
limpo).
**⚠️ NÃO mexido de propósito:** remover o suporte a `?key=` quebraria o cron
externo (cron-job.org) que hoje provavelmente está configurado com a URL
`?key=...`. Mexer aqui exige **primeiro** reconfigurar o agendador com header
`Authorization: Bearer <CRON_SECRET>`, **depois** remover a rama de query do
código. Como é fora do controle do código (config externa), ficou pendente.

### [ ] Item 5 — Sem rate limiting
`placar-vivo` já está protegido por lock de 55s no banco (não martela a
football-data). Outras rotas são admin ou de baixo impacto. OK nesta escala.

### [x] Item 6 — Robustez de render
Coberto pelo `ErrorBoundary` do item de cache. Outros campos do `estado`
(`reacoes`, `palpitesCampeao`...) são acessados de forma síncrona no render, mas a
API controla esses dados; o boundary é a rede de segurança.

---

## ⚪ Cosmético (não vale o risco de mexer)

- **Item 7 — INTENCIONAL, NÃO MEXER (decisão de produto):** no ranking, jogo
  **ao vivo** conta pro critério de desempate `exatos` (não só `pontos`), então a
  posição entre empatados oscila durante a partida e só estabiliza no apito
  final. `src/ranking.js` `calcularStats`.
  **Não é bug — é recurso.** O dono decidiu manter de propósito: a oscilação ao
  vivo dá uma sensação de poder/tensão na hora do jogo, e a "ilusão" quando a
  cravada não se confirma faz parte da graça do bolão. Além disso, mexer aqui
  tocaria na lógica que decide quem ganha. **Deixar exatamente como está.**

---

## Resumo de status

| Item | O quê | Status |
|---|---|---|
| Cache crash | tela verde no Chrome | ✅ feito (commit `9eae2a3`) |
| 1 | headers de segurança | ✅ feito |
| 3 | rotação de token | ✅ feito |
| 8 | `noopener` no WhatsApp | ✅ feito |
| 6 | robustez de render | ✅ coberto pelo ErrorBoundary |
| 2 | remover `debug-status` | ⏳ manter até medir o ao vivo |
| 4 | segredo do cron na URL | ⏳ exige reconfig externa primeiro |
| 5 | rate limiting | 🟢 ok nesta escala |
| 7 | `exatos` ao vivo no desempate | ✋ intencional (decisão de produto) — não mexer |

## Como verificar após o deploy

- **Headers (item 1):** DevTools → Network → clique na resposta do documento
  (`?t=...`) → aba Headers → confirmar `Referrer-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`.
- **Rotação de token (item 3):** como admin, aba Galera → "🔄 Novo link" em
  alguém → confirmar → o link antigo daquele participante deve dar
  "Link inválido" e o novo (copiado) deve abrir normal, com os palpites dele
  preservados.
