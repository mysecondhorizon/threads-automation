import { config } from "../config.js";
import {
  getText,
  putJson,
  putText,
  deleteKey,
} from "../services/kv.js";
import { html, ok, fail, redirect } from "../utils/response.js";

export function handleConnectPage() {
  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Second Horizon</title>
</head>
<body style="font-family:Arial;padding:40px;">
  <h1>🚀 Second Horizon</h1>
  <p>Threads 연결을 시작합니다.</p>

  <a href="/oauth/start">
    <button type="button">Connect Threads</button>
  </a>
</body>
</html>`);
}

export async function handleOAuthStart(env) {
  const state = crypto.randomUUID();

  await putText(
    env,
    `oauth_state:${state}`,
    "valid",
    { expirationTtl: 600 }
  );

  const authUrl = new URL("https://threads.net/oauth/authorize");

  authUrl.searchParams.set("client_id", env.THREADS_APP_ID);
  authUrl.searchParams.set(
    "redirect_uri",
    config.oauth.redirectUri
  );
  authUrl.searchParams.set(
    "scope",
    config.oauth.scopes.join(",")
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  return redirect(authUrl.toString());
}

export async function handleOAuthCallback(url, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError || !code || !state) {
    return fail(
      oauthError || "Missing code or state",
      400
    );
  }

  const savedState = await getText(
    env,
    `oauth_state:${state}`
  );

  if (savedState !== "valid") {
    return fail("Invalid or expired OAuth state", 400);
  }

  await deleteKey(env, `oauth_state:${state}`);

  const form = new URLSearchParams({
    client_id: env.THREADS_APP_ID,
    client_secret: env.THREADS_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: config.oauth.redirectUri,
    code,
  });

  const response = await fetch(
    "https://graph.threads.net/oauth/access_token",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    return fail("Token exchange failed", 400, {
      details: data,
    });
  }

  await putJson(
    env,
    "threads_short_lived_token",
    {
      access_token: data.access_token,
      user_id: data.user_id,
      saved_at: new Date().toISOString(),
    },
    { expirationTtl: 3600 }
  );

  return ok({
    token_received: true,
    user_id: data.user_id,
  });
}
