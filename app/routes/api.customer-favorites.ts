import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import { authenticate, unauthenticated } from "../shopify.server";
import { saveCustomerFavoriteIds } from "../lib/save-customer-favorites.server";
import { getFavoritesShopDomain } from "../lib/customer-access-token.server";

function parseProductIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string =>
      typeof id === "string" && id.startsWith("gid://shopify/Product/"),
  );
}

function withExtensionCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonWithCors(
  body: Record<string, unknown>,
  init?: ResponseInit,
): Response {
  return withExtensionCors(Response.json(body, init));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Erro ao salvar favoritos.";
}

function handleRouteError(error: unknown): Response {
  if (error instanceof Response) {
    return withExtensionCors(error);
  }
  console.error("[api/customer-favorites] unhandled", error);
  return jsonWithCors(
    { ok: false, error: errorMessage(error) },
    { status: 500 },
  );
}

async function authenticateCustomerAccount(request: Request) {
  try {
    return await authenticate.public.customerAccount(request);
  } catch (error) {
    if (error instanceof Response) {
      return { response: withExtensionCors(error) };
    }
    throw error;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    if (request.method === "OPTIONS") {
      return withExtensionCors(new Response(null, { status: 204 }));
    }

    const authResult = await authenticateCustomerAccount(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    return withExtensionCors(new Response(null, { status: 204 }));
  } catch (error) {
    return handleRouteError(error);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    if (request.method === "OPTIONS") {
      return withExtensionCors(new Response(null, { status: 204 }));
    }

    if (request.method !== "POST") {
      return jsonWithCors(
        { ok: false, error: "Método não suportado." },
        { status: 405 },
      );
    }

    const authResult = await authenticateCustomerAccount(request);
    if ("response" in authResult) {
      return authResult.response;
    }

    const { sessionToken } = authResult;

    const customerGid =
      typeof sessionToken.sub === "string" ? sessionToken.sub : "";
    if (!customerGid) {
      return jsonWithCors(
        { ok: false, error: "Cliente não autenticado." },
        { status: 401 },
      );
    }

    let body: { productIds?: unknown };
    try {
      body = (await request.json()) as { productIds?: unknown };
    } catch {
      return jsonWithCors({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const productIds = parseProductIds(body.productIds);
    if (!Array.isArray(body.productIds)) {
      return jsonWithCors(
        { ok: false, error: "productIds é obrigatório." },
        { status: 400 },
      );
    }

    const shop = getFavoritesShopDomain();
    let admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];
    try {
      ({ admin } = await unauthenticated.admin(shop));
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        return jsonWithCors(
          {
            ok: false,
            error:
              "App não autenticada nesta loja. Abra a app no admin Shopify (Favoritos - Lemoon).",
          },
          { status: 503 },
        );
      }
      throw error;
    }

    await saveCustomerFavoriteIds(admin, customerGid, productIds);

    return jsonWithCors({ ok: true, count: productIds.length });
  } catch (error) {
    if (error instanceof Response) {
      console.error("[api/customer-favorites] response error", error.status);
      return jsonWithCors(
        { ok: false, error: "Erro ao autenticar com a loja." },
        { status: error.status >= 400 ? error.status : 500 },
      );
    }

    const message = errorMessage(error);
    console.error("[api/customer-favorites] error", { message, error });
    return jsonWithCors({ ok: false, error: message }, { status: 500 });
  }
};
