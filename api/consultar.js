/* Serverless function da Vercel — proxy seguro pra API da Anthropic.
   A ANTHROPIC_API_KEY fica em variável de ambiente (nunca chega ao navegador).
   Protegida por token de admin: só o organizador gasta créditos. */

import { autenticar } from "../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const eu = await autenticar(req.body?.t);
  if (!eu || !eu.isAdmin) {
    res.status(403).json({ error: "Só o organizador usa a busca automática" });
    return;
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string" || prompt.length > 4000) {
    res.status(400).json({ error: "prompt inválido" });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada na Vercel" });
    return;
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text();
      console.error("Anthropic API:", r.status, detalhe);
      res.status(502).json({ error: "Falha na API da Anthropic" });
      return;
    }

    const data = await r.json();
    const texto = (data.content || [])
      .filter((i) => i.type === "text")
      .map((i) => i.text)
      .join("\n");

    res.status(200).json({ texto });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro interno" });
  }
}
