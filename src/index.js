const REDIRECT_URI =
  "https://mysecondhorizon-threads.secondhorizon-official.workers.dev/oauth/callback";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      return new Response(
        `
<!DOCTYPE html>
<html>
<head>
  <title>Second Horizon</title>
</head>
<body style="font-family:Arial;padding:40px;">
  <h1>🚀 Second Horizon</h1>
  <p>Threads 연결을 시작합니다.</p>
  <a href="/oauth/start">
    <button>Connect Threads</button>
  </a>
</body>
</html>
        `,
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        }
      );
    }

    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
    
      if (error || !code || !state) {
        return Response.json(
          { ok: false, error: error || "Missing code or state" },
          { status: 400 }
        );
      }
    
      const savedState = await env.THREADS_KV.get(`oauth_state:${state}`);
    
      if (savedState !== "valid") {
        return Response.json(
          { ok: false, error: "Invalid or expired OAuth state" },
          { status: 400 }
        );
      }
    
      await env.THREADS_KV.delete(`oauth_state:${state}`);
    
      const form = new URLSearchParams({
        client_id: env.THREADS_APP_ID,
        client_secret: env.THREADS_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      });
    
      const tokenResponse = await fetch(
        "https://graph.threads.net/oauth/access_token",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form,
        }
      );
    
      const tokenData = await tokenResponse.json();
    
      if (!tokenResponse.ok || !tokenData.access_token) {
        return Response.json(
          {
            ok: false,
            error: "Token exchange failed",
            details: tokenData,
          },
          { status: 400 }
        );
      }
    
      await env.THREADS_KV.put(
        "threads_short_lived_token",
        JSON.stringify({
          access_token: tokenData.access_token,
          user_id: tokenData.user_id,
          saved_at: new Date().toISOString(),
        }),
        { expirationTtl: 3600 }
      );
    
      return Response.json({
        ok: true,
        token_received: true,
        user_id: tokenData.user_id,
      });
    }

    if (url.pathname === "/oauth/start") {
      const state = crypto.randomUUID();

      await env.THREADS_KV.put(`oauth_state:${state}`, "valid", {
        expirationTtl: 600,
      });

      const authUrl = new URL("https://threads.net/oauth/authorize");
      authUrl.searchParams.set("client_id", env.THREADS_APP_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set(
        "scope",
        "threads_basic,threads_content_publish"
      );
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);

      return Response.redirect(authUrl.toString(), 302);
    }

    return new Response("Second Horizon is running! 🚀");
  },
};
