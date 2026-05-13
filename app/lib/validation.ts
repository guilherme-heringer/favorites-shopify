const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const METAFIELD_PART_RE = /^[a-zA-Z0-9_-]{2,64}$/;

export function isValidShopDomain(value: string): boolean {
  return SHOP_RE.test(value);
}

export function isValidMetafieldPart(value: string): boolean {
  return METAFIELD_PART_RE.test(value);
}

export function normalizeVariantGid(input: string): string {
  if (input.startsWith("gid://shopify/ProductVariant/")) {
    return input;
  }

  const maybeNumeric = input.trim();
  if (!/^\d+$/.test(maybeNumeric)) {
    throw new Error("variantId inválido");
  }
  return `gid://shopify/ProductVariant/${maybeNumeric}`;
}

export function normalizeProductGid(input: string): string {
  if (input.startsWith("gid://shopify/Product/")) {
    return input;
  }

  const maybeNumeric = input.trim();
  if (!/^\d+$/.test(maybeNumeric)) {
    throw new Error("productId inválido");
  }
  return `gid://shopify/Product/${maybeNumeric}`;
}
