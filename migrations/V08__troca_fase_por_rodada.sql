-- V08: troca `fase` (grupos/mata-mata, específico de Copa do Mundo) por
-- `rodada` (número da rodada da Série A) — o Brasileirão não tem fase de
-- mata-mata, então `fase` deixou de fazer sentido como conceito.
-- Roda numa base NOVA (banco recém-criado a partir do schema.sql) — este
-- delta é só documentação/histórico do que mudou em relação ao schema
-- herdado do bolao-copa, não precisa ser aplicado manualmente se o banco
-- já nasceu do schema.sql atualizado.
ALTER TABLE jogos ADD COLUMN IF NOT EXISTS rodada INT;
ALTER TABLE jogos DROP COLUMN IF EXISTS fase;
