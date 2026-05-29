import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  FAVORITES_METAFIELD_KEY,
  FAVORITES_METAFIELD_NAMESPACE,
  parseFavorites,
  toggleFavorite,
} from "../lib/favorites";
import { saveCustomerFavoriteIds } from "../lib/save-customer-favorites.server";
import { normalizeProductGid } from "../lib/validation";

type CustomerMetafieldQueryResponse = {
  data?: {
    customer?: {
      metafield?: { value?: string | null } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let proxyAuth: Awaited<ReturnType<typeof authenticate.public.appProxy>>;
  try {
    proxyAuth = await authenticate.public.appProxy(request);
  } catch {
    return Response.json(
      { ok: false, error: "Falha de autenticação do app proxy." },
      { status: 401 },
    );
  }
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";

  const { session, admin } = proxyAuth;
  if (!session || !admin) {
    console.warn("[appProxy/register] no offline session", { shop });
    return Response.json(
      {
        ok: false,
        error:
          "App não autenticada nesta loja. Abra a app no admin Shopify (Apps → Favoritos - Lemoon) para reconectar.",
      },
      { status: 401 },
    );
  }

  const loggedInCustomerId = (
    url.searchParams.get("logged_in_customer_id") ?? ""
  ).trim();
  if (!loggedInCustomerId) {
    return Response.json({ ok: true, favorites: [] });
  }
  const customerGid = loggedInCustomerId.startsWith("gid://")
    ? loggedInCustomerId
    : `gid://shopify/Customer/${loggedInCustomerId}`;

  try {
    const r = await admin.graphql(
      `#graphql
        query CustomerFavoritesGet($id: ID!, $namespace: String!, $key: String!) {
          customer(id: $id) {
            metafield(namespace: $namespace, key: $key) {
              value
            }
          }
        }`,
      {
        variables: {
          id: customerGid,
          namespace: FAVORITES_METAFIELD_NAMESPACE,
          key: FAVORITES_METAFIELD_KEY,
        },
      },
    );
    const json = (await r.json()) as CustomerMetafieldQueryResponse;
    if (json.errors?.length) {
      return Response.json(
        { ok: false, error: json.errors[0].message },
        { status: 500 },
      );
    }
    const favorites = parseFavorites(json.data?.customer?.metafield?.value);
    return Response.json({ ok: true, favorites });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao ler favoritos.";
    console.error("[appProxy/register] loader error", {
      shop: session.shop,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "Método não suportado." },
      { status: 405 },
    );
  }

  let proxyAuth: Awaited<ReturnType<typeof authenticate.public.appProxy>>;
  try {
    proxyAuth = await authenticate.public.appProxy(request);
  } catch {
    return Response.json(
      { ok: false, error: "Falha de autenticação do app proxy." },
      { status: 401 },
    );
  }
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";

  const { session, admin } = proxyAuth;
  if (!session || !admin) {
    console.warn("[appProxy/register] no offline session", { shop });
    return Response.json(
      {
        ok: false,
        error:
          "App não autenticada nesta loja. Abra a app no admin Shopify (Apps → Favoritos - Lemoon) para reconectar.",
      },
      { status: 401 },
    );
  }

  // Customer identity is taken ONLY from the signed App Proxy query string.
  // Never trust a customer id sent in the request body.
  const loggedInCustomerId = (
    url.searchParams.get("logged_in_customer_id") ?? ""
  ).trim();
  if (!loggedInCustomerId) {
    return Response.json(
      { ok: false, error: "Cliente não autenticado." },
      { status: 401 },
    );
  }
  const customerGid = loggedInCustomerId.startsWith("gid://")
    ? loggedInCustomerId
    : `gid://shopify/Customer/${loggedInCustomerId}`;

  let body: { productId?: unknown };
  try {
    body = (await request.json()) as { productId?: unknown };
  } catch {
    return Response.json(
      { ok: false, error: "Payload inválido." },
      { status: 400 },
    );
  }

  const rawProductId = String(body.productId ?? "").trim();
  if (!rawProductId) {
    return Response.json(
      { ok: false, error: "productId é obrigatório." },
      { status: 400 },
    );
  }

  let productGid: string;
  try {
    productGid = normalizeProductGid(rawProductId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "productId inválido.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    const readResponse = await admin.graphql(
      `#graphql
        query CustomerFavorites($id: ID!, $namespace: String!, $key: String!) {
          customer(id: $id) {
            metafield(namespace: $namespace, key: $key) {
              value
            }
          }
        }`,
      {
        variables: {
          id: customerGid,
          namespace: FAVORITES_METAFIELD_NAMESPACE,
          key: FAVORITES_METAFIELD_KEY,
        },
      },
    );

    const readJson = (await readResponse.json()) as CustomerMetafieldQueryResponse;
    if (readJson.errors?.length) {
      return Response.json(
        { ok: false, error: readJson.errors[0].message },
        { status: 500 },
      );
    }

    const current = parseFavorites(readJson.data?.customer?.metafield?.value);
    const { next, action: toggleAction } = toggleFavorite(current, productGid);

    await saveCustomerFavoriteIds(admin, customerGid, next);

    return Response.json({
      ok: true,
      action: toggleAction,
      productId: productGid,
      count: next.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao salvar favorito.";
    console.error("[appProxy/register] error", {
      shop: session.shop,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};
