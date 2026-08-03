import { getThreadsProfile } from "./threads.js";

export async function handleShortToken(env) {
  const token = await env.THREADS_KV.get(
    "threads_short_lived_token"
  );

  if (!token) {
    return Response.json({
      ok: false,
      message: "No token found",
    });
  }

  return Response.json(JSON.parse(token));
}

export async function handleTokenExchange(env) {
  const savedToken = await env.THREADS_KV.get(
    "threads_short_lived_token",
    "json"
  );

  if (!savedToken?.access_token) {
    return Response.json(
      { ok: false, error: "Short-lived token not found" },
      { status: 400 }
    );
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
    return Response.json(
      {
        ok: false,
        error: "Long-lived token exchange failed",
        details: data,
      },
      { status: 400 }
    );
  }

  await env.THREADS_KV.put(
    "threads_auth",
    JSON.stringify({
      access_token: data.access_token,
      user_id: savedToken.user_id,
      token_type: data.token_type,
      expires_in: data.expires_in,
      saved_at: new Date().toISOString(),
    })
  );

  return Response.json({
    ok: true,
    long_lived_token_saved: true,
    user_id: savedToken.user_id,
    expires_in: data.expires_in,
  });
}

export async function handleProfile(env) {
  const auth = await env.THREADS_KV.get(
    "threads_auth",
    "json"
  );

  if (!auth?.access_token) {
    return Response.json(
      { ok: false, error: "Long-lived token not found" },
      { status: 400 }
    );
  }

  try {
    const profile = await getThreadsProfile(
      auth.access_token
    );

    await env.THREADS_KV.put(
      "threads_auth",
      JSON.stringify({
        ...auth,
        user_id: profile.id,
        username: profile.username,
        updated_at: new Date().toISOString(),
      })
    );

    return Response.json({
      ok: true,
      profile,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "Profile lookup failed",
        details: error.details || null,
      },
      { status: 400 }
    );
  }
}
