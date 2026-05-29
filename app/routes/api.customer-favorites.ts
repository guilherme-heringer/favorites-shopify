import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { saveCustomerFavoriteIds } from "../lib/save-customer-favorites.server";

function shopFromSessionDest(dest: string): string {
  return new URL(dest).hostname;
}

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
  if (request.method === "OPTIONS") {
    return withExtensionCors(new Response(null, { status: 204 }));
  }

  const authResult = await authenticateCustomerAccount(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  return withExtensionCors(new Response(null, { status: 204 }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return withExtensionCors(new Response(null, { status: 204 }));
  }

  if (request.method !== "POST") {
    return withExtensionCors(
      Response.json(
        { ok: false, error: "Método não suportado." },
        { status: 405 },
      ),
    );
  }

  const authResult = await authenticateCustomerAccount(request);
  if ("response" in authResult) {
    return authResult.response;
  }

  const { sessionToken } = authResult;

  const customerGid = typeof sessionToken.sub === "string" ? sessionToken.sub : "";
  const dest = typeof sessionToken.dest === "string" ? sessionToken.dest : "";
  if (!customerGid || !dest) {
    return withExtensionCors(
      Response.json(
        { ok: false, error: "Cliente não autenticado." },
        { status: 401 },
      ),
    );
  }

  let body: { productIds?: unknown };
  try {
    body = (await request.json()) as { productIds?: unknown };
  } catch {
    return withExtensionCors(
      Response.json({ ok: false, error: "Payload inválido." }, { status: 400 }),
    );
  }

  const productIds = parseProductIds(body.productIds);
  if (!Array.isArray(body.productIds)) {
    return withExtensionCors(
      Response.json(
        { ok: false, error: "productIds é obrigatório." },
        { status: 400 },
      ),
    );
  }

  try {
    const shop = shopFromSessionDest(dest);
    const { admin } = await unauthenticated.admin(shop);
    await saveCustomerFavoriteIds(admin, customerGid, productIds);
    return withExtensionCors(
      Response.json({ ok: true, count: productIds.length }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao salvar favoritos.";
    console.error("[api/customer-favorites] error", {
      shop: shopFromSessionDest(dest),
      customerGid,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return withExtensionCors(
      Response.json({ ok: false, error: message }, { status: 500 }),
    );
  }
};
