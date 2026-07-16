-- Bolão do Brasileirão 2026/2 — schema do banco (Neon Postgres)
-- ============================================================================
-- Este arquivo é a PLANTA COMPLETA do banco: rode ele inteiro num Postgres
-- vazio (SQL Editor do Neon, ou `psql -f schema.sql`) e ele recria toda a
-- estrutura que o app precisa. É a fonte da verdade do schema — sempre que
-- mudar o banco em produção, atualize este arquivo também.
--
-- NÃO inclui dados (palpites, participantes, etc.) — para isso use o backup
-- gerado por `pg_dump`. NÃO inclui o schema `neon_auth` (infra gerenciada
-- pela Neon, não usada pelo app — a auth do app é por token em `participantes`).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- Participantes do bolão. A auth do app é o `token` (link mágico ?t=...).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS participantes (
  id           SERIAL PRIMARY KEY,
  nome         TEXT NOT NULL,
  token        TEXT UNIQUE NOT NULL,
  is_admin     BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_emoji TEXT,
  avatar_cor   TEXT,
  pagou        BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- ─────────────────────────────────────────────────────────────────────────
-- Palpites de placar. `criado_em` registra o PRIMEIRO envio (não muda no
-- update) — é o último critério de desempate do ranking ("palpitou antes").
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS palpites (
  jogo_id         INT NOT NULL REFERENCES jogos(id) ON DELETE CASCADE,
  participante_id INT NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  h               INT NOT NULL CHECK (h >= 0),
  a               INT NOT NULL CHECK (a >= 0),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (jogo_id, participante_id)
);

CREATE INDEX IF NOT EXISTS idx_palpites_jogo ON palpites (jogo_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Palpite de campeão (+6 pts) e artilheiro (+18 pts). Travam ao confirmar.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS palpite_campeao (
  participante_id INT PRIMARY KEY REFERENCES participantes(id) ON DELETE CASCADE,
  selecao         TEXT NOT NULL,
  confirmado      BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS palpite_artilheiro (
  participante_id INT PRIMARY KEY REFERENCES participantes(id) ON DELETE CASCADE,
  jogador         TEXT NOT NULL,
  confirmado      BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quem o admin marcou como acertador do artilheiro (controle manual).
CREATE TABLE IF NOT EXISTS artilheiro_premiado (
  participante_id INT PRIMARY KEY REFERENCES participantes(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────
-- Resultado oficial dos bônus (campeão e artilheiro reais), definido pelo admin.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resultado_especial (
  tipo          TEXT PRIMARY KEY CHECK (tipo IN ('campeao', 'artilheiro')),
  valor         TEXT NOT NULL,
  confirmado    BOOLEAN NOT NULL DEFAULT FALSE,
  confirmado_em TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────
-- Reações emoji nos jogos (uma por participante por jogo).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reacoes (
  jogo_id         INT NOT NULL REFERENCES jogos(id) ON DELETE CASCADE,
  participante_id INT NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  emoji           TEXT NOT NULL,
  PRIMARY KEY (jogo_id, participante_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Config interna chave-valor. Usada hoje só pelo dedup das chamadas à
-- football-data ('ultima_busca_live' — guarda o timestamp da última busca).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config (
  chave         TEXT PRIMARY KEY,
  valor         TEXT,
  atualizado_em TIMESTAMPTZ
);

