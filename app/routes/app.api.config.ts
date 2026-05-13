import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
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
  const { admin } = await authenticate.admin(request);

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

  return Response.json({
    namespace: FAVORITES_METAFIELD_NAMESPACE,
    key: FAVORITES_METAFIELD_KEY,
    type: FAVORITES_METAFIELD_TYPE,
    definitionId: json.data?.metafieldDefinitions?.nodes?.[0]?.id ?? null,
  });
};
