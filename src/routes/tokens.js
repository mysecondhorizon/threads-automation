import { getJson, putJson } from "../services/kv.js";
import { requireAdminApiSession } from "../middleware/auth.js";
import { requireSameOriginPost } from "../middleware/request-origin.js";
import { getThreadsProfile } from "../services/threads.js";
import { ok, fail } from "../utils/response.js";

export async function handleShortToken(request, env) {
  const adminAuth = await requireAdminApiSession(request, env);
  if (!adminAuth.ok) return adminAuth.response;

  const token = await getJson(
    env,
    "threads_short_lived_token"
  );

  if (!token) {
    return fail("Short-lived token not found", 404);
  }

  if (token.sessionId !== adminAuth.sessionId) return fail("Token unavailable", 404);
  const response = ok({ token_received: true });
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function handleTokenExchange(request, env) {
  const adminAuth = await requireAdminApiSession(request, env);
  if (!adminAuth.ok) return adminAuth.response;

  const denied = requireSameOriginPost(request);
  if (denied) return denied;

  const savedToken = await getJson(
    env,
    "threads_short_lived_token"
  );

  if (!savedToken?.access_token || savedToken.sessionId !== adminAuth.sessionId) {
    return fail("Short-lived token not found", 400);
  }

  try {
    const exchangeUrl = new URL(
      "https://graph.threads.net/access_token"
    );

    exchangeUrl.searchParams.set(
      "grant_type",
      "th_exchange_token"
    );
    exchangeUrl.searchParams.set(
      "client_secret",
      env.THREADS_APP_SECRET
    );
    exchangeUrl.searchParams.set(
      "access_token",
      savedToken.access_token
    );

    const response = await fetch(exchangeUrl);
    const data = await response.json();

    if (!response.ok || !data.access_token) {
      return fail(
        "Long-lived token exchange failed",
        400
      );
    }

    await putJson(env, "threads_auth", {
      access_token: data.access_token,
      user_id: savedToken.user_id,
      token_type: data.token_type,
      expires_in: data.expires_in,
      saved_at: new Date().toISOString(),
    });

    return ok({
      long_lived_token_saved: true,
      user_id: savedToken.user_id,
      expires_in: data.expires_in,
    });
  } catch {
    return fail("Long-lived token exchange failed", 400);
  }
}

export async function handleProfile(request, env) {
  const adminAuth = await requireAdminApiSession(request, env);
  if (!adminAuth.ok) return adminAuth.response;

  const denied = requireSameOriginPost(request);
  if (denied) return denied;

  const auth = await getJson(env, "threads_auth");

  if (!auth?.access_token) {
    return fail("Long-lived token not found", 400);
  }

  try {
    const profile = await getThreadsProfile(
      auth.access_token
    );

    await putJson(env, "threads_auth", {
      ...auth,
      user_id: profile.id,
      username: profile.username,
      updated_at: new Date().toISOString(),
    });

    return ok({ profile });
  } catch {
    return fail(
      "Profile lookup failed",
      400
    );
  }
}
