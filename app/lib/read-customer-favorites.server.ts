import {
  FAVORITES_METAFIELD_KEY,
  FAVORITES_METAFIELD_NAMESPACE,
  parseFavorites,
} from "./favorites";

type CustomerMetafieldQueryResponse = {
  data?: {
    customer?: {
      metafield?: { value?: string | null } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export async function readCustomerFavoriteIds(
  admin: AdminGraphqlClient,
  customerGid: string,
): Promise<string[]> {
  const response = await admin.graphql(
    `#graphql
      query CustomerFavorites($id: ID!, $namespace: String!, $key: String!) {
        customer(id: $id) {
          metafield(namespace: $namespace, key: $key) {
            value
          }
        }
      }`,
    {
      variables: {
        id: customerGid,
        namespace: FAVORITES_METAFIELD_NAMESPACE,
        key: FAVORITES_METAFIELD_KEY,
      },
    },
  );

  const json = (await response.json()) as CustomerMetafieldQueryResponse;
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return parseFavorites(json.data?.customer?.metafield?.value);
}
