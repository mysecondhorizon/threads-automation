import {
  requireAdminApiSession,
} from "../middleware/auth.js";

import {
  getProducts,
  saveProduct,
  removeProduct,
} from "../services/products.js";

import {
  ok,
  fail,
} from "../utils/response.js";

export async function handleProducts(
  request,
  env
) {
  const auth =
    await requireAdminApiSession(
      request,
      env
    );

  if (!auth.ok) {
    return auth.response;
  }

  try {
    if (
      request.method === "GET"
    ) {
      return ok({
        products:
          await getProducts(
            env
          ),
      });
    }

    if (
      request.method === "POST"
    ) {
      const body =
        await request.json();

      const product =
        await saveProduct(
          env,
          body
        );

      return ok({
        product,
      });
    }

    if (
      request.method === "DELETE"
    ) {
      const body =
        await request.json();

      const removed =
        await removeProduct(
          env,
          body.id
        );

      return ok({
        removed,
      });
    }

    return fail(
      "Method Not Allowed",
      405
    );
  } catch (error) {
    console.error(
      error
    );

    return fail(
      error.message ||
        "Product API Error",
      400
    );
  }
}