# GALVESTART

Loja mobile-first de sites prontos + rastreamento próprio + painel administrativo **separado do site público**.

## Arquitetura

- `public/` — loja GALVESTART
- `server.js` — site público + API + tracking
- `admin/` — painel de controle independente
- `admin-server.js` — servidor separado do painel
- `data/db.json` — persistência inicial

O painel **não possui link no site público**. Em produção:

- `https://galvestart.com` → porta 3000
- `https://painel.galvestart.com` → porta 3001

## Rodar localmente

```bash
cp .env.example .env
npm install
npm run dev
```

Loja: `http://localhost:3000`  
Painel: `http://localhost:3001`

A senha vem de `ADMIN_PASSWORD` no `.env`.

## O que já funciona

- catálogo com categorias, imagens, favoritos e preview;
- planos Start, Pro, Premium e Sob Medida;
- CTA direto para `wa.me` com código de lead;
- tracking de PageView, modelos, planos, favoritos e WhatsApp;
- UTMs, referrer, fbclid, gclid e links rastreáveis;
- painel separado com analytics;
- edição de preços, hospedagem, WhatsApp, headline e subheadline;
- cadastro/edição/exclusão de modelos;
- Meta Pixel e GA4 configuráveis pelo painel.

## Produção

Troque `ADMIN_PASSWORD` e `ADMIN_SECRET`, use HTTPS, configure `APP_URL` e `ADMIN_ORIGIN` e faça backup de `data/db.json` ou migre para Postgres/Supabase conforme o volume crescer.
