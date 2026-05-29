import "@shopify/ui-extensions/preact";
import { useTranslate } from "@shopify/ui-extensions/customer-account/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

const CUSTOMER_ACCOUNT_API_VERSION = "2026-04";
const FAVORITES_NAMESPACE = "$app";
const FAVORITES_KEY = "favorites";
const PREVIEW_LIMIT = 4;

type ProductCard = {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  imageAlt: string;
  priceLabel: string;
};

type CustomerMetafieldResponse = {
  data?: {
    customer?: {
      metafield?: { value?: string | null } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
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
  const response = await fetch(
    `shopify://customer-account/api/${CUSTOMER_ACCOUNT_API_VERSION}/graphql.json`,
    {
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
    },
  );
  if (!response.ok) {
    throw new Error("Customer Account API request failed.");
  }
  const json = (await response.json()) as CustomerMetafieldResponse;
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return parseFavoriteIds(json.data?.customer?.metafield?.value);
}

async function fetchProductCards(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];

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
  return nodes
    .filter((node): node is ProductNode => Boolean(node && node.id && node.title))
    .map((node) => ({
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
    }));
}

type ExtensionState = {
  loading: boolean;
  items: ProductCard[];
  totalCount: number;
  error: string;
};

function Extension() {
  const i18n = useTranslate();

  const [state, setState] = useState<ExtensionState>({
    loading: true,
    items: [],
    totalCount: 0,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await fetchFavoriteIds();
        if (cancelled) return;
        if (!ids.length) {
          setState({ loading: false, items: [], totalCount: 0, error: "" });
          return;
        }
        const cards = await fetchProductCards(ids.slice(0, PREVIEW_LIMIT));
        if (cancelled) return;
        setState({
          loading: false,
          items: cards,
          totalCount: ids.length,
          error: "",
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          items: [],
          totalCount: 0,
          error:
            error instanceof Error
              ? error.message
              : i18n("errorFallback"),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n]);

  if (state.loading) {
    return (
      <s-stack gap="small-200">
        <s-heading>{i18n("heading")}</s-heading>
        <s-skeleton-paragraph content={i18n("loading")} />
      </s-stack>
    );
  }

  if (state.error) {
    return (
      <s-stack gap="small-200">
        <s-heading>{i18n("heading")}</s-heading>
        <s-banner tone="critical">{state.error}</s-banner>
      </s-stack>
    );
  }

  if (!state.items.length) {
    return (
      <s-stack gap="small-200">
        <s-heading>{i18n("heading")}</s-heading>
        <s-text>{i18n("empty")}</s-text>
        <s-button variant="primary" href="extension:customer-favorites-page/">
          {i18n("viewAll")}
        </s-button>
      </s-stack>
    );
  }

  return (
    <s-stack gap="small-200">
      <s-heading>{i18n("heading")}</s-heading>
      <s-grid
        gridTemplateColumns="repeat(auto-fill, minmax(160px, 1fr))"
        gap="small-200"
      >
        {state.items.map((item) => (
          <s-grid-item key={item.id}>
            <s-box padding="small-200" border="base" borderRadius="base">
              <s-stack gap="small-100">
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
                {item.url ? (
                  <s-button
                    variant="secondary"
                    href={item.url}
                    target="_blank"
                  >
                    {i18n("viewProduct")}
                  </s-button>
                ) : null}
              </s-stack>
            </s-box>
          </s-grid-item>
        ))}
      </s-grid>
      <s-button variant="primary" href="extension:customer-favorites-page/">
        {i18n("viewAll")}
      </s-button>
    </s-stack>
  );
}

export default async () => {
  render(<Extension />, document.body);
};
