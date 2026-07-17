/* Helper compartilhado pelas serverless functions:
   conexão com o Neon Postgres + autenticação por token. */

import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

/* Autentica um token. Retorna { id, nome, isAdmin } ou null.
   - ADMIN_TOKEN (env) é a chave-mestra de bootstrap: serve pra criar
     os participantes no começo, antes de existir qualquer um no banco.
   - Participantes com is_admin = true também têm poderes de admin. */
export async function autenticar(token) {
  if (!token || typeof token !== "string") return null;

  if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return { id: null, nome: "Organizador", isAdmin: true, master: true };
  }

  const rows = await sql`
    SELECT id, nome, is_admin FROM participantes WHERE token = ${token}
  `;
  if (rows.length === 0) return null;
  return { id: rows[0].id, nome: rows[0].nome, isAdmin: rows[0].is_admin, master: false };
}

export function intOuNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : Math.max(0, n);
}
