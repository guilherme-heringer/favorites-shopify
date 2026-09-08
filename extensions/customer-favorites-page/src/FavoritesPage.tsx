import "@shopify/ui-extensions/preact";
import {
  useApi,
  useTranslate,
} from "@shopify/ui-extensions/customer-account/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

const CUSTOMER_ACCOUNT_API_VERSION = "2026-04";
const FAVORITES_NAMESPACE = "$app";
const FAVORITES_KEY = "favorites";
const CUSTOMER_ACCOUNT_GRAPHQL = `shopify://customer-account/api/${CUSTOMER_ACCOUNT_API_VERSION}/graphql.json`;
const APP_BACKEND_URL = "https://favorites-shopify.lemoon.dev";

type ProductVariant = {
  id: string;
  title: string;
  available: boolean;
};

type ProductCard = {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  imageAlt: string;
  priceLabel: string;
  variants: ProductVariant[];
};

type CustomerMetafieldResponse = {
  data?: {
    customer?: {
      metafield?: { value?: string | null } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

type SaveFavoritesResponse = {
  ok?: boolean;
  error?: string;
};

type ProductVariantNode = {
  id: string;
  title: string;
  availableForSale: boolean;
};

type SelectedVariantNode = {
  id: string;
  title: string;
  availableForSale: boolean;
};

type ProductNode = {
  __typename?: "Product";
  id: string;
  title: string;
  handle: string;
  onlineStoreUrl?: string | null;
  featuredImage?: { url?: string | null; altText?: string | null } | null;
  priceRange?: {
    minVariantPrice?: { amount?: string | null; currencyCode?: string | null } | null;
  } | null;
  selectedOrFirstAvailableVariant?: SelectedVariantNode | null;
  variants?: { nodes?: Array<ProductVariantNode | null> } | null;
};

type StorefrontNodesResponse = {
  data?: {
    shop?: { primaryDomain?: { url?: string | null } | null } | null;
    nodes?: Array<ProductNode | null>;
  };
  errors?: Array<{ message: string }>;
};

function parseFavoriteIds(rawValue?: string | null): string[] {
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

function formatPrice(amount?: string | null, currency?: string | null): string {
  if (!amount || !currency) return "";
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${amount} ${currency}`;
  }
}

async function fetchFavoriteIds(): Promise<string[]> {
  const response = await fetch(CUSTOMER_ACCOUNT_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query CustomerFavorites($namespace: String!, $key: String!) {
        customer {
          metafield(namespace: $namespace, key: $key) {
            value
          }
        }
      }`,
      variables: { namespace: FAVORITES_NAMESPACE, key: FAVORITES_KEY },
    }),
  });
  if (!response.ok) {
    throw new Error("Customer Account API request failed.");
  }
  const json = (await response.json()) as CustomerMetafieldResponse;
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return parseFavoriteIds(json.data?.customer?.metafield?.value);
}

async function saveFavoriteIds(nextIds: string[]): Promise<void> {
  const token = await shopify.sessionToken.get();
  let response: Response;
  try {
    response = await fetch(`${APP_BACKEND_URL}/api/customer-favorites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ productIds: nextIds }),
    });
  } catch {
    throw new Error("Failed to save favorites.");
  }
  let json: SaveFavoritesResponse = {};
  try {
    json = (await response.json()) as SaveFavoritesResponse;
  } catch {
    // ignore parse errors
  }
  if (!response.ok || !json.ok) {
    throw new Error(json.error || "Failed to save favorites.");
  }
}

async function fetchProductCardsAndShop(ids: string[]): Promise<{
  cards: ProductCard[];
  primaryDomain: string;
}> {
  if (!ids.length) return { cards: [], primaryDomain: "" };

  const result = await shopify.query<StorefrontNodesResponse["data"]>(
    `query FavoriteProducts($ids: [ID!]!) {
      shop {
        primaryDomain {
          url
        }
      }
      nodes(ids: $ids) {
        __typename
        ... on Product {
          id
          title
          handle
          onlineStoreUrl
          featuredImage {
            url
            altText
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          selectedOrFirstAvailableVariant {
            id
            title
            availableForSale
          }
          variants(first: 100) {
            nodes {
              id
              title
              availableForSale
            }
          }
        }
      }
    }`,
    { variables: { ids } },
  );

  const primaryDomain = (result.data?.shop?.primaryDomain?.url ?? "").replace(
    /\/$/,
    "",
  );
  const nodes = result.data?.nodes ?? [];
  const cards = nodes
    .filter((node): node is ProductNode => Boolean(node && node.id && node.title))
    .map((node) => {
      const variantsFromList = (node.variants?.nodes ?? [])
        .filter((v): v is ProductVariantNode => Boolean(v && v.id))
        .map((v) => ({
          id: v.id,
          title: v.title,
          available: v.availableForSale,
        }));
      const fallbackVariant = node.selectedOrFirstAvailableVariant?.id
        ? [
            {
              id: node.selectedOrFirstAvailableVariant.id,
              title: node.selectedOrFirstAvailableVariant.title,
              available: node.selectedOrFirstAvailableVariant.availableForSale,
            },
          ]
        : [];
      const variants =
        variantsFromList.length > 0 ? variantsFromList : fallbackVariant;

      return {
        id: node.id,
        title: node.title,
        url:
          node.onlineStoreUrl ||
          (primaryDomain && node.handle
            ? `${primaryDomain}/products/${node.handle}`
            : ""),
        imageUrl: node.featuredImage?.url || "",
        imageAlt: node.featuredImage?.altText || node.title,
        priceLabel: formatPrice(
          node.priceRange?.minVariantPrice?.amount,
          node.priceRange?.minVariantPrice?.currencyCode,
        ),
        variants,
      };
    });

  return { cards, primaryDomain };
}

function legacyVariantId(gid: string): string {
  const match = gid.match(/(\d+)$/);
  return match ? match[1] : "";
}

/** First in-stock variant, else first variant (so selection always has a GID when the product has variants). */
function pickDefaultVariantId(item: ProductCard): string {
  const available = item.variants.filter((v) => v.available);
  if (available[0]?.id) return available[0].id;
  return item.variants[0]?.id ?? "";
}

/**
 * Online Store cart permalink (Shopify: /cart/{variant_id}:{qty},...).
 * Recomputed whenever selection changes; navigate with location.assign (same tab)
 * so commas in the path are not mangled by component href handling.
 */
function buildCartUrl(primaryDomain: string, variantGids: string[]): string {
  if (!primaryDomain || !variantGids.length) return "";
  const base = primaryDomain.replace(/\/$/, "");
  const quantities = new Map<string, number>();
  for (const gid of variantGids) {
    const legacyId = legacyVariantId(gid);
    if (!legacyId) continue;
    quantities.set(legacyId, (quantities.get(legacyId) ?? 0) + 1);
  }
  if (!quantities.size) return "";
  const segments = [...quantities.entries()].map(
    ([variantId, quantity]) => `${variantId}:${quantity}`,
  );
  return `${base}/cart/${segments.join(",")}`;
}

type ExtensionState = {
  loading: boolean;
  items: ProductCard[];
  primaryDomain: string;
  error: string;
};

type Selection = { selected: boolean; variantId: string };

function Extension() {
  const translate = useTranslate();
  const { i18n } = useApi();

  const [state, setState] = useState<ExtensionState>({
    loading: true,
    items: [],
    primaryDomain: "",
    error: "",
  });

  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [favoritesUpdateLoading, setFavoritesUpdateLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await fetchFavoriteIds();
        if (cancelled) return;
        const { cards, primaryDomain } = await fetchProductCardsAndShop(ids);
        if (cancelled) return;
        setState({
          loading: false,
          items: cards,
          primaryDomain,
          error: "",
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          items: [],
          primaryDomain: "",
          error:
            error instanceof Error
              ? error.message
              : translate("errorFallback"),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const next: Record<string, Selection> = {};
    for (const item of state.items) {
      next[item.id] = {
        selected: false,
        variantId: pickDefaultVariantId(item),
      };
    }
    setSelection(next);
  }, [state.items]);

  const cartVariantIds = state.items
    .map((item) => ({
      item,
      variantId: selection[item.id]?.variantId ?? "",
      selected: selection[item.id]?.selected ?? false,
    }))
    .filter(
      (row) =>
        row.selected &&
        row.variantId &&
        row.item.variants.some(
          (v) => v.id === row.variantId && v.available,
        ),
    )
    .map((row) => row.variantId);
  const selectedItemIds = state.items
    .filter((item) => {
      const sel = selection[item.id]?.selected;
      const variantId = selection[item.id]?.variantId ?? "";
      return (
        Boolean(sel) &&
        Boolean(variantId) &&
        item.variants.some((v) => v.id === variantId && v.available)
      );
    })
    .map((item) => item.id);
  const selectedCount = cartVariantIds.length;
  const selectedForRemovalCount = selectedItemIds.length;

  const cartUrl = buildCartUrl(state.primaryDomain, cartVariantIds);
  const showBuyAll =
    selectedCount > 0 &&
    Boolean(cartUrl) &&
    cartVariantIds.every((gid) => legacyVariantId(gid));
  const showRemoveAll = selectedForRemovalCount > 0;

  const removeFavorites = async (idsToRemove: string[]) => {
    if (!idsToRemove.length || favoritesUpdateLoading) return;
    const removeSet = new Set(idsToRemove);
    const nextItems = state.items.filter((item) => !removeSet.has(item.id));
    const previousItems = state.items;
    const previousSelection = selection;
    const nextSelection: Record<string, Selection> = {};
    for (const item of nextItems) {
      const previous = selection[item.id];
      nextSelection[item.id] = {
        selected: previous?.selected ?? false,
        variantId: previous?.variantId || pickDefaultVariantId(item),
      };
    }
    setFavoritesUpdateLoading(true);
    setState((prev) => ({ ...prev, items: nextItems, error: "" }));
    setSelection(nextSelection);
    try {
      await saveFavoriteIds(nextItems.map((item) => item.id));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        items: previousItems,
        error:
          error instanceof Error ? error.message : translate("favoritesUpdateError"),
      }));
      setSelection(previousSelection);
    } finally {
      setFavoritesUpdateLoading(false);
    }
  };

  return (
    <s-page heading={translate("page.heading")}>
      {showRemoveAll ? (
        <s-button
          slot="secondary-actions"
          variant="secondary"
          type="button"
          disabled={favoritesUpdateLoading}
          onClick={() => {
            void removeFavorites(selectedItemIds);
          }}
        >
          {favoritesUpdateLoading
            ? translate("removeAll.loading")
            : translate("removeAll.cta")}
        </s-button>
      ) : null}
      {showBuyAll ? (
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={(event: Event) => {
            event.preventDefault();
            if (cartUrl) globalThis.location.assign(cartUrl);
          }}
        >
          {translate("buyAll.cta")}
        </s-button>
      ) : null}
      <s-section heading={translate("section.heading")}>
        {state.loading ? (
          <s-skeleton-paragraph content={translate("loading")} />
        ) : state.error && !state.items.length ? (
          <s-banner tone="critical">{state.error}</s-banner>
        ) : !state.items.length ? (
          <s-text>{translate("empty")}</s-text>
        ) : (
          <s-stack gap="small-200">
            {state.error ? (
              <s-banner tone="critical">{state.error}</s-banner>
            ) : null}
            {cartUrl ? (
              <s-text type="strong">
                {`${i18n.formatNumber(selectedCount)} ${translate("buyAll.selectedSuffix")}`}
              </s-text>
            ) : null}
          <s-grid
            gridTemplateColumns="repeat(auto-fill, minmax(220px, 1fr))"
            gap="base"
          >
            {state.items.map((item) => {
              const allVariants = item.variants;
              const selectableVariants = allVariants;
              const canPurchase = selectableVariants.some((v) => v.available);
              const showVariantPicker = selectableVariants.length > 1;
              const itemSelection = selection[item.id];
              return (
                <s-grid-item key={item.id}>
                  <s-box padding="base" border="base" borderRadius="base">
                    <s-stack gap="small-200">
                      {selectableVariants.length > 0 ? (
                        <s-checkbox
                          label={translate("select")}
                          checked={Boolean(
                            canPurchase && itemSelection?.selected,
                          )}
                          disabled={!canPurchase}
                          onChange={(event) => {
                            if (!canPurchase) {
                              event.preventDefault();
                              return;
                            }
                            const target =
                              event.currentTarget as HTMLInputElement;
                            const checked = target.checked;
                            setSelection((prev) => {
                              const previous = prev[item.id];
                              const resolvedVariant =
                                previous?.variantId ||
                                pickDefaultVariantId(item);
                              return {
                                ...prev,
                                [item.id]: {
                                  selected: checked,
                                  variantId: resolvedVariant,
                                },
                              };
                            });
                          }}
                        />
                      ) : null}
                      {item.imageUrl ? (
                        <s-image
                          src={item.imageUrl}
                          alt={item.imageAlt}
                          aspectRatio="1/1"
                          objectFit="cover"
                          loading="lazy"
                        />
                      ) : null}
                      {item.url ? (
                        <s-link href={item.url} target="_blank">
                          {item.title}
                        </s-link>
                      ) : (
                        <s-text type="strong">{item.title}</s-text>
                      )}
                      {item.priceLabel ? (
                        <s-text>{item.priceLabel}</s-text>
                      ) : null}
                      {!canPurchase && selectableVariants.length > 0 ? (
                        <s-banner tone="warning">
                          {translate("outOfStockNotice")}
                        </s-banner>
                      ) : null}
                      {showVariantPicker ? (
                        <s-stack
                          direction="inline"
                          gap="small-100"
                          wrap="wrap"
                        >
                          {selectableVariants.map((variant) => {
                            const isActive =
                              itemSelection?.variantId === variant.id;
                            return (
                              <s-button
                                key={variant.id}
                                variant={isActive ? "primary" : "secondary"}
                                disabled={!variant.available}
                                onClick={() =>
                                  setSelection((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      selected:
                                        prev[item.id]?.selected ?? false,
                                      variantId: variant.id,
                                    },
                                  }))
                                }
                              >
                                <s-text type="small">{variant.title}</s-text>
                              </s-button>
                            );
                          })}
                        </s-stack>
                      ) : null}
                      {item.url ? (
                        <s-button
                          variant="secondary"
                          href={item.url}
                          target="_blank"
                        >
                          {translate("viewProduct")}
                        </s-button>
                      ) : null}
                      <s-button
                        variant="tertiary"
                        type="button"
                        disabled={favoritesUpdateLoading}
                        onClick={() => {
                          void removeFavorites([item.id]);
                        }}
                      >
                        {translate("removeOne")}
                      </s-button>
                    </s-stack>
                  </s-box>
                </s-grid-item>
              );
            })}
          </s-grid>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export default async () => {
  render(<Extension />, document.body);
};
