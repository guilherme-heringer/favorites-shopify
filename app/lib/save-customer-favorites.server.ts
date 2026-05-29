import {
  FAVORITES_METAFIELD_KEY,
  FAVORITES_METAFIELD_NAMESPACE,
  FAVORITES_METAFIELD_TYPE,
} from "./favorites";

type MetafieldsSetResponse = {
  data?: {
    metafieldsSet?: {
      userErrors?: Array<{ message: string }>;
    };
  };
  errors?: Array<{ message: string }>;
};

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export async function saveCustomerFavoriteIds(
  admin: AdminGraphqlClient,
  customerGid: string,
  productIds: string[],
): Promise<void> {
  const setResponse = await admin.graphql(
    `#graphql
      mutation SetFavorites($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
          }
          userErrors {
            field
            message
            code
          }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: customerGid,
            namespace: FAVORITES_METAFIELD_NAMESPACE,
            key: FAVORITES_METAFIELD_KEY,
            type: FAVORITES_METAFIELD_TYPE,
            value: JSON.stringify(productIds),
          },
        ],
      },
    },
  );

  const setJson = (await setResponse.json()) as MetafieldsSetResponse;
  if (setJson.errors?.length) {
    throw new Error(setJson.errors[0].message);
  }
  const userErrors = setJson.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(userErrors[0].message);
  }
}
