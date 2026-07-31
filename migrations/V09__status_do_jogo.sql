-- V09 — guarda o status da partida reportado pela football-data.
--
-- PROBLEMA QUE RESOLVE: jogo adiado pela CBF voltava toda vez. O import
-- (importarRodada) ignorava m.status e recriava a partida a cada rodada do
-- cron, então o organizador apagava o jogo e ele reaparecia horas depois —
-- e cada exclusão levava junto os palpites já feitos, porque
-- palpites.jogo_id tem ON DELETE CASCADE.
--
-- Com o status persistido, jogo adiado deixa de ser apagado: a linha
-- sobrevive com kickoff = NULL e status = 'POSTPONED', fica fora da tela de
-- palpites, e volta sozinha (com os palpites antigos intactos) quando a
-- football-data remarcar e mandar a data nova.
--
-- Valores possíveis: SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, SUSPENDED,
-- POSTPONED, CANCELLED, AWARDED. NULL = linha anterior a esta migration ou
-- jogo cadastrado à mão pelo admin; ambos contam como jogo normal.
--
-- Rodar no SQL Editor do Neon. Não-destrutivo (coluna nova, NULL por padrão).

ALTER TABLE jogos ADD COLUMN IF NOT EXISTS status TEXT;
