import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import { unauthenticated } from "../shopify.server";
import { applyFavoriteAction } from "../lib/favorites";
import {
  CustomerAccessTokenError,
  getFavoritesShopDomain,
  validateCustomerAccessToken,
} from "../lib/customer-access-token.server";
import { readCustomerFavoriteIds } from "../lib/read-customer-favorites.server";
import { saveCustomerFavoriteIds } from "../lib/save-customer-favorites.server";
import { normalizeProductGid } from "../lib/validation";

function jsonResponse(body: Record<string, unknown>, init?: ResponseInit) {
  return Response.json(body, init);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Erro ao salvar favoritos.";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  return jsonResponse({ ok: false, error: "Método não suportado." }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { ok: false, error: "Método não suportado." },
        { status: 405 },
      );
    }

    const { customerGid } = await validateCustomerAccessToken(request);

    let body: { productId?: unknown; action?: unknown };
    try {
      body = (await request.json()) as { productId?: unknown; action?: unknown };
    } catch {
      return jsonResponse({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const rawAction = body.action;
    if (rawAction !== "add" && rawAction !== "remove") {
      return jsonResponse(
        { ok: false, error: 'action deve ser "add" ou "remove".' },
        { status: 400 },
      );
    }

    let productGid: string;
    try {
      productGid = normalizeProductGid(String(body.productId ?? "").trim());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "productId inválido.";
      return jsonResponse({ ok: false, error: message }, { status: 400 });
    }

    const shop = getFavoritesShopDomain();
    let admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];
    try {
      ({ admin } = await unauthenticated.admin(shop));
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        return jsonResponse(
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

    const current = await readCustomerFavoriteIds(admin, customerGid);
    const { next, action: appliedAction } = applyFavoriteAction(
      current,
      productGid,
      rawAction,
    );

    if (appliedAction !== "unchanged") {
      await saveCustomerFavoriteIds(admin, customerGid, next);
    }

    return jsonResponse({
      ok: true,
      action: appliedAction,
      productId: productGid,
      favorites: next,
      count: next.length,
    });
  } catch (error) {
    if (error instanceof CustomerAccessTokenError) {
      return jsonResponse({ ok: false, error: error.message }, { status: 401 });
    }

    const message = errorMessage(error);
    console.error("[api/favorites] error", { message, error });
    return jsonResponse({ ok: false, error: message }, { status: 500 });
  }
};
