import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  FAVORITES_METAFIELD_KEY,
  FAVORITES_METAFIELD_NAMESPACE,
  FAVORITES_METAFIELD_TYPE,
} from "../lib/favorites";

type DefinitionLookupResponse = {
  data?: {
    metafieldDefinitions?: {
      nodes?: Array<{ id: string }>;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query FavoritesDefinition($namespace: String!, $key: String!) {
        metafieldDefinitions(
          first: 1
          ownerType: CUSTOMER
          namespace: $namespace
          key: $key
        ) {
          nodes {
            id
          }
        }
      }`,
    {
      variables: {
        namespace: FAVORITES_METAFIELD_NAMESPACE,
        key: FAVORITES_METAFIELD_KEY,
      },
    },
  );

  const json = (await response.json()) as DefinitionLookupResponse;

  return {
    shop: session.shop,
    definitionId: json.data?.metafieldDefinitions?.nodes?.[0]?.id ?? null,
  };
};

export default function Index() {
  const { shop, definitionId } = useLoaderData<typeof loader>();
  const isReady = Boolean(definitionId);

  return (
    <s-page heading="Favoritos">
      <s-section heading="Customer favorites metafield">
        <s-paragraph>
          A app armazena os favoritos do cliente em um metafield declarado em{" "}
          <code>shopify.app.toml</code>. A definição é sincronizada
          automaticamente quando você executa <code>shopify app deploy</code>.
        </s-paragraph>
        <s-box padding="base">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <strong>Loja:</strong> {shop}
            </s-paragraph>
            <s-paragraph>
              <strong>Namespace:</strong> {FAVORITES_METAFIELD_NAMESPACE}
            </s-paragraph>
            <s-paragraph>
              <strong>Key:</strong> {FAVORITES_METAFIELD_KEY}
            </s-paragraph>
            <s-paragraph>
              <strong>Type:</strong> {FAVORITES_METAFIELD_TYPE}
            </s-paragraph>
            {isReady ? (
              <s-banner tone="success">
                Definição do metafield está pronta nesta loja.
              </s-banner>
            ) : (
              <s-banner tone="warning">
                A definição ainda não foi propagada. Faça um deploy com{" "}
                <code>shopify app deploy</code> para sincronizá-la.
              </s-banner>
            )}
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
