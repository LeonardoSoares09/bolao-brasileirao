-- V2: external_id em jogos (não-destrutivo)
-- Cole no SQL Editor do Neon e execute uma vez.
--
-- Adiciona o id externo da football-data.org. Os jogos legados (criados
-- antes desta migration) ficam com external_id = NULL e são "adotados"
-- na primeira execução de /api/futebol?acao=jogos-hoje quando o casamento
-- por nome + data baterem.

ALTER TABLE jogos ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;
