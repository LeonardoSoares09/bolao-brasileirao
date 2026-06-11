# ⚽ Bolão da Copa 2026

App de bolão para grupo de amigos. React + Vite no frontend, serverless function da Vercel pra busca automática de jogos e resultados via API da Anthropic (com web search).

## Estrutura

```
├── api/
│   └── consultar.js    # Serverless function — proxy seguro pra API da Anthropic
├── src/
│   ├── App.jsx         # O app inteiro (componente + estilos)
│   └── main.jsx
├── index.html
└── vite.config.js
```

## Deploy na Vercel (com deploy automático)

1. **Suba pro GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Bolão da Copa 2026"
   git branch -M main
   git remote add origin git@github.com:SEU_USUARIO/bolao-copa-2026.git
   git push -u origin main
   ```

2. **Importe na Vercel:** [vercel.com/new](https://vercel.com/new) → faça login com GitHub → selecione o repositório. A Vercel detecta Vite automaticamente — não precisa mudar nada nas configurações de build.

3. **Configure a API key:** na tela de import (ou depois em Settings → Environment Variables), adicione:
   - Nome: `ANTHROPIC_API_KEY`
   - Valor: sua chave de https://platform.claude.com (Console → API Keys)

4. **Deploy.** Pronto — a partir daqui, todo `git push` na `main` gera deploy automático.

## Rodando localmente

O `npm run dev` do Vite **não** serve a pasta `api/` (as functions são da Vercel). Pra testar tudo localmente, use o CLI da Vercel:

```bash
npm install
npm i -g vercel
vercel dev          # serve o front + as functions em http://localhost:3000
```

E crie um arquivo `.env` na raiz (já está no .gitignore):
```
ANTHROPIC_API_KEY=sua_chave_aqui
```

Se quiser só ver o front (sem os botões de busca funcionando): `npm run dev`.

## Avisos importantes

- **Dados ficam no `localStorage`** — ou seja, no navegador de quem abriu. Funciona perfeitamente no modelo "um admin lança tudo", mas se duas pessoas abrirem o link, cada uma vê os próprios dados. Pra dados compartilhados entre os 9, o próximo passo é um banco (Vercel KV / Neon Postgres).
- **A busca automática custa créditos da API** (centavos por clique, web search é cobrado por uso). O `max_uses: 3` na function limita o número de buscas por chamada.
- A function valida método, tamanho do prompt e nunca expõe a key no front.

## Pontuação

| Acerto | Pontos |
|---|---|
| Placar exato | 3 |
| Vencedor/empate certo | 1 |
| Errou | 0 |

Desempate: número de placares exatos.
