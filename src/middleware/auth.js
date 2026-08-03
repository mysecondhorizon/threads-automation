import { getCookieValue } from "../utils/cookie.js";
import { fail } from "../utils/response.js";

export async function requireAdminSession(request, env) {
  const sessionId = getCookieValue(
    request,
    "admin_session"
  );

  if (!sessionId) {
    return {
      ok: false,
      response: Response.redirect(
        new URL("/admin/login", request.url).toString(),
        302
      ),
    };
  }

  const sessionValid = await env.THREADS_KV.get(
    `admin_session:${sessionId}`
  );

  if (sessionValid !== "valid") {
    return {
      ok: false,
      response: Response.redirect(
        new URL("/admin/login", request.url).toString(),
        302
      ),
    };
  }

  return {
    ok: true,
    sessionId,
  };
}

export async function requireAdminApiSession(
  request,
  env
) {
  const result = await requireAdminSession(
    request,
    env
  );

  if (result.ok) {
    return result;
  }

  return {
    ok: false,
    response: fail("Unauthorized", 401),
  };
}
