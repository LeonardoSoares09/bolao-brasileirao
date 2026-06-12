-- Bolão da Copa 2026 — schema do banco (Neon Postgres)
-- Cole este arquivo inteiro no SQL Editor do Neon e execute uma vez.

CREATE TABLE IF NOT EXISTS participantes (
  id           SERIAL PRIMARY KEY,
  nome         TEXT NOT NULL,
  token        TEXT UNIQUE NOT NULL,
  is_admin     BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_emoji TEXT,
  avatar_cor   TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jogos (
  id          SERIAL PRIMARY KEY,
  casa        TEXT NOT NULL,
  fora        TEXT NOT NULL,
  kickoff     TIMESTAMPTZ,
  gh          INT CHECK (gh >= 0),
  ga          INT CHECK (ga >= 0),
  external_id TEXT UNIQUE,   -- id da partida na football-data.org (carimbo p/ busca automática de placar)
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS palpites (
  jogo_id         INT NOT NULL REFERENCES jogos(id) ON DELETE CASCADE,
  participante_id INT NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  h               INT NOT NULL CHECK (h >= 0),
  a               INT NOT NULL CHECK (a >= 0),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (jogo_id, participante_id)
);

CREATE INDEX IF NOT EXISTS idx_palpites_jogo ON palpites (jogo_id);

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
