# ⚽ Bolão da Copa 2026 — versão compartilhada

Bolão para grupo de amigos: cada um acessa pelo **seu link** (com token), lança o próprio palpite, e todos veem o mesmo ranking. React + Vite, serverless functions da Vercel, Neon Postgres.

## Como funciona

- **Sem login/senha**: cada participante recebe uma URL única (`https://seu-app.vercel.app/?t=abc123`). O token identifica quem é.
- **Palpites travam no kickoff, validado no servidor** — depois que a bola rola, a API rejeita.
- **Palpites dos outros ficam ocultos até o jogo começar** (regra anti-cópia, aplicada no servidor).
- **Organizador (admin)**: cadastra jogos, lança resultados, usa a busca automática (football-data.org), gera os links da galera e pode corrigir palpites.

## Setup (uma vez só)

### 1. Banco — Neon Postgres
1. Crie um projeto grátis em [neon.tech](https://neon.tech) (dá pra integrar direto pela aba *Storage* do projeto na Vercel, que já configura a `DATABASE_URL` sozinha).
2. Abra o **SQL Editor** do Neon, cole o conteúdo de `schema.sql` e execute.
3. Rode também `migrations/V2__external_id.sql` (adiciona a coluna `external_id` em `jogos`, usada pela busca automática). Pode rodar a qualquer momento — é não-destrutivo e idempotente.

### 2. Variáveis de ambiente na Vercel
Em *Settings → Environment Variables*:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | string de conexão do Neon (automática se usou a integração) |
| `FOOTBALL_DATA_KEY` | sua chave grátis de https://www.football-data.org/client/register (free tier cobre a Copa do Mundo) |
| `ADMIN_TOKEN` | invente uma senha longa (ex: saída de `openssl rand -hex 16`) |
| `CRON_SECRET` | outra senha longa — protege o endpoint `/api/cron-resultados` que a Vercel chama de 5 em 5 minutos pra atualizar placares sozinho |

Depois de adicionar as variáveis, faça **Redeploy**.

### 3. Bootstrap do bolão
1. Acesse `https://seu-app.vercel.app/?t=SEU_ADMIN_TOKEN`
2. Aba **Galera** → cadastre você mesmo marcando **"também é organizador"**, e depois os outros 8.
3. Clique **📋 Copiar link** em cada um e mande no WhatsApp.
4. Daqui em diante use o **seu link pessoal** (o ADMIN_TOKEN é só a chave-mestra de bootstrap/emergência).

## Rotas da API

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/estado?t=` | todos | estado completo (palpites alheios ocultos pré-kickoff) |
| `POST /api/palpite` | todos | upsert do próprio palpite (admin: de qualquer um) |
| `POST/PUT/DELETE /api/jogo` | admin | criar / lançar resultado / remover |
| `GET/POST/DELETE /api/participante` | admin | listar links / criar / remover |
| `GET /api/futebol?acao=jogos-hoje\|resultados` | admin | busca jogos/resultados na football-data.org |
| `GET /api/cron-resultados` | Vercel Cron | atualiza placares sozinho de 5 em 5 min (auth via `CRON_SECRET`) |

## Rodando localmente

```bash
npm install
npm i -g vercel
vercel env pull .env.local   # puxa as envs do projeto
vercel dev                   # front + functions em http://localhost:3000
```

## Pontuação

Placar exato = 3 pts · vencedor/empate certo = 1 pt · desempate por nº de exatos.
