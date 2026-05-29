import "@shopify/shopify-api/adapters/node";
import { RequestedTokenType, shopifyApi } from "@shopify/shopify-api";
import type { Shopify } from "@shopify/shopify-api";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import shopify from "../shopify.server";

let apiInstance: Shopify | null = null;

function getShopifyApi(): Shopify {
  if (!apiInstance) {
    const appUrl = new URL(
      process.env.SHOPIFY_APP_URL || "https://favorites-shopify.lemoon.dev",
    );
    apiInstance = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY ?? "",
      apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
      apiVersion: ApiVersion.April26,
      scopes: process.env.SCOPES?.split(","),
      hostName: appUrl.host,
      hostScheme: appUrl.protocol.replace(":", ""),
      isEmbeddedApp: true,
      future: { unstable_managedPricingSupport: true },
    });
  }
  return apiInstance;
}

export function shopFromSessionDest(dest: string): string {
  return dest.replace(/^https:\/\//, "").split("/")[0];
}

function readBearerToken(request: Request): string {
  const header = request.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new Error("Token de sessão ausente.");
  }
  return match[1];
}

export type CustomerAccountAdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export async function adminForCustomerAccountRequest(
  request: Request,
  dest: string,
): Promise<CustomerAccountAdminClient> {
  const api = getShopifyApi();
  const shop = shopFromSessionDest(dest);
  const sessionToken = readBearerToken(request);

  const { session } = await api.auth.tokenExchange({
    shop,
    sessionToken,
    requestedTokenType: RequestedTokenType.OfflineAccessToken,
    expiring: true,
  });

  await shopify.sessionStorage.storeSession(session);

  const client = new api.clients.Graphql({ session });
  return {
    graphql: async (query, options) => {
      const apiResponse = await client.request(query, {
        variables: options?.variables,
      });
      return new Response(JSON.stringify(apiResponse));
    },
  };
}
