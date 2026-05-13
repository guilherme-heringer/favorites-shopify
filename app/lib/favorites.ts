// The favorites metafield is declared in shopify.app.toml as
// `[customer.metafields.app.favorites]`, which resolves to the app's reserved
// namespace `$app` with key `favorites`. Definition is created and kept in
// sync automatically when the app is deployed; see Shopify docs:
// https://shopify.dev/docs/apps/build/custom-data/declarative-custom-data-definitions
export const FAVORITES_METAFIELD_NAMESPACE = "$app";
export const FAVORITES_METAFIELD_KEY = "favorites";
export const FAVORITES_METAFIELD_TYPE = "list.product_reference";

export function parseFavorites(rawValue: string | null | undefined): string[] {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (gid): gid is string =>
        typeof gid === "string" && gid.startsWith("gid://shopify/Product/"),
    );
  } catch {
    return [];
  }
}

export function toggleFavorite(
  current: string[],
  productGid: string,
): { next: string[]; action: "added" | "removed" } {
  const set = new Set(current);
  if (set.has(productGid)) {
    set.delete(productGid);
    return { next: Array.from(set), action: "removed" };
  }
  set.add(productGid);
  return { next: Array.from(set), action: "added" };
}
