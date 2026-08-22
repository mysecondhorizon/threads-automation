import { getJson, putJson } from "../services/kv.js";
import { requireAdminApiSession } from "../middleware/auth.js";
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

  return ok({ token });
}

export async function handleTokenExchange(request, env) {
  const adminAuth = await requireAdminApiSession(request, env);
  if (!adminAuth.ok) return adminAuth.response;

  const savedToken = await getJson(
    env,
    "threads_short_lived_token"
  );

  if (!savedToken?.access_token) {
    return fail("Short-lived token not found", 400);
  }

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
      400,
      { details: data }
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
}

export async function handleProfile(request, env) {
  const adminAuth = await requireAdminApiSession(request, env);
  if (!adminAuth.ok) return adminAuth.response;

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
  } catch (error) {
    return fail(
      "Profile lookup failed",
      400,
      { details: error.details || null }
    );
  }
}
