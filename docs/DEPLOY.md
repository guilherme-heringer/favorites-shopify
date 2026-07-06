# Deploy em produção (Coolify + loja real)

Este documento acompanha o arranque da app **Favoritos - Lemoon** fora do `shopify app dev`: PostgreSQL, URL público, Coolify e Partner.

## 1. Domínio e URLs na app

1. O repositório deve usar o host **`https://favorites-shopify.lemoon.dev`** em `shopify.app.toml`, `.env.example` e na variável **`SHOPIFY_APP_URL`** no Coolify. Se usares outro FQDN, faz find-and-replace desse host em todo o lado.
2. No Coolify (serviço da app), define **`SHOPIFY_APP_URL=https://favorites-shopify.lemoon.dev`** (sem barra no fim).

### Valores exactos nos ficheiros (copiar/colar se ainda tiveres `lemoon.com`)

No [`shopify.app.toml`](../shopify.app.toml):

```toml
application_url = "https://favorites-shopify.lemoon.dev"

[auth]
redirect_urls = [
  "https://favorites-shopify.lemoon.dev/auth/callback",
  "https://favorites-shopify.lemoon.dev/auth/session-token"
]

[app_proxy]
url = "https://favorites-shopify.lemoon.dev/apps/avise-me"
```

No [`.env.example`](../.env.example) (e no `.env` local, se existir):

```bash
SHOPIFY_APP_URL=https://favorites-shopify.lemoon.dev
```

Comentário no topo do `shopify.app.toml` (opcional): usa `favorites-shopify.lemoon.dev` na linha que descreve `PRODUCTION_APP_HOST`.

Os redirects OAuth seguem o template `@shopify/shopify-app-react-router` com `authPathPrefix: /auth`:

- `https://<host>/auth/callback`
- `https://<host>/auth/session-token`

## 2. Base de dados (PostgreSQL)

1. No Coolify, cria um serviço **PostgreSQL** (ou usa um gerido).
2. Copia a **connection string** para a variável **`DATABASE_URL`** no serviço da app Node (formato `postgresql://...`).
3. Localmente: Postgres a correr + `DATABASE_URL` no `.env`, depois:

```bash
npx prisma migrate deploy
```

(ou `npx prisma migrate dev` na primeira configuração do schema.)

A app em Docker corre `prisma migrate deploy` no arranque via `docker-start`.

## 3. Variáveis de ambiente no Coolify

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string PostgreSQL |
| `SHOPIFY_APP_URL` | Mesmo origin que `application_url` (https, sem barra final inconsistente) |
| `SHOPIFY_API_KEY` | Client ID (Partner) |
| `SHOPIFY_API_SECRET` | Client secret |
| `SCOPES` | `read_customers,write_customers,customer_read_customers,customer_write_customers` |
| `NODE_ENV` | `production` (o Dockerfile já define) |

**App nativo DLK (`POST /api/favorites`):**

| Variável | Exemplo DLK |
|----------|-------------|
| `CUSTOMER_ACCOUNT_SHOP_ID` | `81260708052` |
| `CUSTOMER_ACCOUNT_API_VERSION` | `2026-01` |
| `CUSTOMER_ACCOUNT_ALLOWED_CLIENT_IDS` | `c5a43d43-e85e-4947-b2bc-d2931b387d03` |
| `CUSTOMER_ACCOUNT_TOKEN_ISSUER` | `https://shopify.com/authentication/81260708052` |
| `FAVORITES_SHOP_DOMAIN` | `dlk-fitness-moda.myshopify.com` |

Opcional: `SHOP_CUSTOM_DOMAIN` — ver [`app/shopify.server.ts`](../app/shopify.server.ts).

## 4. Coolify (container)

1. Novo recurso a partir do **Git** (ex.: `favorites-shopify`).
2. **Dockerfile** na raiz do repo; porta interna **3000**.
3. Associa o **domínio** e ativa **HTTPS** (Let’s Encrypt).
4. Liga o Postgres e injeta as variáveis da tabela acima.
5. Faz deploy e verifica os logs: `prisma migrate deploy` deve passar; a seguir o servidor HTTP.

## 5. Shopify Partner e loja

1. No **Partner Dashboard**, confirma **App URL**, **Allowed redirection URL(s)** e **App proxy** alinhados com o `shopify.app.toml` (ou corre `shopify app deploy` para publicar a config).
2. **`shopify app deploy`** a partir do repo (extensões de tema + customer account + metafield declarado).
3. **Instala** a app na loja de produção; confirma que há linhas na tabela `Session` no Postgres.
4. **Tema:** ativa o bloco da extensão `favoritos-lemoon-theme` no tema publicado.
5. **Conta do cliente:** confirma as extensões de favoritos na área de conta.

## 6. Checklist pós-deploy

- Admin embedded abre (OAuth sem erro de redirect/host).
- Webhooks `app/uninstalled` e `scopes_update` acessíveis em `https://<host>/webhooks/...`.
- Coração no produto (app proxy `/apps/avise-me/register`) responde 200 e atualiza favoritos.
- Página de favoritos na conta + “Comprar todos” até ao carrinho da loja.

## 7. Proxy reverso

Se OAuth falhar, confirma que o proxy envia **`X-Forwarded-Proto: https`** e que `SHOPIFY_APP_URL` coincide com o host público (sem `http` em produção).
