CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             SERIAL PRIMARY KEY,
  participante_id INT NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  subscription   JSONB NOT NULL,
  endpoint       TEXT UNIQUE NOT NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_participante ON push_subscriptions(participante_id);
