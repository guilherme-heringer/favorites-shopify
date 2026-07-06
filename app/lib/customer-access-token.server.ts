export class CustomerAccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerAccessTokenError";
  }
}

export function readAuthorizationToken(request: Request): string {
  const header = request.headers.get("Authorization")?.trim() ?? "";
  if (!header) {
    throw new CustomerAccessTokenError("Token ausente.");
  }
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    return bearerMatch[1].trim();
  }
  return header;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new CustomerAccessTokenError("Token inválido.");
  }
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new CustomerAccessTokenError("Token inválido.");
  }
}

function validateJwtClaims(payload: Record<string, unknown>): void {
  const exp = payload.exp;
  if (typeof exp === "number" && exp < Math.floor(Date.now() / 1000)) {
    throw new CustomerAccessTokenError("Token expirado.");
  }

  const allowedCids = (process.env.CUSTOMER_ACCOUNT_ALLOWED_CLIENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const cid = payload.cid;
  if (allowedCids.length > 0) {
    if (typeof cid !== "string" || !allowedCids.includes(cid)) {
      throw new CustomerAccessTokenError(
        "Token não autorizado para esta integração.",
      );
    }
  }

  const expectedIssuer = process.env.CUSTOMER_ACCOUNT_TOKEN_ISSUER?.trim();
  const iss = payload.iss;
  if (expectedIssuer) {
    if (typeof iss !== "string" || iss !== expectedIssuer) {
      throw new CustomerAccessTokenError("Token de loja inválido.");
    }
  }
}

function customerAccountGraphqlUrl(): string {
  const shopId = process.env.CUSTOMER_ACCOUNT_SHOP_ID?.trim();
  const version =
    process.env.CUSTOMER_ACCOUNT_API_VERSION?.trim() ?? "2026-01";
  if (!shopId) {
    throw new Error("CUSTOMER_ACCOUNT_SHOP_ID não configurado.");
  }
  return `https://shopify.com/${shopId}/account/customer/api/${version}/graphql`;
}

type CustomerIdResponse = {
  data?: { customer?: { id?: string | null } | null };
  errors?: Array<{ message: string }>;
};

export async function validateCustomerAccessToken(
  request: Request,
): Promise<{ customerGid: string }> {
  const accessToken = readAuthorizationToken(request);
  const payload = decodeJwtPayload(accessToken);
  validateJwtClaims(payload);

  const response = await fetch(customerAccountGraphqlUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: accessToken,
    },
    body: JSON.stringify({
      query: `query { customer { id } }`,
    }),
  });

  let json: CustomerIdResponse;
  try {
    json = (await response.json()) as CustomerIdResponse;
  } catch {
    throw new CustomerAccessTokenError("Token inválido ou expirado.");
  }

  if (!response.ok || json.errors?.length) {
    const message =
      json.errors?.[0]?.message ?? "Token inválido ou expirado.";
    throw new CustomerAccessTokenError(message);
  }

  const customerGid = json.data?.customer?.id;
  if (!customerGid || typeof customerGid !== "string") {
    throw new CustomerAccessTokenError("Token inválido ou expirado.");
  }

  const sub = payload.sub;
  if (typeof sub === "string" && sub !== customerGid) {
    throw new CustomerAccessTokenError("Token inválido.");
  }

  return { customerGid };
}

export function getFavoritesShopDomain(): string {
  const shop = process.env.FAVORITES_SHOP_DOMAIN?.trim();
  if (!shop) {
    throw new Error("FAVORITES_SHOP_DOMAIN não configurado.");
  }
  return shop;
}
