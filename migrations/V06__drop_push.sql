-- V06 — remove a infraestrutura de push notification (nunca foi implementada).
-- A tabela push_subscriptions existia mas o app nunca teve endpoint de inscrição
-- nem handler de push. Feature descartada (ver code-review-status.md, P1).
-- Rodar no SQL Editor do Neon. Não-destrutivo pro resto (tabela estava sem uso).

DROP INDEX IF EXISTS idx_push_participante;
DROP TABLE IF EXISTS push_subscriptions;
