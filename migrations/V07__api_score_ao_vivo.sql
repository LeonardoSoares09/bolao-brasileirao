-- V07 — rastreia o último placar que a football-data reportou (placar ao vivo).
-- Corrige o bug do GOL ANULADO: a trava ">= nunca regride" regravava a correção
-- manual do admin quando a API atrasada seguia reportando o gol anulado. Agora o
-- cron só mexe no placar quando a PRÓPRIA API muda o que reporta (api_gh/api_ga);
-- a correção manual não toca api_*, então sobrevive ao atraso. Ver api/futebol.js.
-- Rodar no SQL Editor do Neon. Não-destrutivo (colunas novas, NULL por padrão —
-- o primeiro poll ao vivo semeia elas).

ALTER TABLE jogos ADD COLUMN IF NOT EXISTS api_gh INT;
ALTER TABLE jogos ADD COLUMN IF NOT EXISTS api_ga INT;
