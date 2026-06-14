/* Envio desacoplado de Web Push.
   Falha por assinatura nunca afeta as demais nem o chamador.
   Subscriptions mortas (404/410) são removidas automaticamente. */

import webpush from "web-push";
import { sql } from "./db.js";

function configurar() {
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) throw new Error("VAPID env vars ausentes");
  webpush.setVapidDetails(subj, pub, priv);
}

/**
 * Envia notificação push.
 * @param {number[] | 'todos'} participanteIds
 * @param {string} titulo
 * @param {string} corpo
 * @param {string} [url]  URL aberta ao tocar na notificação
 * @param {string} [tag]  Tag para agrupar/substituir notificações do mesmo tipo
 */
export async function enviarPush(participanteIds, titulo, corpo, url = "/", tag = "bolao-geral") {
  try { configurar(); } catch { return; }

  const subs = participanteIds === "todos"
    ? await sql`SELECT id, subscription, endpoint FROM push_subscriptions`
    : await sql`
        SELECT id, subscription, endpoint
        FROM push_subscriptions
        WHERE participante_id = ANY(${participanteIds})
      `;

  if (subs.length === 0) return;

  const payload = JSON.stringify({ titulo, corpo, url, tag });

  await Promise.allSettled(
    subs.map(async (row) => {
      try {
        /* JSONB pode vir como objeto ou string dependendo do driver */
        const sub = typeof row.subscription === "string"
          ? JSON.parse(row.subscription)
          : row.subscription;

        await webpush.sendNotification(sub, payload);
      } catch (err) {
        const status = err?.statusCode ?? err?.status;
        if (status === 404 || status === 410) {
          await sql`DELETE FROM push_subscriptions WHERE id = ${row.id}`.catch(() => {});
        }
      }
    })
  );
}
