/* Helper compartilhado pelas serverless functions:
   conexão com o Neon Postgres + autenticação por token. */

import { neon } from "@neondatabase/serverless";
import { PRAZO_PAGAMENTO_FIXO } from "./clubes.js";

export const sql = neon(process.env.DATABASE_URL);

async function buscarPorToken(token) {
  if (!token || typeof token !== "string") return null;
  const rows = await sql`
    SELECT id, nome, is_admin, pagou FROM participantes WHERE token = ${token}
  `;
  return rows[0] || null;
}

/* Bloqueio por falta de pagamento: token para de autenticar depois do prazo
   fixo (PRAZO_PAGAMENTO_FIXO, lib/clubes.js) se a pessoa não pagou — admin
   nunca é bloqueado. Recuperação: o organizador marca "pago" no painel Galera
   (reativa o token na hora) ou gera um link novo ("🔄 Novo link") pra dar uma
   segunda chance — os palpites já dados continuam intactos, pois ficam presos
   ao participante_id, não ao token. */
function bloqueadoPorPagamento(p) {
  return !!p && !p.is_admin && !p.pagou && Date.now() >= new Date(PRAZO_PAGAMENTO_FIXO).getTime();
}

/* Autentica um token. Retorna { id, nome, isAdmin } ou null.
   - ADMIN_TOKEN (env) é a chave-mestra de bootstrap: serve pra criar
     os participantes no começo, antes de existir qualquer um no banco.
   - Participantes com is_admin = true também têm poderes de admin. */
export async function autenticar(token) {
  if (!token || typeof token !== "string") return null;

  if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    return { id: null, nome: "Organizador", isAdmin: true, master: true };
  }

  const p = await buscarPorToken(token);
  if (!p || bloqueadoPorPagamento(p)) return null;
  return { id: p.id, nome: p.nome, isAdmin: p.is_admin, master: false };
}

/* Usado só por api/estado.js (a tela inicial) pra distinguir "link
   realmente inválido" de "bloqueado por falta de pagamento" e mostrar uma
   mensagem que explica o motivo — sem duplicar essa checagem em cada
   endpoint que já usa autenticar(). */
export async function motivoBloqueioPagamento(token) {
  if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) return false;
  const p = await buscarPorToken(token);
  return bloqueadoPorPagamento(p);
}

export function intOuNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : Math.max(0, n);
}
