# Migrations

## A fonte da verdade do schema é o `../schema.sql`

O `schema.sql` na raiz é a **planta completa e atual** do banco. Rode ele num
Postgres vazio e você tem toda a estrutura que o app precisa. Sempre que mudar
o banco, **atualize o `schema.sql`**.

## Como aplicar uma mudança nova

1. Crie um arquivo aqui: `VNN__descricao_curta.sql` (próximo número livre — o
   último usado foi o V5, então o próximo é `V06__...`). Coloque só o **delta**
   (o `ALTER TABLE` / `CREATE TABLE` da mudança).
2. Rode esse delta no banco de produção (SQL Editor do Neon).
3. **Atualize o `../schema.sql`** pra refletir o novo estado.
4. Commite os dois juntos com a feature que precisa da mudança.

Assim quem precisa **recriar do zero** roda o `schema.sql`; quem precisa
**atualizar um banco existente** roda o delta novo.

## `_legado/`

As migrations `V2` e `V5` foram aplicadas no início do projeto, mas o conteúdo
delas já está incorporado no `schema.sql` baseline. Ficam arquivadas em
`_legado/` só como histórico — não precisam ser rodadas em um banco novo.

> Nota: não há um runner automático (Flyway/node-pg-migrate). As migrations são
> aplicadas manualmente no SQL Editor do Neon. Os números servem de ordem e
> documentação.
